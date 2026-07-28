import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CallbackQuery, Message, PreCheckoutQuery } from 'grammy/types';
import { DB, type Database } from '../db/db.module.js';
import { channels, planChannels, plans } from '../db/schema.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { FulfillmentService } from './fulfillment.service.js';

interface BotPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  periodDays: number;
  starsPrice: number | null;
}

@Injectable()
export class StorefrontService {
  private readonly logger = new Logger(StorefrontService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tg: TelegramService,
    private readonly fulfillment: FulfillmentService,
  ) {}

  /** Активные тарифы, чьи каналы обслуживает данный бот. */
  private async plansForBot(botId: string): Promise<BotPlan[]> {
    const rows = await this.db
      .selectDistinct({
        id: plans.id,
        name: plans.name,
        price: plans.price,
        currency: plans.currency,
        periodDays: plans.periodDays,
        starsPrice: plans.starsPrice,
      })
      .from(plans)
      .innerJoin(planChannels, eq(planChannels.planId, plans.id))
      .innerJoin(channels, eq(channels.id, planChannels.channelId))
      .where(and(eq(channels.botId, botId), eq(plans.isActive, true)));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
      currency: r.currency,
      periodDays: r.periodDays,
      starsPrice: r.starsPrice,
    }));
  }

  private period(days: number): string {
    return days === 0 ? 'навсегда' : `${days} дн.`;
  }

  private starsAmount(p: BotPlan): number {
    return p.starsPrice ?? Math.max(1, Math.round(p.price));
  }

  async onStart(botId: string, msg: Message): Promise<void> {
    const tgUserId = msg.from?.id;
    if (!tgUserId) return;
    const payload = (msg.text ?? '').split(/\s+/)[1];
    let list = await this.plansForBot(botId);
    if (payload?.startsWith('plan_')) {
      const id = payload.slice(5);
      list = list.filter((p) => p.id === id);
    }
    if (!list.length) {
      await this.tg.sendMessage(
        botId,
        tgUserId,
        'Пока нет доступных тарифов. Загляните чуть позже 🙌',
      );
      return;
    }
    const keyboard = list.map((p) => [
      { text: `💳 ${p.name} — ${p.price} ${p.currency === 'RUB' ? '₽' : p.currency}`, callback_data: `buy:${p.id}` },
    ]);
    await this.tg.sendMessage(
      botId,
      tgUserId,
      'Выберите тариф, чтобы получить доступ:',
      { inline_keyboard: keyboard },
    );
  }

  async onCallback(botId: string, cq: CallbackQuery): Promise<void> {
    const data = (cq as { data?: string }).data ?? '';
    const tgUserId = cq.from.id;
    await this.tg.answerCallbackQuery(botId, cq.id);

    if (data.startsWith('buy:')) {
      const planId = data.slice(4);
      const plan = (await this.plansForBot(botId)).find((p) => p.id === planId);
      if (!plan) return;
      const keyboard = [
        [{ text: `⭐ Оплатить Telegram Stars`, callback_data: `pays:${planId}` }],
      ];
      await this.tg.sendMessage(
        botId,
        tgUserId,
        `<b>${plan.name}</b>\nЦена: ${plan.price} ${plan.currency === 'RUB' ? '₽' : plan.currency} · ${this.period(plan.periodDays)}\n\nСпособ оплаты:`,
        { inline_keyboard: keyboard },
      );
      return;
    }

    if (data.startsWith('pays:')) {
      const planId = data.slice(5);
      const plan = (await this.plansForBot(botId)).find((p) => p.id === planId);
      if (!plan) return;
      await this.tg.sendStarsInvoice(botId, tgUserId, {
        title: plan.name,
        description: `Подписка «${plan.name}» на ${this.period(plan.periodDays)}`,
        payload: `plan:${planId}`,
        amount: this.starsAmount(plan),
        label: plan.name,
      });
      return;
    }
  }

  async onPreCheckout(botId: string, pcq: PreCheckoutQuery): Promise<void> {
    await this.tg.answerPreCheckoutQuery(botId, pcq.id, true);
  }

  async onSuccessfulPayment(botId: string, msg: Message): Promise<void> {
    const sp = msg.successful_payment;
    if (!sp || !msg.from) return;
    const payload = sp.invoice_payload ?? '';
    if (!payload.startsWith('plan:')) return;
    const planId = payload.slice(5);
    await this.fulfillment.fulfill({
      botId,
      tgUserId: msg.from.id,
      username: msg.from.username,
      firstName: msg.from.first_name,
      planId,
      provider: 'stars',
      providerPaymentId: sp.telegram_payment_charge_id,
      rawAmount: sp.total_amount,
      rawCurrency: sp.currency,
    });
  }
}
