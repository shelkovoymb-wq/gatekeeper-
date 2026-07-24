import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
} from '../payment.types.js';

@Injectable()
export class CloudPaymentsProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(CloudPaymentsProvider.name);
  name = 'cloudpayments';

  async initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const publicId = process.env[`CLOUDPAYMENTS_PUBLIC_ID_${request.clientId.toUpperCase()}`];
    const apiSecret = process.env[`CLOUDPAYMENTS_API_SECRET_${request.clientId.toUpperCase()}`];
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

  verify(payload: unknown): PaymentWebhook {
    const p = payload as Record<string, string>;
    return {
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
    };
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    this.logger.log(`CloudPayments refund: ${paymentId} (${amount ?? 'full'})`);
    return true;
  }
}
