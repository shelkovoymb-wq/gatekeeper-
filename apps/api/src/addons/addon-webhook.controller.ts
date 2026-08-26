import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { prodamusSignature } from '../payments/providers/prodamus-signature.js';
import { AddonsService } from './addons.service.js';
import {
  amountOf,
  eventKeyOf,
  eventTypeOf,
  parseOrderNum,
  type WebhookBody,
} from './addon-webhook.js';

/**
 * Вебхук оплаты платных опций.
 *
 * Это деньги клиента платформе (за опцию), а не деньги подписчика клиенту —
 * поэтому и путь отдельный, и шлюз здесь один, наш собственный кабинет.
 *
 * Порядок действий взят из скилла prodamus-subscription и менять его нельзя:
 * подпись → тип события → клиент → сумма → ЗАМОК идемпотентности → обновление
 * подписки. Каждый пункт когда-то стоил кому-то денег.
 */
@Controller('billing/addon')
export class AddonWebhookController {
  private readonly logger = new Logger(AddonWebhookController.name);

  constructor(
    private readonly addons: AddonsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handle(@Body() body: WebhookBody, @Headers() headers: Record<string, string | undefined>) {
    const secret = this.env.ADDON_PAYMENT_SECRET;
    if (!secret) {
      // Принимать непроверяемые деньги хуже, чем не принимать их вовсе: шлюз
      // повторит доставку, когда ключ появится.
      this.logger.error('ADDON_PAYMENT_SECRET не задан — вебхук опций отключён');
      throw new ServiceUnavailableException('addon billing not configured');
    }

    const type = eventTypeOf(body);
    const eventKey = eventKeyOf(body, type);
    const order = parseOrderNum(body.order_num);
    const amount = amountOf(body);
    const provided = headers['sign'] ?? headers['x-prodamus-signature'] ?? '';

    // ── 1. Подпись. Событие пишем в журнал ВСЕГДА, даже неподписанное:
    //       иначе жалобу «я оплатил, доступа нет» разбирать нечем.
    const rest = { ...body } as Record<string, unknown>;
    delete rest.sign;
    const expected = prodamusSignature(secret, rest);
    if (!provided || !equalSignatures(provided, expected)) {
      await this.addons.recordEvent({
        eventKey: `invalid|${eventKey}`,
        eventType: 'invalid_signature',
        clientId: null,
        addonCode: order?.addonCode ?? null,
        amount,
        currency: body.currency ?? null,
        signature: provided || null,
        rawPayload: body,
      });
      throw new UnauthorizedException('bad signature');
    }

    // ── 2. Клиент. Ошибка поиска — это НЕ «клиента нет»: молча ответив 200,
    //       мы потеряем платёж навсегда, поэтому здесь ничего не глотаем.
    const clientId = order ? await this.addons.findClient(order.clientId) : null;
    const addonCode = order?.addonCode ?? 'posting';

    if (!clientId || type === 'unknown') {
      await this.addons.recordEvent({
        eventKey,
        eventType: clientId ? `${type}:ignored` : 'client_not_found',
        clientId,
        addonCode,
        amount,
        currency: body.currency ?? null,
        signature: provided,
        rawPayload: body,
      });
      this.logger.warn(`событие ${type} без обработки (клиент: ${clientId ?? 'не найден'})`);
      return { ok: true };
    }

    // ── 3. Сумма ниже минимальной подписку не активирует: это защита от
    //       поддельного вебхука на рубль.
    if (type === 'payment.success' && amount < this.env.MIN_ADDON_AMOUNT) {
      await this.addons.recordEvent({
        eventKey,
        eventType: 'rejected_low_amount',
        clientId,
        addonCode,
        amount,
        currency: body.currency ?? null,
        signature: provided,
        rawPayload: body,
      });
      this.logger.warn(`сумма ${amount} ниже минимальной, опция не активирована`);
      return { ok: true };
    }

    // ── 4. ЗАМОК. Ставится ДО изменения подписки: повтор доставки не должен
    //       продлить оплаченный период второй раз.
    const fresh = await this.addons.recordEvent({
      eventKey,
      eventType: type,
      clientId,
      addonCode,
      amount,
      currency: body.currency ?? null,
      signature: provided,
      rawPayload: body,
    });
    if (!fresh) return { ok: true, duplicate: true };

    // ── 5. Подписка. Если апдейт не прошёл — снимаем замок, иначе событие
    //       останется «обработанным», а статус не применится никогда.
    try {
      if (type === 'payment.success') {
        await this.addons.activate(clientId, addonCode, {
          gatewaySubscriptionId: body.subscription?.id ? String(body.subscription.id) : null,
          email: body.customer_email ?? null,
          phone: body.customer_phone ?? null,
        });
      } else if (type === 'payment.failed') {
        // Оплаченный вперёд период при этом не отбирается — только статус.
        await this.addons.markClosing(clientId, addonCode, 'past_due');
      } else if (type === 'subscription.deactivated') {
        await this.addons.markClosing(clientId, addonCode, 'past_due');
      }
    } catch (e) {
      await this.addons.dropEvent(eventKey);
      this.logger.error(`не удалось применить ${type} к ${clientId}: ${String(e)}`);
      throw e; // 500 — шлюз повторит доставку
    }

    return { ok: true };
  }
}

/** Сравнение подписей за постоянное время: побайтовое сравнение подсказывает подбор. */
function equalSignatures(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
