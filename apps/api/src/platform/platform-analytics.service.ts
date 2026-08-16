import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import {
  clampLimit,
  fillBuckets,
  money,
  resolvePeriod,
  share,
  toNum,
  type Granularity,
  type ResolvedPeriod,
} from './analytics.util.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Сколько строк реестра платежей отдаём по умолчанию и максимум (для выгрузки). */
const LEDGER_DEFAULT = 500;
const LEDGER_MAX = 20_000;

export interface AnalyticsQuery {
  from?: string;
  to?: string;
  granularity?: string;
  clientId?: string;
  limit?: string | number;
}

export interface TrendPoint {
  bucket: string;
  label: string;
  turnover: number;
  commission: number;
  paymentsCount: number;
  payers: number;
  refunded: number;
}

/**
 * Детальная аналитика платформы для владельца: кто из клиентов сколько
 * заработал, какие каналы это принесли и кто конкретно кому заплатил.
 *
 * Денежные правила во всех разрезах одинаковы и от этого прозрачны:
 *  • оборот  — сумма платежей клиента в статусе succeeded за период;
 *  • комиссия — оборот × commission_pct тарифа платформы, на котором клиент;
 *  • «клиенту остаётся» — оборот минус комиссия;
 *  • оборот канала — доля платежа по тарифу, делённая поровну между каналами,
 *    входящими в этот тариф (сумма долей по каналам = обороту клиента);
 *  • «оборот тарифов канала» (gross) — те же платежи целиком, без деления;
 *    по каналам одного тарифа он пересекается и складывать его нельзя.
 */
