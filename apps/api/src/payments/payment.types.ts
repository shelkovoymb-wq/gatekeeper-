export enum PaymentProvider {
  TELEGRAM_STARS = 'stars',
  YOOKASSA = 'yookassa',
  CLOUDPAYMENTS = 'cloudpayments',
  ROBOKASSA = 'robokassa',
  CRYPTOBOT = 'cryptobot',
  PRODAMUS = 'prodamus',
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
  amount: number;
  currency: string;
  provider: string;
  description: string;
  metadata?: Record<string, unknown>;
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
  initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }>;
  /**
   * Проверяет подлинность вебхука и ТОЛЬКО ПОСЛЕ этого возвращает статус.
   * Реализация обязана либо криптографически проверить подпись, либо
   * подтвердить платёж отдельным server-to-server запросом к API провайдера —
   * никогда не доверять статусу из тела запроса напрямую.
   */
  verify(ctx: WebhookVerifyContext): Promise<PaymentWebhook>;
  refund(paymentId: string, amount?: number): Promise<boolean>;
}
