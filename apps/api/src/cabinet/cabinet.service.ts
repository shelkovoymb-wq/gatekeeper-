import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { SECRET_BOX } from '../common/crypto.module.js';
import type { SecretBox } from '../common/crypto.js';
import {
  bots,
  channels,
  clients,
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

/** Провайдеры, которые клиент может настроить в кабинете. */
export const PAYMENT_PROVIDERS = ['yookassa', 'cloudpayments', 'robokassa', 'stars'] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];

@Injectable()
export class CabinetService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    private readonly botsSvc: BotsService,
    private readonly plansSvc: PlansService,
    private readonly channelsSvc: ChannelsService,
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

  async createInviteLink(clientId: string, channelId: string, planId?: string) {
    await this.assertChannelOwner(clientId, channelId);
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
}
