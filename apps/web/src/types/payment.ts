export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
export type PaymentProvider =
  | 'yookassa'
  | 'cloudpayments'
  | 'robokassa'
  | 'prodamus'
  | 'stars'
  /** Прямой перевод на реквизиты клиента: СБП, карта, счёт, крипто. */
  | 'direct'
  /** Бесплатный доступ — платежа не было, но запись нужна для истории подписки. */
  | 'free'

export interface Payment {
  id: string
  clientId: string
  subscriberId: string
  subscriptionId: string
  amount: number
  currency: string
  provider: PaymentProvider
  status: PaymentStatus
  /** null — платёж закрыл сам провайдер; 'client' — клиент отметил, что деньги пришли. */
  confirmedBy?: string | null
  confirmedAt?: string | null
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
