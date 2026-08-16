import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
  type WebhookVerifyContext,
} from '../payment.types.js';
import { ProviderCredentials } from '../provider-credentials.js';

@Injectable()
export class ProdamusProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(ProdamusProvider.name);
  name = 'prodamus';
  private readonly apiUrl = 'https://api.prodamus.ru/v1/payment/create';

  constructor(private readonly credentials: ProviderCredentials) {}

  async initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const creds = await this.credentials.get(request.clientId, 'prodamus');
    const apiKey = this.credentials.pick(creds, 'apiKey', 'PRODAMUS_API_KEY', request.clientId);
    const secretKey = this.credentials.pick(
      creds,
      'secretKey',
      'PRODAMUS_SECRET_KEY',
      request.clientId,
    );
    if (!apiKey || !secretKey) {
      throw new BadRequestException(`Prodamus not configured for client ${request.clientId}`);
    }

    const paymentId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const payload = {
      amount: request.amount / 100,
      currency: request.currency || 'RUB',
      order_id: paymentId,
      description: request.description,
      return_url: `${process.env.PUBLIC_API_URL}/payments/success?provider=prodamus&paymentId=${paymentId}`,
      fail_url: `${process.env.PUBLIC_API_URL}/payments/fail?provider=prodamus&paymentId=${paymentId}`,
      // Наружу проброшен только /payments/webhook/ (см. gatekeeper-proxy),
      // и контроллер слушает ровно этот путь — @Post('webhook/:provider').
      notification_url: `${process.env.PUBLIC_API_URL}/payments/webhook/prodamus`,
      metadata: {
        clientId: request.clientId,
        subscriberId: request.subscriberId,
        subscriptionId: request.subscriptionId,
        ...request.metadata,
      },
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        id?: string;
        payment_url?: string;
        error?: string;
      };

      if (!response.ok) {
        this.logger.error(`Prodamus API error: ${data.error || 'Unknown error'}`);
        throw new BadRequestException(
          `Prodamus payment init failed: ${data.error || 'Unknown error'}`,
        );
      }

      return {
        url: data.payment_url || null,
        paymentId: data.id || paymentId,
      };
    } catch (error) {
      this.logger.error(`Prodamus initiate error: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Prodamus подписывает вебхуки HMAC-SHA256 подписью в заголовке X-Prodamus-Signature.
   * Подпись вычисляется из сырого тела запроса и секретного ключа.
   */
  async verify(ctx: WebhookVerifyContext): Promise<PaymentWebhook> {
    const body = ctx.body as Record<string, unknown>;
    const orderId = body.order_id as string | undefined;
    const paymentId = body.id as string | undefined;

    if (!orderId && !paymentId) {
      throw new Error('prodamus webhook: missing order_id or id');
    }

    const metadata = body.metadata as Record<string, string> | undefined;
    const clientId = metadata?.clientId;
    if (!clientId) {
      throw new Error('prodamus webhook: missing clientId in metadata');
    }

    const creds = await this.credentials.get(clientId, 'prodamus');
    const secretKey = this.credentials.pick(creds, 'secretKey', 'PRODAMUS_SECRET_KEY', clientId);
    if (!secretKey) {
      throw new Error(`Prodamus not configured for client ${clientId}`);
    }

    const headerSig = ctx.headers['x-prodamus-signature'];
    const providedSig = Array.isArray(headerSig) ? headerSig[0] : headerSig;

    if (!ctx.rawBody || !providedSig) {
      throw new Error('prodamus webhook: missing signature or raw body');
    }

    const expectedSig = createHmac('sha256', secretKey).update(ctx.rawBody).digest('hex');
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('prodamus webhook: signature mismatch');
    }

    const statusMap: Record<string, PaymentStatus> = {
      completed: PaymentStatus.SUCCEEDED,
      paid: PaymentStatus.SUCCEEDED,
      success: PaymentStatus.SUCCEEDED,
      failed: PaymentStatus.FAILED,
      cancelled: PaymentStatus.CANCELLED,
      pending: PaymentStatus.PENDING,
    };

    const status = statusMap[(body.status as string)?.toLowerCase()] || PaymentStatus.PENDING;

    return {
      provider: 'prodamus',
      providerPaymentId: (paymentId || orderId) as string,
      status,
      amount: Math.round((body.amount as number) * 100),
      currency: (body.currency as string) || 'RUB',
      timestamp: body.created_at
        ? new Date(body.created_at as string).getTime()
        : Date.now(),
      data: {
        order_id: orderId,
        payment_id: paymentId,
        email: body.email,
        phone: body.phone,
        status: body.status,
        metadata,
      },
    };
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    this.logger.log(`Prodamus refund: ${paymentId} (${amount ?? 'full'})`);
    // TODO: Implement actual refund logic via Prodamus API
    return true;
  }
}
