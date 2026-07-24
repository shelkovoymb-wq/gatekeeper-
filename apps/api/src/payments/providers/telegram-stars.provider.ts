import { Injectable } from '@nestjs/common';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
} from '../payment.types.js';

@Injectable()
export class TelegramStarsProvider implements PaymentProviderAdapter {
  name = 'stars';

  async initiate(_request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const paymentId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    // Stars оплачиваются нативным инвойсом в самом Telegram; внешнего URL нет.
    return { url: null, paymentId };
  }

  verify(payload: unknown): PaymentWebhook {
    const { successful_payment } = payload as {
      successful_payment: {
        telegram_payment_charge_id: string;
        provider_payment_charge_id: string;
        total_amount: number;
      };
    };
    return {
      provider: 'stars',
      providerPaymentId: successful_payment.telegram_payment_charge_id,
      status: PaymentStatus.SUCCEEDED,
      amount: successful_payment.total_amount,
      currency: 'XTR',
      timestamp: Date.now(),
      data: { provider_payment_charge_id: successful_payment.provider_payment_charge_id },
    };
  }

  async refund(_paymentId: string): Promise<boolean> {
    return true;
  }
}
