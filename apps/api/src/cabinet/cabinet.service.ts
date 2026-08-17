import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { SECRET_BOX } from '../common/crypto.module.js';
import type { SecretBox } from '../common/crypto.js';
import {
  bots,
  channels,
  clients,
  directPaymentAccounts,
  paymentConfigs,
  payments,
  planChannels,
  plans,
  platformInvoices,
  platformPlans,
  subscriptions,
} from '../db/schema.js';
import { BotsService } from '../bots/bots.service.js';
import { PlansService, type CreatePlanInput } from '../plans/plans.service.js';
import { ChannelsService } from '../channels/channels.service.js';
import { PaymentsService } from '../payments/payments.service.js';

/** Провайдеры, которые клиент может настроить в кабинете. */
export const PAYMENT_PROVIDERS = [
  'yookassa',
  'cloudpayments',
  'robokassa',
  'prodamus',
  'stars',
] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

/** Типы реквизитов, которые клиент может завести в кабинете — те же, что у владельца. */
export const CLIENT_ACCOUNT_TYPES = ['bank_account', 'card', 'sbp', 'paypal', 'crypto'] as const;
export const CRYPTO_TYPES = ['btc', 'eth', 'usdt'] as const;

@Injectable()
export class CabinetService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    private readonly botsSvc: BotsService,
    private readonly plansSvc: PlansService,
    private readonly channelsSvc: ChannelsService,
    private readonly paymentsSvc: PaymentsService,
  ) {}

  async overview(clientId: string) {
    const [chTotal] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(channels)
      .where(eq(channels.clientId, clientId));
    const [chActive] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(channels)
      .where(and(eq(channels.clientId, clientId), eq(channels.botStatus, 'ok')));
    const [subs] = await this.db
      .select({ n: sql<number>`count(distinct ${subscriptions.subscriberId})` })
      .from(subscriptions)
      .where(eq(subscriptions.clientId, clientId));
    const [subsTotal] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.clientId, clientId));
    const [rev] = await this.db
      .select({ s: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(and(eq(payments.clientId, clientId), eq(payments.status, 'succeeded')));
    const [botsN] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(bots)
      .where(eq(bots.clientId, clientId));

    return {
      totalChannels: Number(chTotal?.n ?? 0),
      activeChannels: Number(chActive?.n ?? 0),
      totalUsers: Number(subs?.n ?? 0),
      messageCount: Number(subsTotal?.n ?? 0),
      totalRevenue: Number(rev?.s ?? 0),
      totalBots: Number(botsN?.n ?? 0),
    };
  }

  async listBots(clientId: string) {
    const rows = await this.db
      .select({
        id: bots.id,
        username: bots.username,
        tgBotId: bots.tgBotId,
        status: bots.status,
        isPlatformBot: bots.isPlatformBot,
        createdAt: bots.createdAt,
      })
      .from(bots)
      .where(eq(bots.clientId, clientId));
    return rows.map((b) => ({
      ...b,
      tgBotId: String(b.tgBotId),
      createdAt: b.createdAt?.toISOString?.() ?? String(b.createdAt),
    }));
  }

  async connectBot(clientId: string, token: string) {
    return this.botsSvc.register({ token, clientId, isPlatformBot: false });
  }

  async listChannels(clientId: string) {
    const rows = await this.db.select().from(channels).where(eq(channels.clientId, clientId));
    const result = [];
    for (const ch of rows) {
      const [mc] = await this.db
        .select({ n: sql<number>`count(*)` })
        .from(sql`channel_members`)
        .where(sql`channel_id = ${ch.id} and status = 'member'`);
      const [fee] = await this.db
        .select({ price: plans.price, currency: plans.currency })
        .from(planChannels)
        .innerJoin(plans, eq(plans.id, planChannels.planId))
        .where(eq(planChannels.channelId, ch.id))
        .limit(1);
      result.push({
        id: ch.id,
        name: ch.title,
        description: '',
        telegramId: String(ch.tgChatId),
        memberCount: Number(mc?.n ?? 0),
        subscriptionFee: fee ? Number(fee.price) : 0,
        currency: fee?.currency === 'USD' ? 'USD' : 'RUB',
        isActive: ch.botStatus === 'ok',
        botStatus: ch.botStatus,
        createdAt: ch.createdAt?.toISOString?.() ?? String(ch.createdAt),
        updatedAt: ch.createdAt?.toISOString?.() ?? String(ch.createdAt),
      });
    }
    return result;
  }

  private async assertChannelOwner(clientId: string, channelId: string) {
    const [ch] = await this.db
      .select({ clientId: channels.clientId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    if (!ch) throw new NotFoundException('канал не найден');
    if (ch.clientId !== clientId) throw new ForbiddenException('нет доступа к каналу');
  }

  /**
   * Тариф тоже должен принадлежать вызывающему: его id уходит в имя
   * пригласительной ссылки (`plan:<id>`) и в invite_links.plan_id, то есть
   * подписчик, пришедший по ссылке, будет посажен на этот тариф. Без проверки
   * клиент мог бы привязать к своему каналу чужой тариф — с чужой ценой и
   * длительностью.
   */
  private async assertPlanOwner(clientId: string, planId: string) {
    const [p] = await this.db
      .select({ clientId: plans.clientId })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);
    if (!p) throw new NotFoundException('тариф не найден');
    if (p.clientId !== clientId) throw new ForbiddenException('нет доступа к тарифу');
  }

  async createInviteLink(clientId: string, channelId: string, planId?: string) {
    await this.assertChannelOwner(clientId, channelId);
    if (planId) await this.assertPlanOwner(clientId, planId);
    const url = await this.channelsSvc.createInviteLink(channelId, planId);
    return { url };
  }

  async listSubscribers(clientId: string) {
    const rows = await this.db
      .select({
        id: sql<string>`s.id`,
        tgUserId: sql<string>`s.tg_user_id`,
        username: sql<string>`s.username`,
        firstName: sql<string>`s.first_name`,
        subs: sql<number>`count(sub.id)`,
        createdAt: sql<string>`min(sub.created_at)`,
      })
      .from(sql`subscriptions sub`)
      .innerJoin(sql`subscribers s`, sql`s.id = sub.subscriber_id`)
      .where(sql`sub.client_id = ${clientId}`)
      .groupBy(sql`s.id`);
    return rows.map((r) => ({
      id: r.id,
      username: r.username || r.firstName || String(r.tgUserId),
      telegramId: String(r.tgUserId),
      email: undefined,
      isAdmin: false,
      subscriptions: Array.from({ length: Number(r.subs ?? 0) }, (_, i) => String(i)),
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    }));
  }

  async listPaymentTransactions(clientId: string, limit = 100) {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.clientId, clientId))
      .orderBy(sql`${payments.createdAt} desc`)
      .limit(limit);
    return rows.map((p) => ({
      id: p.id,
      clientId: p.clientId,
      subscriberId: p.subscriberId ?? '',
      subscriptionId: p.subscriptionId ?? '',
      amount: Number(p.amount),
      currency: p.currency,
      provider: p.provider,
      status: p.status,
      createdAt: p.createdAt?.toISOString?.() ?? String(p.createdAt),
      updatedAt: p.updatedAt?.toISOString?.() ?? undefined,
      metadata: (p.metadata as Record<string, unknown>) ?? {},
    }));
  }

  /**
   * Возврат платежа по инициативе клиента.
   *
   * Идентификатор здесь — `provider_payment_id` (именно так платёж ищет
   * PaymentsService), поэтому и владельца проверяем по нему. Раньше возврат
   * жил только на сервис-токенной ручке `/payments/:id/refund`, а BFF-роут
   * ходил туда общим токеном платформы вообще без сессии — то есть любой
   * запрос из интернета мог вернуть чужой платёж.
   */
  async refundPayment(
    clientId: string,
    providerPaymentId: string,
    amount?: number,
    reason?: string,
  ) {
    const [row] = await this.db
      .select({ amount: payments.amount })
      .from(payments)
      .where(
        and(
          eq(payments.providerPaymentId, providerPaymentId),
          eq(payments.clientId, clientId),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException('платёж не найден');

    if (amount !== undefined) {
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('сумма возврата должна быть положительной');
      }
      if (amount > Number(row.amount)) {
        throw new BadRequestException('сумма возврата больше суммы платежа');
      }
    }

    return this.paymentsSvc.refundPayment(providerPaymentId, amount, reason);
  }

  async listPlans(clientId: string) {
    const rows = await this.db.select().from(plans).where(eq(plans.clientId, clientId));
    const result = [];
    for (const p of rows) {
      const linked = await this.db
        .select({ channelId: planChannels.channelId })
        .from(planChannels)
        .where(eq(planChannels.planId, p.id));
      result.push({
        id: p.id,
        name: p.name,
        description: p.description ?? '',
        price: Number(p.price),
        currency: p.currency,
        starsPrice: p.starsPrice ?? null,
        periodDays: p.periodDays,
        trialDays: p.trialDays,
        graceDays: p.graceDays,
        isActive: p.isActive,
        channelIds: linked.map((l) => l.channelId),
        createdAt: p.createdAt?.toISOString?.() ?? String(p.createdAt),
      });
    }
    return result;
  }

  async createPlan(clientId: string, input: Omit<CreatePlanInput, 'clientId'>) {
    // Проверяем, что каналы принадлежат клиенту.
    for (const chId of input.channelIds ?? []) {
      await this.assertChannelOwner(clientId, chId);
    }
    return this.plansSvc.create({ ...input, clientId });
  }

  async deletePlan(clientId: string, planId: string) {
    const [p] = await this.db
      .select({ clientId: plans.clientId })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);
    if (!p) throw new NotFoundException('тариф не найден');
    if (p.clientId !== clientId) throw new ForbiddenException('нет доступа');
    await this.db.delete(planChannels).where(eq(planChannels.planId, planId));
    await this.db.delete(plans).where(eq(plans.id, planId));
    return { ok: true };
  }

  async listPayments(clientId: string) {
    const rows = await this.db
      .select({ provider: paymentConfigs.provider, isActive: paymentConfigs.isActive })
      .from(paymentConfigs)
      .where(eq(paymentConfigs.clientId, clientId));
    const configured = new Map(rows.map((r) => [r.provider, r.isActive]));
    return PAYMENT_PROVIDERS.map((provider) => ({
      provider,
      configured: configured.has(provider),
      isActive: configured.get(provider) ?? false,
      // stars не требует ключей
      needsKeys: provider !== 'stars',
    }));
  }

  // ─── Биллинг клиента (что он должен платформе) ────────────────────────────

  /** Текущий платформенный тариф клиента + его счета и сумма к оплате. */
  async myBilling(clientId: string) {
    const [c] = await this.db
      .select({
        planId: platformPlans.id,
        planCode: platformPlans.code,
        planName: platformPlans.name,
        priceMonth: platformPlans.priceMonth,
        commissionPct: platformPlans.commissionPct,
        currency: platformPlans.currency,
        planStatus: clients.planStatus,
        planPaidUntil: clients.planPaidUntil,
      })
      .from(clients)
      .innerJoin(platformPlans, eq(platformPlans.id, clients.platformPlanId))
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!c) throw new NotFoundException('клиент не найден');

    const rows = await this.db
      .select()
      .from(platformInvoices)
      .where(eq(platformInvoices.clientId, clientId))
      .orderBy(sql`${platformInvoices.createdAt} desc`);

    const invoices = rows.map((r) => ({
      id: r.id,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      amount: Number(r.amount),
      status: r.status,
      details: (r.details as Record<string, unknown>) ?? {},
      createdAt: r.createdAt?.toISOString?.() ?? String(r.createdAt),
    }));
    const dueTotal = invoices
      .filter((i) => i.status === 'pending' || i.status === 'overdue')
      .reduce((s, i) => s + i.amount, 0);

    return {
      plan: {
        code: c.planCode,
        name: c.planName,
        priceMonth: Number(c.priceMonth ?? 0),
        commissionPct: Number(c.commissionPct ?? 0),
        currency: c.currency,
        status: c.planStatus,
        paidUntil: c.planPaidUntil?.toISOString?.() ?? null,
      },
      dueTotal: Math.round(dueTotal * 100) / 100,
      invoicesCount: invoices.length,
      invoices,
    };
  }

  /** Доступные платформенные тарифы (для смены плана клиентом). */
  async availablePlatformPlans() {
    const rows = await this.db
      .select()
      .from(platformPlans)
      .where(eq(platformPlans.isActive, true))
      .orderBy(sql`${platformPlans.priceMonth} asc`);
    return rows.map((p) => ({
      code: p.code,
      name: p.name,
      priceMonth: Number(p.priceMonth ?? 0),
      commissionPct: Number(p.commissionPct ?? 0),
      currency: p.currency,
      limits: p.limits ?? {},
      features: p.features ?? {},
    }));
  }

  /** Клиент переключает свой платформенный тариф. */
  async changePlan(clientId: string, code: string) {
    const [plan] = await this.db
      .select({ id: platformPlans.id, code: platformPlans.code })
      .from(platformPlans)
      .where(and(eq(platformPlans.code, code), eq(platformPlans.isActive, true)))
      .limit(1);
    if (!plan) throw new NotFoundException('тариф не найден');
    await this.db
      .update(clients)
      .set({ platformPlanId: plan.id, planStatus: 'active' })
      .where(eq(clients.id, clientId));
    return { ok: true, planCode: plan.code };
  }

  async setPayment(
    clientId: string,
    provider: string,
    credentials: Record<string, unknown> | null,
    isActive = true,
  ) {
    if (!(PAYMENT_PROVIDERS as readonly string[]).includes(provider)) {
      throw new NotFoundException('неизвестный провайдер');
    }
    const credentialsEnc =
      provider === 'stars' || !credentials ? null : this.box.encrypt(JSON.stringify(credentials));

    const [existing] = await this.db
      .select({ id: paymentConfigs.id })
      .from(paymentConfigs)
      .where(and(eq(paymentConfigs.clientId, clientId), eq(paymentConfigs.provider, provider)))
      .limit(1);

    if (existing) {
      await this.db
        .update(paymentConfigs)
        .set({ credentialsEnc: credentialsEnc ?? undefined, isActive })
        .where(eq(paymentConfigs.id, existing.id));
    } else {
      await this.db
        .insert(paymentConfigs)
        .values({ clientId, provider, credentialsEnc, isActive });
    }
    return { ok: true };
  }

  // ─── Реквизиты клиента для получения прямых переводов ──────────────────────

  /**
   * Наружу реквизиты клиента выглядят ровно как владельческие
   * (`/v1/platform/payment-accounts`) — те же имена полей, тот же набор типов.
   * В базе колонки исторически названы иначе (`email`, `phone_for_sbp`,
   * `card_number_masked`), поэтому здесь живёт маппинг: контракт один, а
   * плодить дубли колонок ради него незачем.
   */
  private mapAccount(a: typeof directPaymentAccounts.$inferSelect) {
    return {
      id: a.id,
      accountType: a.accountType,
      bankName: a.bankName,
      accountNumber: a.accountNumber ? `****${a.accountNumber.slice(-4)}` : null,
      bic: a.bic,
      inn: a.inn,
      phoneSbp: a.phoneForSbp,
      paypalEmail: a.email,
      cryptoAddress: a.cryptoAddress,
      cryptoType: a.cryptoType,
      cardLast4: a.cardNumberMasked ? a.cardNumberMasked.slice(-4) : null,
      cardHolder: a.cardHolder,
      isActive: a.isActive,
      verificationStatus: a.verificationStatus,
      verifiedAt: a.verifiedAt,
      createdAt: a.createdAt,
    };
  }

  async listPaymentAccounts(clientId: string) {
    const rows = await this.db
      .select()
      .from(directPaymentAccounts)
      .where(eq(directPaymentAccounts.clientId, clientId))
      .orderBy(sql`${directPaymentAccounts.createdAt} desc`);
    return rows.map((a) => this.mapAccount(a));
  }

  async addPaymentAccount(clientId: string, input: Record<string, unknown>) {
    const accountType = String(input.accountType ?? '');
    if (!(CLIENT_ACCOUNT_TYPES as readonly string[]).includes(accountType)) {
      throw new BadRequestException(
        `accountType должен быть одним из: ${CLIENT_ACCOUNT_TYPES.join(', ')}`,
      );
    }

    const str = (k: string): string | undefined => {
      const v = input[k];
      if (v === null || v === undefined) return undefined;
      const s = String(v).trim();
      return s === '' ? undefined : s;
    };

    const values: typeof directPaymentAccounts.$inferInsert = {
      clientId,
      accountType,
      isActive: true,
      // Подтверждает реквизиты платформа, а не сам клиент: verified здесь —
      // разрешение принимать деньги, выдавать его себе самому нельзя.
      verificationStatus: 'pending',
    };

    switch (accountType) {
      case 'bank_account': {
        const bankName = str('bankName');
        const accountNumber = str('accountNumber');
        if (!bankName || !accountNumber) {
          throw new BadRequestException('для банковского счёта нужны bankName и accountNumber');
        }
        Object.assign(values, { bankName, accountNumber, bic: str('bic'), inn: str('inn') });
        break;
      }
      case 'card': {
        const last4 = str('cardLast4');
        if (!last4 || !/^\d{4}$/.test(last4)) {
          throw new BadRequestException('cardLast4 — ровно 4 цифры, полный номер карты не принимаем');
        }
        Object.assign(values, { cardNumberMasked: `****${last4}`, cardHolder: str('cardHolder') });
        break;
      }
      case 'sbp': {
        const phone = str('phoneSbp');
        if (!phone) throw new BadRequestException('для СБП нужен phoneSbp');
        Object.assign(values, { phoneForSbp: phone, phoneNumber: phone });
        break;
      }
      case 'paypal': {
        const email = str('paypalEmail');
        if (!email) throw new BadRequestException('для PayPal нужен paypalEmail');
        Object.assign(values, { email });
        break;
      }
      case 'crypto': {
        const address = str('cryptoAddress');
        const type = str('cryptoType')?.toLowerCase();
        if (!address) throw new BadRequestException('для криптовалюты нужен cryptoAddress');
        if (!type || !(CRYPTO_TYPES as readonly string[]).includes(type)) {
          throw new BadRequestException(`cryptoType должен быть одним из: ${CRYPTO_TYPES.join(', ')}`);
        }
        Object.assign(values, { cryptoAddress: address, cryptoType: type });
        break;
      }
    }

    // Активный счёт каждого типа — один: прямой перевод выбирает реквизиты
    // получателя сам, и при двух активных выбор был бы произвольным.
    await this.db
      .update(directPaymentAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(directPaymentAccounts.clientId, clientId),
          eq(directPaymentAccounts.accountType, accountType),
        ),
      );

    const [created] = await this.db.insert(directPaymentAccounts).values(values).returning();
    return this.mapAccount(created);
  }

  async deactivatePaymentAccount(clientId: string, accountId: string) {
    const [updated] = await this.db
      .update(directPaymentAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(directPaymentAccounts.id, accountId),
          eq(directPaymentAccounts.clientId, clientId),
        ),
      )
      .returning();

    if (!updated) throw new NotFoundException('реквизиты не найдены');
    return this.mapAccount(updated);
  }
}
