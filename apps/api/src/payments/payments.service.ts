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
  type WebhookVerifyContext,
} from './payment.types.js';
import { TelegramStarsProvider } from './providers/telegram-stars.provider.js';
import { YooKassaProvider } from './providers/yookassa.provider.js';
import { CloudPaymentsProvider } from './providers/cloudpayments.provider.js';
import { RobokassaProvider } from './providers/robokassa.provider.js';
import { ProdamusProvider } from './providers/prodamus.provider.js';
import { DirectTransferProvider } from './providers/direct-transfer.provider.js';
import { FulfillmentService } from '../storefront/fulfillment.service.js';

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
    prodamusProvider: ProdamusProvider,
    directTransferProvider: DirectTransferProvider,
    private readonly fulfillment: FulfillmentService,
  ) {
    this.providers = new Map<string, PaymentProviderAdapter>([
      ['stars', starsProvider],
      ['yookassa', yookassaProvider],
      ['cloudpayments', cloudpaymentsProvider],
      ['robokassa', robokassaProvider],
      ['prodamus', prodamusProvider],
      ['direct', directTransferProvider],
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

    const { url, paymentId, instruction } = await provider.initiate(request);

    await this.db.insert(payments).values({
      clientId: request.clientId,
      subscriptionId: request.subscriptionId ?? null,
      subscriberId: request.subscriberId ?? null,
      provider: request.provider,
      providerPaymentId: paymentId,
      // request.amount — в копейках (все провайдеры делят его на 100), а
      // payments.amount читается как рубли: из него считается оборот и
      // комиссия в счёте платформы. Без деления здесь комиссия выходила
      // в сто раз больше реальной.
      amount: (request.amount / 100).toFixed(2),
      currency: request.currency || 'RUB',
      status: PaymentStatus.PENDING,
      metadata: request.metadata ?? {},
    });

    this.logger.log(
      `Payment initiated: ${paymentId} (${request.provider}) for subscription ${request.subscriptionId ?? '-'}`,
    );
    return { paymentId, url, instruction, status: PaymentStatus.PENDING };
  }

  async handleWebhook(providerName: string, ctx: WebhookVerifyContext) {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new BadRequestException(`Unknown provider: ${providerName}`);
    }

    let webhook;
    try {
      webhook = await provider.verify(ctx);
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

    // Шлюзы повторяют доставку часами, пока не получат 200. Замок — прежний
    // статус платежа: доступ выдаём только на переходе в succeeded. Без него
    // каждая повторная доставка продлевала бы подписку ещё на период
    // (SubscriptionsService.grant считает от max(paidUntil, now) и про
    // повторы ничего не знает).
    const alreadySucceeded = payment.status === PaymentStatus.SUCCEEDED;

    await this.db
      .update(payments)
      .set({
        status: webhook.status,
        // Данные вебхука кладём рядом, а не вместо: в metadata лежит то, что
        // положила витрина (botId, planId, tgUserId), и по ним выдаётся
        // доступ. Затирая их, мы теряли связь платежа с покупателем навсегда.
        metadata: { ...((payment.metadata as Record<string, unknown>) ?? {}), webhook: webhook.data },
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    this.logger.log(
      `Payment ${webhook.status}: ${webhook.providerPaymentId} from ${providerName}`,
    );

    // Успешный платёж должен открыть доступ. Раньше вебхук только менял статус:
    // подписчик платил через ЮKassa, платёж становился succeeded — и на этом
    // всё, подписки он не получал. Данные для выдачи кладутся в metadata при
    // инициации (витриной бота); у платежей из n8n их нет, и тогда выдачей
    // занимается вызывающая сторона.
    if (webhook.status === PaymentStatus.SUCCEEDED && !alreadySucceeded) {
      await this.grantAccess(payment.id, webhook.providerPaymentId, payment.metadata);
    }

    return { id: payment.id, status: webhook.status, updatedAt: new Date() };
  }

  /**
   * Выдать доступ по оплаченному платежу.
   *
   * Витрина бота кладёт в metadata всё нужное для выдачи: кто купил (botId,
   * tgUserId) и что купил (planId). Если этих полей нет — платёж пришёл из
   * n8n или другого места, где подписку заводят самостоятельно, и трогать её
   * тут не надо.
   */
  private async grantAccess(
    paymentRowId: string,
    providerPaymentId: string,
    metadata: unknown,
  ): Promise<void> {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const botId = typeof meta.botId === 'string' ? meta.botId : null;
    const planId = typeof meta.planId === 'string' ? meta.planId : null;
    const tgUserId = typeof meta.tgUserId === 'number' ? meta.tgUserId : null;

    if (!botId || !planId || !tgUserId) return;

    try {
      await this.fulfillment.fulfill({
        botId,
        tgUserId,
        username: typeof meta.username === 'string' ? meta.username : null,
        firstName: typeof meta.firstName === 'string' ? meta.firstName : null,
        planId,
        provider: 'external',
        providerPaymentId,
        alreadyRecorded: true,
      });
      this.logger.log(`Access granted for payment ${paymentRowId} (plan ${planId})`);
    } catch (e) {
      // Доступ не выдался, но деньги приняты — это не повод отдавать провайдеру
      // ошибку: он начнёт повторять вебхук. Пишем в лог, статус остаётся
      // succeeded, разобраться можно вручную.
      this.logger.error(`Failed to grant access for payment ${paymentRowId}: ${String(e)}`);
    }
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
