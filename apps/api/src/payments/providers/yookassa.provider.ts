import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import crypto from 'node:crypto';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
  type WebhookVerifyContext,
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

  /**
   * ЮKassa не подписывает вебхуки — единственный надёжный способ проверки
   * рекомендованный самой ЮKassa: НЕ доверять статусу из тела запроса,
   * а запросить платёж напрямую через API своими же (shopId/secretKey)
   * учётными данными и доверять только этому ответу. Так подделать вебхук
   * нельзя — у атакующего нет секретного ключа магазина.
   */
  async verify(ctx: WebhookVerifyContext): Promise<PaymentWebhook> {
    const body = ctx.body as { object?: { id?: string; metadata?: Record<string, string> } };
    const paymentId = body?.object?.id;
    const clientId = body?.object?.metadata?.clientId;
    if (!paymentId || !clientId) {
      throw new Error('yookassa webhook: missing object.id or object.metadata.clientId');
    }

    const shopId = process.env[`YOOKASSA_SHOP_ID_${clientId.toUpperCase()}`];
    const secretKey = process.env[`YOOKASSA_SECRET_${clientId.toUpperCase()}`];
    if (!shopId || !secretKey) {
      throw new Error(`YooKassa not configured for client ${clientId}`);
    }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64');
    const res = await fetch(`${this.apiUrl}/${paymentId}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) {
      throw new Error(`YooKassa confirm request failed: ${res.status}`);
    }
    const payment = (await res.json()) as {
      id: string;
      status: string;
      amount: { value: string; currency: string };
      created_at: string;
      receipt_email?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    };
    if (payment.id !== paymentId) {
      throw new Error('yookassa webhook: payment id mismatch after confirmation');
    }

    return {
      provider: 'yookassa',
      providerPaymentId: payment.id,
      status:
        payment.status === 'succeeded'
          ? PaymentStatus.SUCCEEDED
          : payment.status === 'canceled'
            ? PaymentStatus.CANCELLED
            : PaymentStatus.FAILED,
      amount: Math.round(parseFloat(payment.amount.value) * 100),
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
