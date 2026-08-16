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
export class CloudPaymentsProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(CloudPaymentsProvider.name);
  name = 'cloudpayments';

  constructor(private readonly credentials: ProviderCredentials) {}

  async initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const creds = await this.credentials.get(request.clientId, 'cloudpayments');
    const publicId = this.credentials.pick(
      creds,
      'publicId',
      'CLOUDPAYMENTS_PUBLIC_ID',
      request.clientId,
    );
    const apiSecret = this.credentials.pick(
      creds,
      'apiSecret',
      'CLOUDPAYMENTS_API_SECRET',
      request.clientId,
    );
    if (!publicId || !apiSecret) {
      throw new BadRequestException(`CloudPayments not configured for client ${request.clientId}`);
    }

    const checkoutUrl = new URL('https://checkout.cloudpayments.ru/');
    checkoutUrl.searchParams.append('PublicId', publicId);
    checkoutUrl.searchParams.append('Amount', (request.amount / 100).toFixed(2));
    checkoutUrl.searchParams.append('Currency', request.currency || 'RUB');
    checkoutUrl.searchParams.append('OrderId', `order_${Date.now()}`);
    checkoutUrl.searchParams.append('Description', request.description);
    checkoutUrl.searchParams.append('InvoiceId', `invoice_${request.subscriptionId}`);
    checkoutUrl.searchParams.append('AccountId', request.clientId);
    checkoutUrl.searchParams.append(
      'JsonData',
      JSON.stringify({
        clientId: request.clientId,
        subscriberId: request.subscriberId,
        subscriptionId: request.subscriptionId,
        ...request.metadata,
      }),
    );

    const paymentId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return { url: checkoutUrl.toString(), paymentId };
  }

  /**
   * CloudPayments подписывает каждый вебхук заголовком Content-HMAC
   * (base64(HMAC-SHA256(сырое тело, ApiSecret магазина))). Без сверки этой
   * подписи любой мог бы прислать поддельное "Status: 0" и получить доступ
   * бесплатно — поэтому статус принимается только если подпись совпала.
   */
  async verify(ctx: WebhookVerifyContext): Promise<PaymentWebhook> {
    const p = ctx.body as Record<string, string>;
    const clientId = p.AccountId;
    if (!clientId) {
      throw new Error('cloudpayments webhook: missing AccountId');
    }
    const creds = await this.credentials.get(clientId, 'cloudpayments');
    const apiSecret = this.credentials.pick(
      creds,
      'apiSecret',
      'CLOUDPAYMENTS_API_SECRET',
      clientId,
    );
    if (!apiSecret) {
      throw new Error(`CloudPayments not configured for client ${clientId}`);
    }
    const headerSig = ctx.headers['content-hmac'];
    const providedSig = Array.isArray(headerSig) ? headerSig[0] : headerSig;
    if (!ctx.rawBody || !providedSig) {
      throw new Error('cloudpayments webhook: missing signature or raw body');
    }
    const expectedSig = createHmac('sha256', apiSecret).update(ctx.rawBody).digest('base64');
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('cloudpayments webhook: signature mismatch');
    }

    return Promise.resolve({
      provider: 'cloudpayments',
      providerPaymentId: p.TransactionId || p.InvoiceId,
      status:
        p.Status === '0'
          ? PaymentStatus.SUCCEEDED
          : p.Status === '1'
            ? PaymentStatus.FAILED
            : PaymentStatus.PENDING,
      amount: Math.round(parseFloat(p.Amount) * 100),
      currency: p.Currency || 'RUB',
      timestamp: Date.now(),
      data: { email: p.Email, phone: p.Phone, ip: p.IpAddress, json_data: p.JsonData },
    });
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    this.logger.log(`CloudPayments refund: ${paymentId} (${amount ?? 'full'})`);
    return true;
  }
}
