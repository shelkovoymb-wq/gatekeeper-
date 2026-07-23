export enum PaymentProvider {
  TELEGRAM_STARS = 'stars',
  YOOKASSA = 'yookassa',
  CLOUDPAYMENTS = 'cloudpayments',
  CRYPTOBOT = 'cryptobot'
}

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export interface PaymentRequest {
  clientId: string
  subscriberId: string
  subscriptionId: string
  amount: number
  currency: string
  provider: PaymentProvider
  description: string
  metadata?: Record<string, any>
}

export interface PaymentWebhook {
  provider: PaymentProvider
  providerPaymentId: string
  status: PaymentStatus
  amount: number
  currency: string
  timestamp: number
  data: Record<string, any>
}

export interface PaymentProvider {
  name: PaymentProvider
  initiate(request: PaymentRequest): Promise<{ url: string; paymentId: string }>
  verify(payload: any): PaymentWebhook
  refund(paymentId: string, amount?: number): Promise<boolean>
}
