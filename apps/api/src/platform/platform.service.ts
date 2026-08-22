import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import {
  bots,
  channels,
  clients,
  directPaymentAccounts,
  payments,
  platformInvoices,
  platformPlans,
  subscriptions,
} from '../db/schema.js';
import { maskAccountNumber, cardLast4 } from '../payments/account-types.js';

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Первый день текущего месяца и первый день следующего (границы периода, [start, end)). */
function currentMonthPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: isoDate(start), end: isoDate(end) };
}

/** Границы прошлого месяца [start, end) — для автогенерации счёта по закрытому периоду. */
function previousMonthPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start: isoDate(start), end: isoDate(end) };
}

/**
 * Сервис владельца платформы (role=owner, clientId=null).
 *
 * Считает по всем клиентам: оборот (succeeded-платежи), комиссию платформы
 * (оборот × commission_pct тарифа клиента), выручку платформы от подписок
 * клиентов (price_month активных планов).
 */
@Injectable()
export class PlatformService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Сводка по всей платформе. */
  async overview() {
    const [clientsN] = await this.db.select({ n: sql<number>`count(*)` }).from(clients);
    const [activeN] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(clients)
      .where(sql`${clients.planStatus} in ('active','trialing')`);
    const [chN] = await this.db.select({ n: sql<number>`count(*)` }).from(channels);
    const [botsN] = await this.db.select({ n: sql<number>`count(*)` }).from(bots);
    const [subsN] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(subscriptions)
      .where(sql`${subscriptions.status} in ('active','trial','grace')`);

    // Оборот и комиссия одним проходом: join платежей к клиенту и его плану.
    const [agg] = await this.db
      .select({
        turnover: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        commission: sql<string>`coalesce(sum(${payments.amount} * ${platformPlans.commissionPct} / 100), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(payments)
      .innerJoin(clients, eq(clients.id, payments.clientId))
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId))
      .where(eq(payments.status, 'succeeded'));

    // Потенциальная месячная выручка платформы от подписок клиентов.
    const [mrr] = await this.db
      .select({
        s: sql<string>`coalesce(sum(${platformPlans.priceMonth}), 0)`,
      })
      .from(clients)
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId))
      .where(sql`${clients.planStatus} in ('active','trialing')`);

    return {
      totalClients: Number(clientsN?.n ?? 0),
      activeClients: Number(activeN?.n ?? 0),
      totalChannels: Number(chN?.n ?? 0),
      totalBots: Number(botsN?.n ?? 0),
      activeSubscriptions: Number(subsN?.n ?? 0),
      clientsTurnover: Number(agg?.turnover ?? 0),
      platformCommission: Number(agg?.commission ?? 0),
      paymentsCount: Number(agg?.count ?? 0),
      platformMrr: Number(mrr?.s ?? 0),
    };
  }

  /** Список всех клиентов с планом, оборотом и начисленной комиссией. */
  async listClients() {
    const rows = await this.db
      .select({
        id: clients.id,
        name: clients.name,
        planCode: platformPlans.code,
        planName: platformPlans.name,
        commissionPct: platformPlans.commissionPct,
        priceMonth: platformPlans.priceMonth,
        planStatus: clients.planStatus,
        planPaidUntil: clients.planPaidUntil,
        createdAt: clients.createdAt,
      })
      .from(clients)
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId))
      .orderBy(sql`${clients.createdAt} desc`);

    const result = [];
    for (const c of rows) {
      const [chN] = await this.db
        .select({ n: sql<number>`count(*)` })
        .from(channels)
        .where(eq(channels.clientId, c.id));
      const [subsN] = await this.db
        .select({ n: sql<number>`count(*)` })
        .from(subscriptions)
        .where(sql`${subscriptions.clientId} = ${c.id} and ${subscriptions.status} in ('active','trial','grace')`);
      const [agg] = await this.db
        .select({
          turnover: sql<string>`coalesce(sum(${payments.amount}), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(payments)
        .where(sql`${payments.clientId} = ${c.id} and ${payments.status} = 'succeeded'`);

      const turnover = Number(agg?.turnover ?? 0);
      const pct = Number(c.commissionPct ?? 0);
      result.push({
        id: c.id,
        name: c.name,
        planCode: c.planCode,
        planName: c.planName,
        planStatus: c.planStatus,
        commissionPct: pct,
        priceMonth: Number(c.priceMonth ?? 0),
        planPaidUntil: c.planPaidUntil?.toISOString?.() ?? null,
        channels: Number(chN?.n ?? 0),
        activeSubscriptions: Number(subsN?.n ?? 0),
        turnover,
        commission: Math.round(((turnover * pct) / 100) * 100) / 100,
        paymentsCount: Number(agg?.count ?? 0),
        createdAt: c.createdAt?.toISOString?.() ?? String(c.createdAt),
      });
    }
    return result;
  }

  /** Платформенные тарифы (для клиентов), которые продаёт владелец. */
  async listPlatformPlans() {
    const rows = await this.db
      .select()
      .from(platformPlans)
      .orderBy(sql`${platformPlans.priceMonth} asc`);
    return rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      priceMonth: Number(p.priceMonth ?? 0),
      currency: p.currency,
      commissionPct: Number(p.commissionPct ?? 0),
      isActive: p.isActive,
      limits: p.limits ?? {},
      features: p.features ?? {},
    }));
  }

  // ─── Биллинг платформы (счета клиентам) ───────────────────────────────────

  /**
   * Генерирует (идемпотентно) счета за период [start, end) по всем клиентам:
   * абонплата тарифа (price_month) + комиссия (оборот × commission_pct).
   * Оборот = сумма succeeded-платежей клиента с created_at в периоде.
   * Существующий счёт периода обновляется, если он ещё не оплачен.
   */
  /**
   * Реквизиты всех клиентов — то, куда через платформу уходят деньги
   * подписчиков.
   *
   * Предварительного одобрения тут нет: реквизиты начинают работать сразу,
   * как клиент их завёл. Этот список — контроль по факту: владелец видит, кто
   * и куда принимает, и может выключить любые реквизиты, после чего
   * инициировать по ним платёж уже нельзя.
   */
  async listClientPaymentAccounts() {
    const rows = await this.db
      .select({
        id: directPaymentAccounts.id,
        clientId: directPaymentAccounts.clientId,
        clientName: clients.name,
        accountType: directPaymentAccounts.accountType,
        bankName: directPaymentAccounts.bankName,
        accountNumber: directPaymentAccounts.accountNumber,
        cardNumberMasked: directPaymentAccounts.cardNumberMasked,
        cardHolder: directPaymentAccounts.cardHolder,
        phoneForSbp: directPaymentAccounts.phoneForSbp,
        email: directPaymentAccounts.email,
        cryptoAddress: directPaymentAccounts.cryptoAddress,
        cryptoType: directPaymentAccounts.cryptoType,
        isActive: directPaymentAccounts.isActive,
        createdAt: directPaymentAccounts.createdAt,
      })
      .from(directPaymentAccounts)
      .innerJoin(clients, eq(clients.id, directPaymentAccounts.clientId))
      .orderBy(sql`${directPaymentAccounts.createdAt} desc`);

    return rows.map((r) => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName,
      accountType: r.accountType,
      bankName: r.bankName,
      accountNumber: maskAccountNumber(r.accountNumber),
      cardLast4: cardLast4(r.cardNumberMasked),
      cardHolder: r.cardHolder,
      phoneSbp: r.phoneForSbp,
      paypalEmail: r.email,
      cryptoAddress: r.cryptoAddress,
      cryptoType: r.cryptoType,
      isActive: r.isActive,
      createdAt: r.createdAt,
    }));
  }

  /** Выключить/включить реквизиты клиента. Выключенные приём денег не проходят. */
  async setClientAccountActive(accountId: string, isActive: boolean) {
    const [updated] = await this.db
      .update(directPaymentAccounts)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(directPaymentAccounts.id, accountId))
      .returning({ id: directPaymentAccounts.id, isActive: directPaymentAccounts.isActive });

    if (!updated) throw new NotFoundException('реквизиты не найдены');
    return updated;
  }

  async generateInvoices(period?: { start?: string; end?: string }) {
    const { start, end } =
      period?.start && period?.end
        ? { start: period.start, end: period.end }
        : currentMonthPeriod();

    const rows = await this.db
      .select({
        id: clients.id,
        planCode: platformPlans.code,
        planName: platformPlans.name,
        priceMonth: platformPlans.priceMonth,
        commissionPct: platformPlans.commissionPct,
        currency: platformPlans.currency,
      })
      .from(clients)
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId));

    let created = 0;
    let updated = 0;
    for (const c of rows) {
      // Оборот делим по тому, чем закрыт платёж. Провайдерский подтверждён
      // подписью вебхука либо встречным запросом в API магазина; прямой
      // перевод закрывает сам клиент кнопкой «деньги получены», и его цифра —
      // со слов. Комиссия берётся с общего оборота, но владельцу видно, какая
      // часть на чьём слове держится, и он может её оспорить.
      const [agg] = await this.db
        .select({
          turnover: sql<string>`coalesce(sum(${payments.amount}), 0)`,
          selfReported: sql<string>`coalesce(sum(${payments.amount})
              filter (where ${payments.confirmedBy} = 'client'), 0)`,
        })
        .from(payments)
        .where(
          sql`${payments.clientId} = ${c.id} and ${payments.status} = 'succeeded'
              and ${payments.createdAt} >= ${start} and ${payments.createdAt} < ${end}`,
        );
      const turnover = Number(agg?.turnover ?? 0);
      const selfReported = Number(agg?.selfReported ?? 0);
      const pct = Number(c.commissionPct ?? 0);
      const subscription = Number(c.priceMonth ?? 0);
      const commission = Math.round(((turnover * pct) / 100) * 100) / 100;
      const total = Math.round((subscription + commission) * 100) / 100;
      const details = {
        planCode: c.planCode,
        planName: c.planName,
        subscriptionAmount: subscription,
        commissionPct: pct,
        turnoverBase: turnover,
        // Из них подтверждено самим клиентом, а не провайдером.
        turnoverSelfReported: selfReported,
        turnoverProviderVerified: Math.round((turnover - selfReported) * 100) / 100,
        commissionAmount: commission,
        currency: c.currency,
      };

      const res = await this.db
        .insert(platformInvoices)
        .values({
          clientId: c.id,
          periodStart: start,
          periodEnd: end,
          amount: String(total),
          status: 'pending',
          details,
        })
        .onConflictDoUpdate({
          target: [
            platformInvoices.clientId,
            platformInvoices.periodStart,
            platformInvoices.periodEnd,
          ],
          set: { amount: String(total), details },
          setWhere: sql`${platformInvoices.status} <> 'paid'`,
        })
        .returning({ id: platformInvoices.id, createdAt: platformInvoices.createdAt });
      if (res.length) created += 1;
      else updated += 1;
    }
    return { period: { start, end }, clients: rows.length, created, updated };
  }

  /** Все счета платформы (владелец), новые сверху. */
  async listInvoices(status?: string) {
    const base = this.db
      .select({
        id: platformInvoices.id,
        clientId: platformInvoices.clientId,
        clientName: clients.name,
        periodStart: platformInvoices.periodStart,
        periodEnd: platformInvoices.periodEnd,
        amount: platformInvoices.amount,
        status: platformInvoices.status,
        details: platformInvoices.details,
        createdAt: platformInvoices.createdAt,
      })
      .from(platformInvoices)
      .innerJoin(clients, eq(clients.id, platformInvoices.clientId));
    const rows = status
      ? await base.where(eq(platformInvoices.status, status)).orderBy(sql`${platformInvoices.createdAt} desc`)
      : await base.orderBy(sql`${platformInvoices.createdAt} desc`);
    return rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
      details: (r.details as Record<string, unknown>) ?? {},
      createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
    }));
  }

  private async setInvoiceStatus(invoiceId: string, status: 'paid' | 'void') {
    const [inv] = await this.db
      .select({ id: platformInvoices.id, details: platformInvoices.details })
      .from(platformInvoices)
      .where(eq(platformInvoices.id, invoiceId))
      .limit(1);
    if (!inv) throw new NotFoundException('счёт не найден');
    const details = { ...((inv.details as Record<string, unknown>) ?? {}) };
    if (status === 'paid') details.paidAt = new Date().toISOString();
    await this.db
      .update(platformInvoices)
      .set({ status, details })
      .where(eq(platformInvoices.id, invoiceId));
    return { ok: true, id: invoiceId, status };
  }

  markInvoicePaid(invoiceId: string) {
    return this.setInvoiceStatus(invoiceId, 'paid');
  }

  voidInvoice(invoiceId: string) {
    return this.setInvoiceStatus(invoiceId, 'void');
  }

  /** Сводка биллинга: выставлено, оплачено, к оплате. */
  async billingSummary() {
    const [agg] = await this.db
      .select({
        issued: sql<string>`coalesce(sum(${platformInvoices.amount}), 0)`,
        count: sql<number>`count(*)`,
        paid: sql<string>`coalesce(sum(case when ${platformInvoices.status} = 'paid' then ${platformInvoices.amount} else 0 end), 0)`,
        due: sql<string>`coalesce(sum(case when ${platformInvoices.status} in ('pending','overdue') then ${platformInvoices.amount} else 0 end), 0)`,
      })
      .from(platformInvoices);
    return {
      invoicesCount: Number(agg?.count ?? 0),
      issuedTotal: Number(agg?.issued ?? 0),
      paidTotal: Number(agg?.paid ?? 0),
      dueTotal: Number(agg?.due ?? 0),
    };
  }

  /** Границы прошлого месяца (для автогенерации по закрытому периоду). */
  static previousMonth() {
    return previousMonthPeriod();
  }

  /** Помечает неоплаченные счета просроченными: period_end + graceDays < сегодня. */
  async markOverdue(graceDays = 7) {
    const res = await this.db
      .update(platformInvoices)
      .set({ status: 'overdue' })
      .where(
        sql`${platformInvoices.status} = 'pending'
            and ${platformInvoices.periodEnd} + (${graceDays} || ' days')::interval < now()`,
      )
      .returning({ id: platformInvoices.id });
    return { overdue: res.length };
  }
}
