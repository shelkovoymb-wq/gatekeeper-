import { Injectable } from '@nestjs/common';
import {
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
  type WebhookVerifyContext,
} from '../payment.types.js';

@Injectable()
export class TelegramStarsProvider implements PaymentProviderAdapter {
  name = 'stars';

  async initiate(_request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const paymentId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Stars оплачиваются нативным инвойсом в самом Telegram; внешнего URL нет.
    return { url: null, paymentId };
  }

  /**
   * Stars подтверждаются ИСКЛЮЧИТЕЛЬНО через апдейт successful_payment,
   * пришедший в защищённый секретом /tg/webhook/:botId (см. TelegramController
   * и StorefrontService.onSuccessfulPayment). Публичный общий вебхук-роут
   * /payments/webhook/:provider не должен принимать 'stars' вовсе — иначе
   * кто угодно мог бы прислать сюда поддельный successful_payment без
   * какой-либо проверки со стороны Telegram. Это намеренно не реализовано.
   */
  verify(_ctx: WebhookVerifyContext): Promise<PaymentWebhook> {
    throw new Error(
      'stars payments are confirmed only via the authenticated Telegram bot update channel',
    );
  }

  async refund(_paymentId: string): Promise<boolean> {
    return true;
  }
}
