import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentProvider as IPaymentProvider, PaymentRequest, PaymentStatus, PaymentWebhook } from '../payment.types'

@Injectable()
export class TelegramStarsProvider implements IPaymentProvider {
  name = 'stars' as any

  constructor(private config: ConfigService) {}

  async initiate(request: PaymentRequest): Promise<{ url: string; paymentId: string }> {
    const paymentId = `tg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    return { url: null, paymentId }
  }

  verify(payload: any): PaymentWebhook {
    const { successful_payment } = payload
    return {
      provider: 'stars',
      providerPaymentId: successful_payment.telegram_payment_charge_id,
      status: PaymentStatus.SUCCEEDED,
      amount: successful_payment.total_amount,
      currency: 'XTR',
      timestamp: Date.now(),
      data: { provider_payment_charge_id: successful_payment.provider_payment_charge_id }
    }
  }

  async refund(paymentId: string): Promise<boolean> {
    return true
  }
}
