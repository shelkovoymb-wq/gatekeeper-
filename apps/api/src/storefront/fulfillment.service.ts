import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { channels, payments, planChannels, plans } from '../db/schema.js';
import { SubscribersService } from '../subscribers/subscribers.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { TelegramService } from '../telegram/telegram.service.js';

interface FulfillInput {
  botId: string;
  tgUserId: number;
  username?: string | null;
  firstName?: string | null;
  planId: string;
  provider: string;
  providerPaymentId: string;
  /** Реально списанная сумма в единицах провайдера (для метаданных). */
  rawAmount?: number;
  rawCurrency?: string;
}

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly subscribers: SubscribersService,
    private readonly subs: SubscriptionsService,
    private readonly tg: TelegramService,
  ) {}

  async planWithChannels(planId: string) {
    const [plan] = await this.db.select().from(plans).where(eq(plans.id, planId)).limit(1);
    if (!plan) return null;
    const chans = await this.db
      .select({
        id: channels.id,
        botId: channels.botId,
        tgChatId: channels.tgChatId,
        title: channels.title,
        botStatus: channels.botStatus,
      })
      .from(planChannels)
      .innerJoin(channels, eq(channels.id, planChannels.channelId))
      .where(eq(planChannels.planId, planId));
    return { plan, channels: chans };
  }

  /** Оплата прошла → выдать подписку, записать платёж, прислать доступ. Идемпотентно. */
  async fulfill(input: FulfillInput): Promise<void> {
    const pc = await this.planWithChannels(input.planId);
    if (!pc) {
      this.logger.warn(`fulfill: plan ${input.planId} not found`);
      return;
    }
    const subscriber = await this.subscribers.upsert({
      tgUserId: input.tgUserId,
      username: input.username,
      firstName: input.firstName,
    });

    const sub = await this.subs.grant({
      subscriberId: subscriber.id,
      planId: input.planId,
      actor: 'payment',
    });

    // Платёж в выручку (идемпотентно по provider+providerPaymentId).
    await this.db
      .insert(payments)
      .values({
        clientId: pc.plan.clientId,
        subscriptionId: sub.id,
        subscriberId: subscriber.id,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        amount: String(pc.plan.price),
        currency: pc.plan.currency,
        status: 'succeeded',
        kind: 'purchase',
        metadata: {
          rawAmount: input.rawAmount ?? null,
          rawCurrency: input.rawCurrency ?? null,
          planId: input.planId,
        },
      })
      .onConflictDoNothing();

    // Доступ: одноразовые join-request ссылки на каналы тарифа.
    const links: Array<{ title: string; url: string }> = [];
    for (const ch of pc.channels) {
      if (ch.botStatus !== 'ok') continue;
      try {
        const url = await this.tg.createJoinRequestLink(
          ch.botId,
          Number(ch.tgChatId),
          `paid:${input.planId.slice(0, 6)}`,
        );
        links.push({ title: ch.title, url });
      } catch (e) {
        this.logger.error(`invite link failed ch=${ch.id}: ${String(e)}`);
      }
    }

    const body = links.length
      ? `✅ Оплата получена, подписка активна!\n\nЗаходите в канал:\n` +
        links.map((l) => `• <a href="${l.url}">${l.title}</a>`).join('\n')
      : `✅ Оплата получена, подписка активна! Отправьте заявку на вступление в канал — я впущу вас.`;

    await this.tg.sendMessage(input.botId, input.tgUserId, body);
    this.logger.log(
      `FULFILLED user=${input.tgUserId} plan=${input.planId} sub=${sub.id} links=${links.length}`,
    );
  }
}
