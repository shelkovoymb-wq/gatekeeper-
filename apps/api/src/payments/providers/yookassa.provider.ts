import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import crypto from 'node:crypto';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
} from '../payment.types.js';

@Injectable()
export class YooKassaProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(YooKassaProvider.name);
  name = 'yookassa';
  private readonly apiUrl = 'https://api.yookassa.ru/v3/payments';

  async initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const shopId = process.env[`YOOKASSA_SHOP_ID_${request.clientId.toUpperCase()}`];
    const secretKey = process.env[`YOOKASSA_SECRET_${request.clientId.toUpperCase()}`];
    if (!shopId || !secretKey) {
      throw new BadRequestException(`YooKassa not configured for client ${request.clientId}`);
    }

    const idempotencyKey = crypto.randomUUID();
    const payload = {
      amount: { value: (request.amount / 100).toFixed(2), currency: request.currency || 'RUB' },
      description: request.description,
      confirmation: {
        type: 'redirect',
        return_url: `${process.env.PUBLIC_API_URL}/payments/success?provider=yookassa`,
      },
      metadata: {
        clientId: request.clientId,
        subscriberId: request.subscriberId,
        subscriptionId: request.subscriptionId,
        ...request.metadata,
      },
    };

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        id: string;
        description?: string;
        confirmation: { confirmation_url: string };
      };
      if (!response.ok) {
        this.logger.error(`YooKassa API error: ${data.description}`);
        throw new BadRequestException(`YooKassa payment init failed: ${data.description}`);
      }
      return { url: data.confirmation.confirmation_url, paymentId: data.id };
    } catch (error) {
      this.logger.error(`YooKassa initiate error: ${(error as Error).message}`);
      throw error;
    }
  }

  verify(payload: unknown): PaymentWebhook {
    const payment = (payload as { object: any }).object;
    return {
      provider: 'yookassa',
      providerPaymentId: payment.id,
      status:
        payment.status === 'succeeded'
          ? PaymentStatus.SUCCEEDED
          : payment.status === 'canceled'
            ? PaymentStatus.CANCELLED
            : PaymentStatus.FAILED,
      amount: parseInt(payment.amount.value, 10) * 100,
      currency: payment.amount.currency,
      timestamp: new Date(payment.created_at).getTime(),
      data: {
        receipt_email: payment.receipt_email,
        description: payment.description,
        metadata: payment.metadata,
      },
    };
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    this.logger.log(`YooKassa refund: ${paymentId} (${amount ?? 'full'})`);
    return true;
  }
}
