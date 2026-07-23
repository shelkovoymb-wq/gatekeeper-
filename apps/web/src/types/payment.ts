export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
export type PaymentProvider = 'yookassa' | 'cloudpayments' | 'robokassa' | 'stars'

export interface Payment {
  id: string
  clientId: string
  subscriberId: string
  subscriptionId: string
  amount: number
  currency: string
  provider: PaymentProvider
  status: PaymentStatus
  createdAt: string
  updatedAt?: string
  metadata?: Record<string, any>
}

export interface Refund {
  id: string
  paymentId: string
  amount: number
  reason: string
  status: 'pending' | 'succeeded' | 'failed'
  createdAt: string
}
