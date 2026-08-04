import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { SubscriptionStatus } from '@gatekeeper/shared';
import { DB, type Database } from '../db/db.module.js';
import {
  planChannels,
  plans,
  subscriptionEvents,
  subscriptions,
} from '../db/schema.js';

const ACCESS_STATUSES = [
  SubscriptionStatus.Trial,
  SubscriptionStatus.Active,
  SubscriptionStatus.Grace,
] as string[];

export interface ActiveSubForChannel {
  subscriptionId: string;
  clientId: string;
  planId: string;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Есть ли у подписчика активная (trial/active/grace) подписка, тариф которой
   * открывает данный канал. Возвращает первую подходящую — основание для approve.
   */
  async findAccessForChannel(
    subscriberId: string,
    channelId: string,
  ): Promise<ActiveSubForChannel | null> {
    const [row] = await this.db
      .select({
        subscriptionId: subscriptions.id,
        clientId: subscriptions.clientId,
        planId: subscriptions.planId,
      })
      .from(subscriptions)
      .innerJoin(planChannels, eq(planChannels.planId, subscriptions.planId))
      .where(
        and(
          eq(subscriptions.subscriberId, subscriberId),
          eq(planChannels.channelId, channelId),
          inArray(subscriptions.status, ACCESS_STATUSES),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Есть ли у подписчика активная (trial/active/grace) подписка именно на этот тариф. */
  async findActiveForPlan(
    subscriberId: string,
    planId: string,
  ): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.subscriberId, subscriberId),
          eq(subscriptions.planId, planId),
          inArray(subscriptions.status, ACCESS_STATUSES),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /**
   * Ручная выдача/продление подписки (для теста и операций поддержки).
   * Продление не сжигает остаток: paid_until = max(now, paid_until) + period.
   */
  async grant(input: {
    subscriberId: string;
    planId: string;
    isGift?: boolean;
    actor?: string;
  }): Promise<{ id: string; status: string; paidUntil: Date | null }> {
    const [plan] = await this.db
      .select({ clientId: plans.clientId, periodDays: plans.periodDays })
      .from(plans)
      .where(eq(plans.id, input.planId))
      .limit(1);
    if (!plan) throw new NotFoundException('plan not found');

    const [existing] = await this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.subscriberId, input.subscriberId),
          eq(subscriptions.planId, input.planId),
        ),
      )
      .limit(1);

    // period=0 → lifetime (paid_until = null)
    const extend = (from: Date) =>
      plan.periodDays === 0
        ? null
        : new Date(from.getTime() + plan.periodDays * 86_400_000);
    const now = new Date();

    let subId: string;
    let status: string;
    let paidUntil: Date | null;

    if (existing) {
      const base =
        existing.paidUntil && existing.paidUntil > now ? existing.paidUntil : now;
      paidUntil = extend(base);
      status = SubscriptionStatus.Active;
      await this.db
        .update(subscriptions)
        .set({
          status,
          paidUntil,
          graceUntil: null,
          isGift: input.isGift ?? existing.isGift,
          updatedAt: now,
        })
        .where(eq(subscriptions.id, existing.id));
      subId = existing.id;
    } else {
      paidUntil = extend(now);
      status = SubscriptionStatus.Active;
      const [created] = await this.db
        .insert(subscriptions)
        .values({
          clientId: plan.clientId,
          subscriberId: input.subscriberId,
          planId: input.planId,
          status,
          paidUntil,
          isGift: input.isGift ?? false,
        })
        .returning({ id: subscriptions.id });
      subId = created.id;
    }

    await this.logEvent(subId, existing ? 'renewed' : 'activated', input.actor, {
      manual: true,
      isGift: input.isGift ?? false,
    });
    this.logger.log(`grant sub=${subId} status=${status} paidUntil=${paidUntil?.toISOString() ?? 'lifetime'}`);
    return { id: subId, status, paidUntil };
  }

  async logEvent(
    subscriptionId: string,
    event: string,
    actor = 'system',
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(subscriptionEvents).values({
      subscriptionId,
      event,
      actor,
      payload: payload ?? null,
    });
  }

  /** Подписки подписчика, которые дают доступ хотя бы в один канал (для отзыва). */
  async listAccessBySubscriber(subscriberId: string) {
    return this.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.subscriberId, subscriberId),
          inArray(subscriptions.status, ACCESS_STATUSES),
        ),
      );
  }

  /** Отметить статусом banned (жёсткий бан клиентом) — запрещает будущие approve. */
  async ban(subscriptionId: string, actor = 'system'): Promise<void> {
    await this.db
      .update(subscriptions)
      .set({ status: SubscriptionStatus.Banned, updatedAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId));
    await this.logEvent(subscriptionId, 'banned', actor);
  }

  /** Заглушка для будущего reaper'а: активные, у кого истёк paid_until. */
  async _debugExpiredCount(): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, SubscriptionStatus.Active),
          sql`${subscriptions.paidUntil} < now()`,
        ),
      );
    return Number(rows[0]?.n ?? 0);
  }
}
