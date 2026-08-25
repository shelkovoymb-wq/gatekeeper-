export enum PaymentProvider {
  TELEGRAM_STARS = 'stars',
  YOOKASSA = 'yookassa',
  CLOUDPAYMENTS = 'cloudpayments',
  ROBOKASSA = 'robokassa',
  CRYPTOBOT = 'cryptobot',
  PRODAMUS = 'prodamus',
  DIRECT = 'direct',
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export interface PaymentRequest {
  clientId: string;
  subscriberId?: string;
  subscriptionId?: string;
  /** Сумма в минорных единицах (копейках). Провайдеры делят на 100. */
  amount: number;
  currency: string;
  provider: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Реквизиты получателя для прямого перевода — то, что подписчику надо показать,
 * чтобы он смог заплатить. У остальных провайдеров вместо этого есть url.
 */
export interface PaymentInstruction {
  accountType: string;
  amount: string;
  currency: string;
  orderId: string;
  bankName?: string | null;
  accountNumber?: string | null;
  bic?: string | null;
  inn?: string | null;
  cardNumber?: string | null;
  cardHolder?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  cryptoAddress?: string | null;
  cryptoType?: string | null;
}

export interface PaymentWebhook {
  provider: string;
  providerPaymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/**
 * Контекст входящего вебхука: даём провайдеру и распарсенное тело, и сырые
 * байты (нужны для HMAC-подписей вроде CloudPayments Content-HMAC — после
 * JSON.parse их не восстановить), и заголовки.
 */
export interface WebhookVerifyContext {
  body: unknown;
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

/** Единый интерфейс платёжного провайдера. */
export interface PaymentProviderAdapter {
  name: string;
  initiate(
    request: PaymentRequest,
  ): Promise<{ url: string | null; paymentId: string; instruction?: PaymentInstruction }>;
  /**
   * Проверяет подлинность вебхука и ТОЛЬКО ПОСЛЕ этого возвращает статус.
   * Реализация обязана либо криптографически проверить подпись, либо
   * подтвердить платёж отдельным server-to-server запросом к API провайдера —
   * никогда не доверять статусу из тела запроса напрямую.
   */
  verify(ctx: WebhookVerifyContext): Promise<PaymentWebhook>;
  refund(paymentId: string, amount?: number): Promise<boolean>;
}
