import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import crypto from 'node:crypto';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
} from '../payment.types.js';

@Injectable()
export class RobokassaProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(RobokassaProvider.name);
  name = 'robokassa';
  private readonly checkoutUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';

  private md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
  }

  async initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const merchantLogin = process.env[`ROBOKASSA_MERCHANT_LOGIN_${request.clientId.toUpperCase()}`];
    const password1 = process.env[`ROBOKASSA_PASSWORD1_${request.clientId.toUpperCase()}`];
    if (!merchantLogin || !password1) {
      throw new BadRequestException(`Robokassa not configured for client ${request.clientId}`);
    }

    const invoiceId = `inv_${Date.now()}`;
    const sum = (request.amount / 100).toFixed(2);
    const signature = this.md5(`${merchantLogin}:${sum}:${invoiceId}:${password1}`);
    const email = (request.metadata?.email as string) ?? '';

    const params = new URLSearchParams({
      MerchantLogin: merchantLogin,
      Sum: sum,
      InvoiceID: invoiceId,
      Description: request.description,
      SignatureValue: signature,
      Email: email,
      Encoding: 'utf-8',
      Culture: 'ru',
    });

    return { url: `${this.checkoutUrl}?${params.toString()}`, paymentId: invoiceId };
  }

  verify(payload: unknown): PaymentWebhook {
    const p = payload as Record<string, string>;
    return {
      provider: 'robokassa',
      providerPaymentId: p.OperationId || p.InvoiceID,
      status:
        p.Status === 'received' || p.Status === 'confirmed'
          ? PaymentStatus.SUCCEEDED
          : PaymentStatus.FAILED,
      amount: Math.round(parseFloat(p.Sum) * 100),
      currency: 'RUB',
      timestamp: Date.now(),
      data: { invoice_id: p.InvoiceID, operation_id: p.OperationId, status: p.Status },
    };
  }

  async refund(paymentId: string, _amount?: number): Promise<boolean> {
    this.logger.warn(`Robokassa refund: ${paymentId} requires manual support request`);
    return false;
  }
}
