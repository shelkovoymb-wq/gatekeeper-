import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import crypto from 'crypto'
import { PaymentProvider as IPaymentProvider, PaymentRequest, PaymentStatus, PaymentWebhook } from '../payment.types'

@Injectable()
export class CloudPaymentsProvider implements IPaymentProvider {
  private logger = new Logger(CloudPaymentsProvider.name)
  name = 'cloudpayments' as any
  private readonly apiUrl = 'https://api.cloudpayments.ru'

  constructor(private config: ConfigService) {}

  async initiate(request: PaymentRequest): Promise<{ url: string; paymentId: string }> {
    const publicId = this.config.get(`CLOUDPAYMENTS_PUBLIC_ID_${request.clientId.toUpperCase()}`)
    const apiSecret = this.config.get(`CLOUDPAYMENTS_API_SECRET_${request.clientId.toUpperCase()}`)

    if (!publicId || !apiSecret) {
      throw new BadRequestException(`CloudPayments not configured for client ${request.clientId}`)
    }

    // CloudPayments: используем checkout form (не API call, а реверт на их страницу)
    const checkoutUrl = new URL('https://checkout.cloudpayments.ru/')
    checkoutUrl.searchParams.append('PublicId', publicId)
    checkoutUrl.searchParams.append('Amount', (request.amount / 100).toFixed(2))
    checkoutUrl.searchParams.append('Currency', request.currency || 'RUB')
    checkoutUrl.searchParams.append('OrderId', `order_${Date.now()}`)
    checkoutUrl.searchParams.append('Description', request.description)
    checkoutUrl.searchParams.append('InvoiceId', `invoice_${request.subscriptionId}`)
    checkoutUrl.searchParams.append('AccountId', request.clientId)
    checkoutUrl.searchParams.append('JsonData', JSON.stringify({
      clientId: request.clientId,
      subscriberId: request.subscriberId,
      subscriptionId: request.subscriptionId,
      ...request.metadata
    }))

    const paymentId = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    return {
      url: checkoutUrl.toString(),
      paymentId
    }
  }

  verify(payload: any): PaymentWebhook {
    // CloudPayments POST /notification webhook
    // https://cloudpayments.ru/docs/integration/cashier

    return {
      provider: 'cloudpayments',
      providerPaymentId: payload.TransactionId || payload.InvoiceId,
      status: payload.Status === '0' ? PaymentStatus.SUCCEEDED :
              payload.Status === '1' ? PaymentStatus.FAILED :
              PaymentStatus.PENDING,
      amount: Math.round(parseFloat(payload.Amount) * 100),
      currency: payload.Currency || 'RUB',
      timestamp: Date.now(),
      data: {
        email: payload.Email,
        phone: payload.Phone,
        ip: payload.IpAddress,
        json_data: payload.JsonData
      }
    }
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    // CloudPayments refund: POST /api/refund
    const apiSecret = this.config.get('CLOUDPAYMENTS_API_SECRET')
    
    if (!apiSecret) {
      throw new BadRequestException('CloudPayments not configured')
    }

    // Реализуем при необходимости
    this.logger.log(`CloudPayments refund: ${paymentId} (${amount})`)
    return true
  }
}
