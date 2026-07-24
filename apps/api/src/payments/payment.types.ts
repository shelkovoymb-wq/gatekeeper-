export enum PaymentProvider {
  TELEGRAM_STARS = 'stars',
  YOOKASSA = 'yookassa',
  CLOUDPAYMENTS = 'cloudpayments',
  ROBOKASSA = 'robokassa',
  CRYPTOBOT = 'cryptobot',
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

/** Единый интерфейс платёжного провайдера. */
export interface PaymentProviderAdapter {
  name: string;
  initiate(request: PaymentRequest): Promise<{ url: string | null; paymentId: string }>;
  verify(payload: unknown): PaymentWebhook;
  refund(paymentId: string, amount?: number): Promise<boolean>;
}
