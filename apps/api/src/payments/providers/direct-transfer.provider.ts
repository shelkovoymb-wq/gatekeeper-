import { Injectable, Logger, BadRequestException, Inject } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  PaymentStatus,
  type PaymentProviderAdapter,
  type PaymentRequest,
  type PaymentWebhook,
  type WebhookVerifyContext,
} from '../payment.types.js';
import { DB, type Database } from '../../db/db.module.js';
import { directPaymentAccounts } from '../../db/schema.js';

/**
 * Прямой платёж - платёж, который происходит вне платформы (СБП, карта, банковский счёт).
 * Платформа хранит информацию о реквизитах, куда отправить деньги, и учитывает платёж.
 * Подтверждение может быть вручную или через вебхук от банка.
 */
@Injectable()
export class DirectTransferProvider implements PaymentProviderAdapter {
  private readonly logger = new Logger(DirectTransferProvider.name);
  name = 'direct';

  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Инициирует платёж, возвращая информацию о том, куда отправить деньги.
   * Платёж создаётся с статусом PENDING и ждёт ручного подтверждения
   * или вебхука от банка.
   */
  async initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }> {
    // Получаем реквизиты получателя (владельца платного контента)
    const [account] = await this.db
      .select()
      .from(directPaymentAccounts)
      .where(
        eq(directPaymentAccounts.clientId, request.metadata?.payeeClientId as string),
      )
      .limit(1);

    if (!account || !account.isActive) {
      throw new BadRequestException(
        `Direct payment account not configured or inactive for payee`,
      );
    }

    // Проверяем статус верификации
    if (account.verificationStatus !== 'verified') {
      throw new BadRequestException(
        `Direct payment account is not verified (status: ${account.verificationStatus})`,
      );
    }

    // randomUUID, а не Math.random: этот id — единственное, что отличает один
    // прямой платёж от другого в подтверждении, и он уезжает плательщику.
    const paymentId = `dir_${randomUUID()}`;

    // Формируем инструкцию для платежа (не отправляем ссылку, т.к. платёж вне платформы)
    const paymentInstruction = {
      amount: (request.amount / 100).toFixed(2),
      currency: request.currency || 'RUB',
      accountType: account.accountType,
      // В зависимости от типа счёта показываем разные реквизиты
      ...(account.accountType === 'card' && {
        cardNumber: account.cardNumberMasked,
        cardHolder: account.cardHolder,
      }),
      ...(account.accountType === 'bank_account' && {
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        bic: account.bic,
        inn: account.inn,
      }),
      ...(account.accountType === 'sbp' && {
        phoneNumber: account.phoneForSbp,
      }),
      ...(account.accountType === 'paypal' && {
        email: account.email,
      }),
      description: request.description,
      orderId: paymentId,
    };

    this.logger.log(
      `Direct transfer payment initiated: ${paymentId} from ${request.clientId} to ${request.metadata?.payeeClientId}`,
    );

    return {
      url: null, // Нет URL перенаправления - платёж происходит вне платформы
      paymentId,
    };
  }

  /**
   * Подтверждение прямого перевода: вебхук от банка либо ручное подтверждение
   * оператором, проброшенное сюда же.
   *
   * Подпись обязательна. `/payments/webhook/` — единственный путь API, который
   * nginx отдаёт в интернет (см. gatekeeper-proxy/nginx.conf), а успешный
   * вебхук переводит платёж в `succeeded`, то есть открывает подписчику доступ.
   * Без проверки подписи это было бесплатное подтверждение любого платежа:
   * плательщик знает свой payment_id из инструкции по оплате.
   *
   * Секрет — `DIRECT_WEBHOOK_SECRET` в окружении API. Не задан — подтверждения
   * не принимаются вовсе: молча пропускать неподписанные подтверждения хуже,
   * чем не принимать их.
   */
  async verify(ctx: WebhookVerifyContext): Promise<PaymentWebhook> {
    const body = ctx.body as Record<string, unknown>;

    const secret = process.env.DIRECT_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error('direct transfer webhook: DIRECT_WEBHOOK_SECRET is not configured');
    }

    const headerSig = ctx.headers['x-gatekeeper-signature'];
    const providedSig = Array.isArray(headerSig) ? headerSig[0] : headerSig;
    if (!ctx.rawBody || !providedSig) {
      throw new Error('direct transfer webhook: missing signature or raw body');
    }

    const expected = createHmac('sha256', secret).update(ctx.rawBody).digest('hex');
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('direct transfer webhook: signature mismatch');
    }

    const paymentId = body.payment_id as string | undefined;
    const orderId = body.order_id as string | undefined;

    if (!paymentId && !orderId) {
      throw new Error('direct transfer webhook: missing payment_id or order_id');
    }

    const id = (paymentId || orderId) as string;
    const status = (body.status as string | undefined)?.toLowerCase();

    const statusMap: Record<string, PaymentStatus> = {
      success: PaymentStatus.SUCCEEDED,
      completed: PaymentStatus.SUCCEEDED,
      confirmed: PaymentStatus.SUCCEEDED,
      pending: PaymentStatus.PENDING,
      failed: PaymentStatus.FAILED,
      cancelled: PaymentStatus.CANCELLED,
    };

    return {
      provider: 'direct',
      providerPaymentId: id,
      status: statusMap[status || 'pending'] || PaymentStatus.PENDING,
      amount: Math.round((body.amount as number) * 100),
      currency: (body.currency as string) || 'RUB',
      timestamp: body.timestamp ? new Date(body.timestamp as string).getTime() : Date.now(),
      data: {
        payment_id: paymentId,
        order_id: orderId,
        status: body.status,
        account_type: body.account_type,
        reference: body.reference,
      },
    };
  }

  /**
   * Возврат денег при отмене платежа.
   * Для прямых платежей возврат должен быть инициирован вручную.
   */
  async refund(paymentId: string, amount?: number): Promise<boolean> {
    this.logger.log(
      `Direct transfer refund request: ${paymentId} (${amount ?? 'full'}). Requires manual processing.`,
    );
    // TODO: Integrate with bank API or notify support team for manual refund
    return true;
  }
}
