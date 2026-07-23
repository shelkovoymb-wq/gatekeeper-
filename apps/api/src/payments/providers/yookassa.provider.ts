import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import crypto from 'crypto'
import { PaymentProvider as IPaymentProvider, PaymentRequest, PaymentStatus, PaymentWebhook } from '../payment.types'

@Injectable()
export class YooKassaProvider implements IPaymentProvider {
  private logger = new Logger(YooKassaProvider.name)
  name = 'yookassa' as any
  private readonly apiUrl = 'https://api.yookassa.ru/v3/payments'

  constructor(private config: ConfigService) {}

  async initiate(request: PaymentRequest): Promise<{ url: string; paymentId: string }> {
    // YooKassa требует Shop ID и Secret Key для каждого клиента
    const shopId = this.config.get(`YOOKASSA_SHOP_ID_${request.clientId.toUpperCase()}`)
    const secretKey = this.config.get(`YOOKASSA_SECRET_${request.clientId.toUpperCase()}`)

    if (!shopId || !secretKey) {
      throw new BadRequestException(`YooKassa not configured for client ${request.clientId}`)
    }

    const idempotencyKey = crypto.randomUUID()
    const payload = {
      amount: {
        value: (request.amount / 100).toFixed(2),
        currency: request.currency || 'RUB'
      },
      description: request.description,
      confirmation: {
        type: 'redirect',
        return_url: `${this.config.get('PUBLIC_API_URL')}/payments/success?provider=yookassa`
      },
      metadata: {
        clientId: request.clientId,
        subscriberId: request.subscriberId,
        subscriptionId: request.subscriptionId,
        ...request.metadata
      }
    }

    const auth = Buffer.from(`${shopId}:${secretKey}`).toString('base64')

    // Вызываем API YooKassa
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'Authorization': `Basic ${auth}`
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (!response.ok) {
        this.logger.error(`YooKassa API error: ${data.description}`)
        throw new BadRequestException(`YooKassa payment init failed: ${data.description}`)
      }

      return {
        url: data.confirmation.confirmation_url,
        paymentId: data.id
      }
    } catch (error) {
      this.logger.error(`YooKassa initiate error: ${error.message}`)
      throw error
    }
  }

  verify(payload: any): PaymentWebhook {
    // payload = YooKassa webhook event
    // https://yookassa.ru/developers/using-api/webhooks-events
    const payment = payload.object

    return {
      provider: 'yookassa',
      providerPaymentId: payment.id,
      status: payment.status === 'succeeded' ? PaymentStatus.SUCCEEDED : 
              payment.status === 'canceled' ? PaymentStatus.CANCELLED :
              PaymentStatus.FAILED,
      amount: parseInt(payment.amount.value) * 100,
      currency: payment.amount.currency,
      timestamp: new Date(payment.created_at).getTime(),
      data: {
        receipt_email: payment.receipt_email,
        description: payment.description,
        metadata: payment.metadata
      }
    }
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    // YooKassa refund: POST /v3/refunds
    // Реализуем при необходимости
    this.logger.log(`YooKassa refund: ${paymentId} (${amount})`)
    return true
  }
}
