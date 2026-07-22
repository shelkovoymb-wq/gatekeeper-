import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { channels, planChannels, plans } from '../db/schema.js';

export interface CreatePlanInput {
  clientId?: string;
  name: string;
  price: number;
  currency?: string;
  starsPrice?: number;
  periodDays: number;
  trialDays?: number;
  graceDays?: number;
  channelIds?: string[];
}

@Injectable()
export class PlansService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: CreatePlanInput) {
    // clientId берём из первого канала, если не задан явно (MVP-упрощение).
    let clientId = input.clientId;
    if (!clientId && input.channelIds?.length) {
      const [ch] = await this.db
        .select({ clientId: channels.clientId })
        .from(channels)
        .where(eq(channels.id, input.channelIds[0]))
        .limit(1);
      clientId = ch?.clientId;
    }
    if (!clientId) throw new NotFoundException('clientId required (or provide channelIds)');

    const [plan] = await this.db
      .insert(plans)
      .values({
        clientId,
        name: input.name,
        price: String(input.price),
        currency: input.currency ?? 'RUB',
        starsPrice: input.starsPrice ?? null,
        periodDays: input.periodDays,
        trialDays: input.trialDays ?? 0,
        graceDays: input.graceDays ?? 3,
      })
      .returning();

    if (input.channelIds?.length) {
      await this.linkChannels(plan.id, input.channelIds);
    }
    return plan;
  }

  async linkChannels(planId: string, channelIds: string[]): Promise<void> {
    if (!channelIds.length) return;
    await this.db
      .insert(planChannels)
      .values(channelIds.map((channelId) => ({ planId, channelId })))
      .onConflictDoNothing();
  }

  async get(planId: string) {
    const [plan] = await this.db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) throw new NotFoundException('plan not found');
    const linked = await this.db
      .select({ channelId: planChannels.channelId })
      .from(planChannels)
      .where(eq(planChannels.planId, planId));
    return { ...plan, channelIds: linked.map((l) => l.channelId) };
  }

  /** Активна ли ссылка тарифа на данный канал. */
  async planCoversChannel(planId: string, channelId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ planId: planChannels.planId })
      .from(planChannels)
      .where(and(eq(planChannels.planId, planId), eq(planChannels.channelId, channelId)))
      .limit(1);
    return Boolean(row);
  }
}
