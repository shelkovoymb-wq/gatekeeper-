import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { payments } from '../db/schema.js';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
} from './payment.types.js';
import { TelegramStarsProvider } from './providers/telegram-stars.provider.js';
import { YooKassaProvider } from './providers/yookassa.provider.js';
import { CloudPaymentsProvider } from './providers/cloudpayments.provider.js';
import { RobokassaProvider } from './providers/robokassa.provider.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: Map<string, PaymentProviderAdapter>;

  constructor(
    @Inject(DB) private readonly db: Database,
    starsProvider: TelegramStarsProvider,
    yookassaProvider: YooKassaProvider,
    cloudpaymentsProvider: CloudPaymentsProvider,
    robokassaProvider: RobokassaProvider,
  ) {
    this.providers = new Map<string, PaymentProviderAdapter>([
      ['stars', starsProvider],
      ['yookassa', yookassaProvider],
      ['cloudpayments', cloudpaymentsProvider],
      ['robokassa', robokassaProvider],
    ]);
    this.logger.log(
      `Payment providers initialized: ${Array.from(this.providers.keys()).join(', ')}`,
    );
  }

  async initiatePayment(request: PaymentRequest) {
    const provider = this.providers.get(request.provider);
    if (!provider) {
      throw new BadRequestException(
        `Unsupported provider: ${request.provider}. Supported: ${Array.from(this.providers.keys()).join(', ')}`,
      );
    }

    const { url, paymentId } = await provider.initiate(request);

    await this.db.insert(payments).values({
      clientId: request.clientId,
      subscriptionId: request.subscriptionId ?? null,
      subscriberId: request.subscriberId ?? null,
      provider: request.provider,
      providerPaymentId: paymentId,
      amount: String(request.amount),
      currency: request.currency || 'RUB',
      status: PaymentStatus.PENDING,
      metadata: request.metadata ?? {},
    });

    this.logger.log(
      `Payment initiated: ${paymentId} (${request.provider}) for subscription ${request.subscriptionId ?? '-'}`,
    );
    return { paymentId, url, status: PaymentStatus.PENDING };
  }

  async handleWebhook(providerName: string, payload: unknown) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new BadRequestException(`Unknown provider: ${providerName}`);
    }

    let webhook;
    try {
      webhook = provider.verify(payload);
    } catch (error) {
      this.logger.error(
        `Webhook verification failed for ${providerName}: ${(error as Error).message}`,
      );
      throw new BadRequestException('Invalid webhook signature or format');
    }

    const [payment] = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.providerPaymentId, webhook.providerPaymentId),
          eq(payments.provider, webhook.provider),
        ),
      )
      .limit(1);

    if (!payment) {
      throw new NotFoundException(`Payment not found: ${webhook.providerPaymentId}`);
    }

    await this.db
      .update(payments)
      .set({ status: webhook.status, metadata: webhook.data, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    this.logger.log(
      `Payment ${webhook.status}: ${webhook.providerPaymentId} from ${providerName}`,
    );
    return { id: payment.id, status: webhook.status, updatedAt: new Date() };
  }

  async getPayment(paymentId: string) {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, paymentId))
      .limit(1);
    if (!payment) throw new NotFoundException(`Payment not found: ${paymentId}`);
    return payment;
  }

  async listClientPayments(clientId: string, limit = 50, offset = 0) {
    return this.db
      .select()
      .from(payments)
      .where(eq(payments.clientId, clientId))
      .limit(limit)
      .offset(offset);
  }

  async refundPayment(paymentId: string, amount?: number, _reason?: string) {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, paymentId))
      .limit(1);
    if (!payment) throw new NotFoundException(`Payment not found: ${paymentId}`);

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException(
        `Cannot refund payment with status: ${payment.status}`,
      );
    }

    const provider = this.providers.get(payment.provider);
    if (!provider) {
      throw new BadRequestException(`Provider not found: ${payment.provider}`);
    }

    const success = await provider.refund(paymentId, amount);
    if (success) {
      await this.db
        .update(payments)
        .set({ status: PaymentStatus.REFUNDED, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      this.logger.log(`Refund processed: ${paymentId} (${amount ?? 'full'})`);
    }
    return { id: payment.id, status: success ? 'refunded' : 'failed', refundedAt: new Date() };
  }

  async getPaymentStatistics(clientId: string) {
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.clientId, clientId));

    return {
      totalSucceeded: rows.filter((p) => p.status === PaymentStatus.SUCCEEDED).length,
      totalFailed: rows.filter((p) => p.status === PaymentStatus.FAILED).length,
      totalRefunded: rows.filter((p) => p.status === PaymentStatus.REFUNDED).length,
      totalAmount: rows
        .filter((p) => p.status === PaymentStatus.SUCCEEDED)
        .reduce((sum, p) => sum + Number(p.amount), 0),
      totalCount: rows.length,
    };
  }
}