@Injectable()
export class PlatformAnalyticsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Полный отчёт: итоги, динамика, клиенты, каналы, реестр платежей, расчёты. */
  async report(query: AnalyticsQuery = {}) {
    const period = resolvePeriod(query);
    const clientId = typeof query.clientId === 'string' && UUID_RE.test(query.clientId)
      ? query.clientId
      : null;
    const limit = clampLimit(query.limit, LEDGER_DEFAULT, LEDGER_MAX);

    // Последовательно, а не Promise.all: запросов немного, зато порядок
    // обращений к БД детерминирован и читается сверху вниз.
    const totals = await this.totals(period, clientId);
    const trend = await this.trend(period, clientId);
    const clients = await this.byClient(period, clientId);
    const channels = await this.byChannel(period, clientId);
    const providers = await this.byProvider(period, clientId);
    const ledger = await this.ledger(period, clientId, limit);
    const settlements = await this.settlements(period, clientId);

    const settlementTotals = settlements.reduce(
      (acc, s) => {
        acc.invoiced += s.amount;
        if (s.status === 'paid') acc.paid += s.amount;
        if (s.status === 'pending' || s.status === 'overdue') acc.due += s.amount;
        return acc;
      },
      { invoiced: 0, paid: 0, due: 0 },
    );

    return {
      period: {
        from: period.from,
        to: period.to,
        granularity: period.granularity,
        days: period.days,
      },
      filters: { clientId },
      totals: {
        ...totals,
        invoicedToClients: money(settlementTotals.invoiced),
        paidByClients: money(settlementTotals.paid),
        dueFromClients: money(settlementTotals.due),
      },
      trend,
      clients,
      channels,
      providers,
      ledger: { rows: ledger, limit, truncated: ledger.length >= limit },
      settlements,
      /** Как считается каждая цифра — показываем в интерфейсе, чтобы не было вопросов. */
      methodology: {
        turnover: 'Сумма платежей подписчиков в статусе succeeded за выбранный период.',
        commission:
          'Оборот клиента × ставка комиссии его тарифа платформы (commission_pct) на момент запроса.',
        clientNet: 'Оборот клиента минус комиссия платформы.',
        channelTurnover:
          'Платёж по тарифу делится поровну между каналами, входящими в тариф; сумма долей равна обороту.',
        channelGross:
          'Полные суммы платежей по тарифам, куда входит канал. Пересекается между каналами одного тарифа — складывать нельзя.',
        settlements:
          'Счета платформы клиентам, период которых пересекается с выбранным диапазоном.',
      },
    };
  }

  // ─── Запросы ───────────────────────────────────────────────────────────────

  private clientFilter(clientId: string | null, column = 'p.client_id'): SQL {
    return clientId ? sql`and ${sql.raw(column)} = ${clientId}` : sql``;
  }

  /** Итоги периода: оборот, комиссия, платежи, плательщики, возвраты. */
  private async totals(period: ResolvedPeriod, clientId: string | null) {
    const rows = await this.db.execute<{
      turnover: string;
      commission: string;
      payments_count: string;
      payers: string;
      refunded: string;
      refunds_count: string;
      failed_count: string;
      paying_clients: string;
    }>(sql`
      select
        coalesce(sum(p.amount) filter (where p.status = 'succeeded'), 0)::text as turnover,
        coalesce(sum(p.amount * pp.commission_pct / 100)
          filter (where p.status = 'succeeded'), 0)::text as commission,
        count(*) filter (where p.status = 'succeeded')::text as payments_count,
        count(distinct p.subscriber_id) filter (where p.status = 'succeeded')::text as payers,
        coalesce(sum(p.amount) filter (where p.status = 'refunded'), 0)::text as refunded,
        count(*) filter (where p.status = 'refunded')::text as refunds_count,
        count(*) filter (where p.status = 'failed')::text as failed_count,
        count(distinct p.client_id) filter (where p.status = 'succeeded')::text as paying_clients
      from payments p
      join clients c on c.id = p.client_id
      join platform_plans pp on pp.id = c.platform_plan_id
      where p.created_at >= ${period.from} and p.created_at < ${period.toExclusive}
        ${this.clientFilter(clientId)}
    `);

    const r = rows[0] ?? ({} as Record<string, string>);
    const turnover = money(toNum(r.turnover));
    const commission = money(toNum(r.commission));
    const paymentsCount = toNum(r.payments_count);
    return {
      turnover,
      commission,
      clientNet: money(turnover - commission),
      paymentsCount,
      payers: toNum(r.payers),
      payingClients: toNum(r.paying_clients),
      avgCheck: paymentsCount ? money(turnover / paymentsCount) : 0,
      refunded: money(toNum(r.refunded)),
      refundsCount: toNum(r.refunds_count),
      failedCount: toNum(r.failed_count),
      effectiveCommissionPct: share(commission, turnover),
    };
  }

  /** Динамика по корзинам времени (день/неделя/месяц) с достройкой пустых. */
  private async trend(period: ResolvedPeriod, clientId: string | null): Promise<TrendPoint[]> {
    const unit = sql.raw(`'${period.granularity as Granularity}'`);
    const rows = await this.db.execute<{
      bucket: string;
      turnover: string;
      commission: string;
      payments_count: string;
      payers: string;
      refunded: string;
    }>(sql`
      select
        to_char(date_trunc(${unit}, p.created_at at time zone 'UTC'), 'YYYY-MM-DD') as bucket,
        coalesce(sum(p.amount) filter (where p.status = 'succeeded'), 0)::text as turnover,
        coalesce(sum(p.amount * pp.commission_pct / 100)
          filter (where p.status = 'succeeded'), 0)::text as commission,
        count(*) filter (where p.status = 'succeeded')::text as payments_count,
        count(distinct p.subscriber_id) filter (where p.status = 'succeeded')::text as payers,
        coalesce(sum(p.amount) filter (where p.status = 'refunded'), 0)::text as refunded
      from payments p
      join clients c on c.id = p.client_id
      join platform_plans pp on pp.id = c.platform_plan_id
      where p.created_at >= ${period.from} and p.created_at < ${period.toExclusive}
        ${this.clientFilter(clientId)}
      group by 1
      order by 1
    `);

    return fillBuckets(
      period,
      Array.from(rows).map((r) => ({
        bucket: String(r.bucket),
        turnover: money(toNum(r.turnover)),
        commission: money(toNum(r.commission)),
        paymentsCount: toNum(r.payments_count),
        payers: toNum(r.payers),
        refunded: money(toNum(r.refunded)),
      })),
      { turnover: 0, commission: 0, paymentsCount: 0, payers: 0, refunded: 0 },
    );
  }

  /** Разрез по клиентам: тариф, каналы, подписки, оборот, комиссия, остаток. */
  private async byClient(period: ResolvedPeriod, clientId: string | null) {
    const rows = await this.db.execute<Record<string, string | null>>(sql`
      select
        c.id::text as id,
        c.name as name,
        c.plan_status as plan_status,
        to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ') as created_at,
        pp.code as plan_code,
        pp.name as plan_name,
        pp.commission_pct::text as commission_pct,
        pp.price_month::text as price_month,
        (select count(*) from channels ch where ch.client_id = c.id)::text as channels,
        (select count(*) from plans pl where pl.client_id = c.id and pl.is_active)::text as plans,
        (select count(*) from subscriptions s
          where s.client_id = c.id and s.status in ('active','trial','grace'))::text as active_subs,
        coalesce(t.turnover, 0)::text as turnover,
        coalesce(t.payments_count, 0)::text as payments_count,
        coalesce(t.payers, 0)::text as payers,
        coalesce(t.refunded, 0)::text as refunded,
        to_char(t.last_payment_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ') as last_payment_at
      from clients c
      join platform_plans pp on pp.id = c.platform_plan_id
      left join lateral (
        select
          sum(p.amount) filter (where p.status = 'succeeded') as turnover,
          count(*) filter (where p.status = 'succeeded') as payments_count,
          count(distinct p.subscriber_id) filter (where p.status = 'succeeded') as payers,
          sum(p.amount) filter (where p.status = 'refunded') as refunded,
          max(p.created_at) filter (where p.status = 'succeeded') as last_payment_at
        from payments p
        where p.client_id = c.id
          and p.created_at >= ${period.from} and p.created_at < ${period.toExclusive}
      ) t on true
      where true ${this.clientFilter(clientId, 'c.id')}
      order by coalesce(t.turnover, 0) desc, c.name asc
    `);

    return Array.from(rows).map((r) => {
      const turnover = money(toNum(r.turnover));
      const pct = toNum(r.commission_pct);
      const commission = money((turnover * pct) / 100);
      const paymentsCount = toNum(r.payments_count);
      return {
        id: String(r.id),
        name: String(r.name),
        planCode: r.plan_code ? String(r.plan_code) : null,
        planName: r.plan_name ? String(r.plan_name) : null,
        planStatus: r.plan_status ? String(r.plan_status) : null,
        commissionPct: pct,
        priceMonth: money(toNum(r.price_month)),
        channels: toNum(r.channels),
        plans: toNum(r.plans),
        activeSubscriptions: toNum(r.active_subs),
        turnover,
        commission,
        clientNet: money(turnover - commission),
        paymentsCount,
        payers: toNum(r.payers),
        avgCheck: paymentsCount ? money(turnover / paymentsCount) : 0,
        refunded: money(toNum(r.refunded)),
        lastPaymentAt: r.last_payment_at ?? null,
        createdAt: r.created_at ?? null,
      };
    });
  }

  /** Разрез по каналам: название канала, его клиент, подписки и оборот. */
  private async byChannel(period: ResolvedPeriod, clientId: string | null) {
    const rows = await this.db.execute<Record<string, string | null>>(sql`
      with plan_size as (
        select plan_id, count(*)::numeric as n from plan_channels group by plan_id
      ),
      paid as (
        select p.id, p.amount, p.created_at, p.subscriber_id, s.plan_id, c.id as client_id,
               pp.commission_pct
        from payments p
        join subscriptions s on s.id = p.subscription_id
        join clients c on c.id = p.client_id
        join platform_plans pp on pp.id = c.platform_plan_id
        where p.status = 'succeeded'
          and p.created_at >= ${period.from} and p.created_at < ${period.toExclusive}
          ${this.clientFilter(clientId)}
      )
      select
        ch.id::text as id,
        ch.title as title,
        ch.type as type,
        ch.bot_status as bot_status,
        ch.tg_chat_id::text as tg_chat_id,
        c.id::text as client_id,
        c.name as client_name,
        to_char(ch.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ') as created_at,
        (select count(*) from plan_channels pc2 where pc2.channel_id = ch.id)::text as plans,
        (select count(*) from subscriptions s2
           join plan_channels pc3 on pc3.plan_id = s2.plan_id
          where pc3.channel_id = ch.id and s2.status in ('active','trial','grace'))::text as active_subs,
        coalesce(sum(paid.amount / nullif(ps.n, 0)), 0)::text as turnover,
        coalesce(sum(paid.amount * paid.commission_pct / 100 / nullif(ps.n, 0)), 0)::text as commission,
        coalesce(sum(paid.amount), 0)::text as gross_turnover,
        count(paid.id)::text as payments_count,
        count(distinct paid.subscriber_id)::text as payers,
        to_char(max(paid.created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ') as last_payment_at
      from channels ch
      join clients c on c.id = ch.client_id
      left join plan_channels pc on pc.channel_id = ch.id
      left join plan_size ps on ps.plan_id = pc.plan_id
      left join paid on paid.plan_id = pc.plan_id
      where true ${this.clientFilter(clientId, 'ch.client_id')}
      group by ch.id, ch.title, ch.type, ch.bot_status, ch.tg_chat_id, ch.created_at, c.id, c.name
      order by coalesce(sum(paid.amount / nullif(ps.n, 0)), 0) desc, ch.title asc
    `);

    return Array.from(rows).map((r) => {
      const turnover = money(toNum(r.turnover));
      const commission = money(toNum(r.commission));
      const paymentsCount = toNum(r.payments_count);
      return {
        id: String(r.id),
        title: String(r.title),
        type: r.type ? String(r.type) : 'channel',
        botStatus: r.bot_status ? String(r.bot_status) : null,
        tgChatId: r.tg_chat_id ? String(r.tg_chat_id) : null,
        clientId: String(r.client_id),
        clientName: String(r.client_name),
        plans: toNum(r.plans),
        activeSubscriptions: toNum(r.active_subs),
        turnover,
        commission,
        clientNet: money(turnover - commission),
        grossTurnover: money(toNum(r.gross_turnover)),
        paymentsCount,
        payers: toNum(r.payers),
        avgCheck: paymentsCount ? money(turnover / paymentsCount) : 0,
        lastPaymentAt: r.last_payment_at ?? null,
        createdAt: r.created_at ?? null,
      };
    });
  }

  /** Разрез по платёжным провайдерам. */
  private async byProvider(period: ResolvedPeriod, clientId: string | null) {
    const rows = await this.db.execute<Record<string, string | null>>(sql`
      select
        p.provider as provider,
        coalesce(sum(p.amount) filter (where p.status = 'succeeded'), 0)::text as turnover,
        count(*) filter (where p.status = 'succeeded')::text as payments_count,
        count(*) filter (where p.status = 'refunded')::text as refunds_count,
        count(*) filter (where p.status = 'failed')::text as failed_count
      from payments p
      where p.created_at >= ${period.from} and p.created_at < ${period.toExclusive}
        ${this.clientFilter(clientId)}
      group by 1
      order by 2 desc
    `);

    const mapped = Array.from(rows).map((r) => ({
      provider: r.provider ? String(r.provider) : 'unknown',
      turnover: money(toNum(r.turnover)),
      paymentsCount: toNum(r.payments_count),
      refundsCount: toNum(r.refunds_count),
      failedCount: toNum(r.failed_count),
    }));
    const total = mapped.reduce((s, p) => s + p.turnover, 0);
    return mapped.map((p) => ({ ...p, sharePct: share(p.turnover, total) }));
  }

  /** Реестр платежей: кто (подписчик) → кому (клиент, каналы) → сколько. */
  private async ledger(period: ResolvedPeriod, clientId: string | null, limit: number) {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      select
        p.id::text as id,
        to_char(p.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ') as created_at,
        p.amount::text as amount,
        p.currency as currency,
        p.status as status,
        p.kind as kind,
        p.provider as provider,
        p.provider_payment_id as provider_payment_id,
        c.id::text as client_id,
        c.name as client_name,
        pp.commission_pct::text as commission_pct,
        sub.tg_user_id::text as payer_tg_id,
        sub.username as payer_username,
        sub.first_name as payer_name,
        pl.name as plan_name,
        pl.period_days::text as plan_period_days,
        coalesce((
          select array_agg(ch.title order by ch.title)
          from plan_channels pc join channels ch on ch.id = pc.channel_id
          where pc.plan_id = pl.id
        ), '{}') as channel_titles
      from payments p
      join clients c on c.id = p.client_id
      join platform_plans pp on pp.id = c.platform_plan_id
      left join subscribers sub on sub.id = p.subscriber_id
      left join subscriptions s on s.id = p.subscription_id
      left join plans pl on pl.id = s.plan_id
      where p.created_at >= ${period.from} and p.created_at < ${period.toExclusive}
        ${this.clientFilter(clientId)}
      order by p.created_at desc
      limit ${limit}
    `);

    return Array.from(rows).map((r) => {
      const amount = money(toNum(r.amount));
      const pct = toNum(r.commission_pct);
      const succeeded = String(r.status) === 'succeeded';
      const titles = Array.isArray(r.channel_titles)
        ? (r.channel_titles as unknown[]).map(String)
        : [];
      return {
        id: String(r.id),
        createdAt: (r.created_at as string) ?? null,
        amount,
        currency: r.currency ? String(r.currency) : 'RUB',
        status: String(r.status),
        kind: r.kind ? String(r.kind) : 'purchase',
        provider: r.provider ? String(r.provider) : 'unknown',
        providerPaymentId: r.provider_payment_id ? String(r.provider_payment_id) : null,
        clientId: String(r.client_id),
        clientName: String(r.client_name),
        commissionPct: pct,
        commission: succeeded ? money((amount * pct) / 100) : 0,
        clientNet: succeeded ? money(amount - (amount * pct) / 100) : 0,
        payerTgId: r.payer_tg_id ? String(r.payer_tg_id) : null,
        payerUsername: r.payer_username ? String(r.payer_username) : null,
        payerName: r.payer_name ? String(r.payer_name) : null,
        planName: r.plan_name ? String(r.plan_name) : null,
        planPeriodDays: r.plan_period_days == null ? null : toNum(r.plan_period_days),
        channels: titles,
      };
    });
  }

  /** Расчёты клиентов с платформой: счета, чей период пересекается с выбранным. */
  private async settlements(period: ResolvedPeriod, clientId: string | null) {
    const rows = await this.db.execute<Record<string, unknown>>(sql`
      select
        i.id::text as id,
        i.client_id::text as client_id,
        c.name as client_name,
        to_char(i.period_start, 'YYYY-MM-DD') as period_start,
        to_char(i.period_end, 'YYYY-MM-DD') as period_end,
        i.amount::text as amount,
        i.status as status,
        i.details as details,
        to_char(i.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSZ') as created_at
      from platform_invoices i
      join clients c on c.id = i.client_id
      where i.period_start < ${period.toExclusive} and i.period_end > ${period.from}
        ${this.clientFilter(clientId, 'i.client_id')}
      order by i.period_start desc, c.name asc
    `);

    return Array.from(rows).map((r) => {
      const details = (r.details as Record<string, unknown>) ?? {};
      return {
        id: String(r.id),
        clientId: String(r.client_id),
        clientName: String(r.client_name),
        periodStart: String(r.period_start),
        periodEnd: String(r.period_end),
        amount: money(toNum(r.amount)),
        status: String(r.status),
        subscriptionAmount: money(toNum(details.subscriptionAmount)),
        commissionAmount: money(toNum(details.commissionAmount)),
        turnoverBase: money(toNum(details.turnoverBase)),
        paidAt: typeof details.paidAt === 'string' ? details.paidAt : null,
        createdAt: (r.created_at as string) ?? null,
      };
    });
  }
}
