import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import crypto, { timingSafeEqual } from 'node:crypto';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
  type WebhookVerifyContext,
} from '../payment.types.js';
import { ProviderCredentials } from '../provider-credentials.js';

@Injectable()
export class RobokassaProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(RobokassaProvider.name);
  name = 'robokassa';
  private readonly checkoutUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx';

  constructor(private readonly credentials: ProviderCredentials) {}

  private md5(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex');
  }

  async initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    const creds = await this.credentials.get(request.clientId, 'robokassa');
    const merchantLogin = this.credentials.pick(
      creds,
      'merchantLogin',
      'ROBOKASSA_MERCHANT_LOGIN',
      request.clientId,
    );
    const password1 = this.credentials.pick(
      creds,
      'password1',
      'ROBOKASSA_PASSWORD1',
      request.clientId,
    );
    if (!merchantLogin || !password1) {
      throw new BadRequestException(`Robokassa not configured for client ${request.clientId}`);
    }

    const invoiceId = `inv_${Date.now()}`;
    const sum = (request.amount / 100).toFixed(2);
    // Shp_-параметры Робокасса возвращает без изменений в уведомлении на ResultURL —
    // это единственный способ узнать clientId при проверке подписи вебхука,
    // поэтому он обязательно участвует в подписи запроса на оплату.
    const shpClientId = `Shp_clientId=${request.clientId}`;
    const signature = this.md5(`${merchantLogin}:${sum}:${invoiceId}:${password1}:${shpClientId}`);
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
      Shp_clientId: request.clientId,
    });

    return { url: `${this.checkoutUrl}?${params.toString()}`, paymentId: invoiceId };
  }

  /**
   * Робокасса подписывает уведомление на ResultURL отдельным паролем
   * (Password #2, НЕ тем же, что используется для инициации оплаты) —
   * SignatureValue = MD5(OutSum:InvId:Password2:Shp_clientId=...).
   * Без сверки подписи любой мог прислать поддельное подтверждение оплаты.
   */
  async verify(ctx: WebhookVerifyContext): Promise<PaymentWebhook> {
    const p = ctx.body as Record<string, string>;
    const clientId = p.Shp_clientId;
    if (!clientId) {
      throw new Error('robokassa webhook: missing Shp_clientId');
    }
    const creds = await this.credentials.get(clientId, 'robokassa');
    const password2 = this.credentials.pick(
      creds,
      'password2',
      'ROBOKASSA_PASSWORD2',
      clientId,
    );
    if (!password2) {
      throw new Error(`Robokassa result password not configured for client ${clientId}`);
    }
    const expected = this.md5(
      `${p.OutSum}:${p.InvId}:${password2}:Shp_clientId=${clientId}`,
    ).toUpperCase();
    const provided = (p.SignatureValue || '').toUpperCase();
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('robokassa webhook: signature mismatch');
    }

    return Promise.resolve({
      provider: 'robokassa',
      providerPaymentId: p.InvId,
      status: PaymentStatus.SUCCEEDED,
      amount: Math.round(parseFloat(p.OutSum) * 100),
      currency: 'RUB',
      timestamp: Date.now(),
      data: { invoice_id: p.InvId, client_id: clientId },
    });
  }

  async refund(paymentId: string, _amount?: number): Promise<boolean> {
    this.logger.warn(`Robokassa refund: ${paymentId} requires manual support request`);
    return false;
  }
}
