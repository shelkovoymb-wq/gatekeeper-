import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import {
  channels,
  channelMembers,
  subscribers,
  subscriptions,
  payments,
  planChannels,
  plans,
} from '../db/schema.js';

/**
 * Read-only агрегаты и списки для админ-панели. Реальные данные из БД,
 * форматируются под контракт фронтенда (apps/web). Никаких моков.
 */
@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getStats() {
    const [chTotal] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(channels);
    const [chActive] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(channels)
      .where(eq(channels.botStatus, 'ok'));
    const [subTotal] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(subscribers);
    const [rev] = await this.db
      .select({ s: sql<string>`coalesce(sum(${payments.amount}), 0)` })
      .from(payments)
      .where(eq(payments.status, 'succeeded'));
    const [evt] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(subscriptions);

    return {
      totalChannels: Number(chTotal?.n ?? 0),
      totalUsers: Number(subTotal?.n ?? 0),
      totalRevenue: Number(rev?.s ?? 0),
      messageCount: Number(evt?.n ?? 0),
      activeChannels: Number(chActive?.n ?? 0),
    };
  }

  async listChannels() {
    const rows = await this.db.select().from(channels);
    const result = [];
    for (const ch of rows) {
      const [mc] = await this.db
        .select({ n: sql<number>`count(*)` })
        .from(channelMembers)
        .where(
          and(
            eq(channelMembers.channelId, ch.id),
            eq(channelMembers.status, 'member'),
          ),
        );
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
        createdAt: ch.createdAt?.toISOString?.() ?? String(ch.createdAt),
        updatedAt: ch.createdAt?.toISOString?.() ?? String(ch.createdAt),
      });
    }
    return result;
  }

  async listSubscribers() {
    const rows = await this.db.select().from(subscribers);
    const result = [];
    for (const s of rows) {
      const subs = await this.db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.subscriberId, s.id));
      result.push({
        id: s.id,
        username: s.username || s.firstName || String(s.tgUserId),
        telegramId: String(s.tgUserId),
        email: undefined,
        isAdmin: false,
        subscriptions: subs.map((x) => x.id),
        createdAt: s.createdAt?.toISOString?.() ?? String(s.createdAt),
        updatedAt: s.createdAt?.toISOString?.() ?? String(s.createdAt),
      });
    }
    return result;
  }

  async listPayments(limit = 100) {
    const rows = await this.db
      .select()
      .from(payments)
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
}
