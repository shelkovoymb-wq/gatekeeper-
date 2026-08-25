import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { CallbackQuery, Message, PreCheckoutQuery } from 'grammy/types';
import { DB, type Database } from '../db/db.module.js';
import { bots, channels, directPaymentAccounts, paymentConfigs, planChannels, plans } from '../db/schema.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import type { PaymentInstruction, PaymentRequest } from '../payments/payment.types.js';
import { FulfillmentService } from './fulfillment.service.js';

/** Подписи кнопок способов оплаты в витрине бота. */
const PROVIDER_LABELS: Record<string, string> = {
  yookassa: '💳 Картой через ЮKassa',
  cloudpayments: '💳 Картой через CloudPayments',
  robokassa: '💳 Картой через Robokassa',
  prodamus: '💳 Картой через Prodamus',
};

const DIRECT_LABELS: Record<string, string> = {
  sbp: '⚡ Перевод по СБП',
  card: '💳 Перевод на карту',
  bank_account: '🏦 Перевод на счёт',
  paypal: '🌐 PayPal',
  crypto: '₿ Криптовалютой',
};

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
    private readonly payments: PaymentsService,
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

  /** Клиент, которому принадлежит бот, — он же получатель денег. */
  private async clientOfBot(botId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ clientId: bots.clientId })
      .from(bots)
      .where(eq(bots.id, botId))
      .limit(1);
    return row?.clientId ?? null;
  }

  /**
   * Способы оплаты, которые реально можно предложить подписчику.
   *
   * Раньше здесь была одна захардкоженная кнопка со звёздами: клиент настраивал
   * ЮKassa или СБП и ждал платежей, которых быть не могло. Теперь список
   * собирается из того, что клиент включил в кабинете.
   */
  private async methodsForBot(
    botId: string,
  ): Promise<{ label: string; callback: (planId: string) => string }[]> {
    const clientId = await this.clientOfBot(botId);
    if (!clientId) return [];

    const configs = await this.db
      .select({ provider: paymentConfigs.provider })
      .from(paymentConfigs)
      .where(and(eq(paymentConfigs.clientId, clientId), eq(paymentConfigs.isActive, true)));

    const out: { label: string; callback: (planId: string) => string }[] = [];

    for (const c of configs) {
      if (c.provider === 'stars') {
        out.push({ label: '⭐ Telegram Stars', callback: (id) => `pays:${id}` });
        continue;
      }
      const label = PROVIDER_LABELS[c.provider];
      if (!label) continue;
      out.push({ label, callback: (id) => `payp:${c.provider}|${id}` });
    }

    const [account] = await this.db
      .select({ accountType: directPaymentAccounts.accountType })
      .from(directPaymentAccounts)
      .where(
        and(
          eq(directPaymentAccounts.clientId, clientId),
          eq(directPaymentAccounts.isActive, true),
        ),
      )
      .limit(1);

    if (account) {
      out.push({
        label: DIRECT_LABELS[account.accountType] ?? '🏦 Перевод по реквизитам',
        callback: (id) => `payd:${id}`,
      });
    }

    return out;
  }

  /**
   * Запрос на создание платежа. В metadata кладётся всё, что понадобится,
   * когда придёт вебхук: по ним PaymentsService выдаст доступ, не зная ничего
   * о витрине.
   */
  private async paymentRequest(
    botId: string,
    plan: BotPlan,
    provider: string,
    cq: CallbackQuery,
  ): Promise<PaymentRequest> {
    const clientId = await this.clientOfBot(botId);
    if (!clientId) throw new Error(`bot ${botId} has no client`);
    return {
      clientId,
      // Сумма в копейках — так её ждут все провайдеры.
      amount: Math.round(plan.price * 100),
      currency: plan.currency,
      provider,
      description: `Подписка «${plan.name}» на ${this.period(plan.periodDays)}`,
      metadata: {
        botId,
        planId: plan.id,
        tgUserId: cq.from.id,
        username: cq.from.username ?? null,
        firstName: cq.from.first_name ?? null,
        // Прямой перевод идёт на реквизиты этого же клиента.
        payeeClientId: clientId,
      },
    };
  }

  /** Реквизиты получателя человеческим текстом. */
  private instructionText(plan: BotPlan, i?: PaymentInstruction): string {
    if (!i) return 'Реквизиты недоступны. Попробуйте другой способ оплаты.';

    const lines: string[] = [
      `<b>${plan.name}</b>`,
      `К переводу: <b>${i.amount} ${i.currency === 'RUB' ? '₽' : i.currency}</b>`,
      '',
    ];

    if (i.accountType === 'sbp') lines.push(`СБП, телефон: <code>${i.phoneNumber ?? '—'}</code>`);
    if (i.accountType === 'card') {
      lines.push(`Карта: <code>${i.cardNumber ?? '—'}</code>`);
      if (i.cardHolder) lines.push(`Получатель: ${i.cardHolder}`);
    }
    if (i.accountType === 'bank_account') {
      if (i.bankName) lines.push(`Банк: ${i.bankName}`);
      lines.push(`Счёт: <code>${i.accountNumber ?? '—'}</code>`);
      if (i.bic) lines.push(`БИК: <code>${i.bic}</code>`);
      if (i.inn) lines.push(`ИНН: <code>${i.inn}</code>`);
    }
    if (i.accountType === 'paypal') lines.push(`PayPal: <code>${i.email ?? '—'}</code>`);
    if (i.accountType === 'crypto') {
      lines.push(`Сеть: ${(i.cryptoType ?? '').toUpperCase()}`);
      lines.push(`Адрес: <code>${i.cryptoAddress ?? '—'}</code>`);
    }

    lines.push(
      '',
      `Назначение платежа: <code>${i.orderId}</code>`,
      '',
      'После перевода получатель подтвердит оплату, и доступ придёт сюда. Обычно это занимает некоторое время.',
    );
    return lines.join('\n');
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
      {
        text:
          p.price <= 0
            ? `🎁 ${p.name} — бесплатно`
            : `💳 ${p.name} — ${p.price} ${p.currency === 'RUB' ? '₽' : p.currency}`,
        callback_data: `buy:${p.id}`,
      },
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

      // Уже есть активная подписка на этот тариф — не просим оплатить повторно,
      // сразу пускаем в канал по свежей ссылке.
      const reissued = await this.fulfillment.reissueIfActive({
        botId,
        tgUserId,
        username: cq.from.username,
        firstName: cq.from.first_name,
        planId,
      });
      if (reissued) return;

      // Бесплатный тариф — сразу выдаём доступ, без экрана оплаты.
      if (plan.price <= 0) {
        await this.fulfillment.fulfill({
          botId,
          tgUserId,
          username: cq.from.username,
          firstName: cq.from.first_name,
          planId,
          provider: 'free',
          providerPaymentId: `free:${tgUserId}:${planId}:${Date.now()}`,
          rawAmount: 0,
          rawCurrency: plan.currency,
        });
        return;
      }

      const methods = await this.methodsForBot(botId);
      if (!methods.length) {
        await this.tg.sendMessage(
          botId,
          tgUserId,
          'Оплата пока не настроена. Напишите владельцу канала 🙏',
        );
        return;
      }

      const keyboard = methods.map((m) => [{ text: m.label, callback_data: m.callback(planId) }]);
      await this.tg.sendMessage(
        botId,
        tgUserId,
        `<b>${plan.name}</b>\nЦена: ${plan.price} ${plan.currency === 'RUB' ? '₽' : plan.currency} · ${this.period(plan.periodDays)}\n\nСпособ оплаты:`,
        { inline_keyboard: keyboard },
      );
      return;
    }

    // Оплата через платёжную систему: создаём платёж и отдаём ссылку.
    if (data.startsWith('payp:')) {
      const [provider, planId] = data.slice(5).split('|');
      const plan = (await this.plansForBot(botId)).find((p) => p.id === planId);
      if (!plan) return;

      try {
        const { url } = await this.payments.initiatePayment(
          await this.paymentRequest(botId, plan, provider, cq),
        );
        if (!url) {
          await this.tg.sendMessage(botId, tgUserId, 'Платёжная система не вернула ссылку. Попробуйте другой способ.');
          return;
        }
        await this.tg.sendMessage(
          botId,
          tgUserId,
          `<b>${plan.name}</b>\nК оплате: ${plan.price} ${plan.currency === 'RUB' ? '₽' : plan.currency}\n\nПосле оплаты доступ придёт сюда автоматически.`,
          { inline_keyboard: [[{ text: '💳 Перейти к оплате', url }]] },
        );
      } catch (e) {
        this.logger.error(`initiate ${provider} failed: ${String(e)}`);
        await this.tg.sendMessage(botId, tgUserId, 'Не удалось создать платёж. Попробуйте другой способ.');
      }
      return;
    }

    // Прямой перевод: создаём платёж и показываем реквизиты получателя.
    if (data.startsWith('payd:')) {
      const planId = data.slice(5);
      const plan = (await this.plansForBot(botId)).find((p) => p.id === planId);
      if (!plan) return;

      try {
        const { instruction } = await this.payments.initiatePayment(
          await this.paymentRequest(botId, plan, 'direct', cq),
        );
        await this.tg.sendMessage(botId, tgUserId, this.instructionText(plan, instruction));
      } catch (e) {
        this.logger.error(`initiate direct failed: ${String(e)}`);
        await this.tg.sendMessage(botId, tgUserId, 'Реквизиты для перевода недоступны. Попробуйте другой способ.');
      }
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
