import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import crypto from 'crypto'
import { PaymentProvider as IPaymentProvider, PaymentRequest, PaymentStatus, PaymentWebhook } from '../payment.types'

@Injectable()
export class RobokassaProvider implements IPaymentProvider {
  private logger = new Logger(RobokassaProvider.name)
  name = 'robokassa' as any
  private readonly apiUrl = 'https://auth.robokassa.ru/Merchant/WebService/GetMerchantBalance/'
  private readonly checkoutUrl = 'https://auth.robokassa.ru/Merchant/Index.aspx'

  constructor(private config: ConfigService) {}

  private getMD5Hash(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex')
  }

  async initiate(request: PaymentRequest): Promise<{ url: string; paymentId: string }> {
    const merchantLogin = this.config.get(`ROBOKASSA_MERCHANT_LOGIN_${request.clientId.toUpperCase()}`)
    const password1 = this.config.get(`ROBOKASSA_PASSWORD1_${request.clientId.toUpperCase()}`)

    if (!merchantLogin || !password1) {
      throw new BadRequestException(`Robokassa not configured for client ${request.clientId}`)
    }

    const invoiceId = `inv_${Date.now()}`
    const sum = (request.amount / 100).toFixed(2)

    // Robokassa: SignatureValue = MD5(MerchantLogin:Sum:InvoiceID:Password1)
    const signatureData = `${merchantLogin}:${sum}:${invoiceId}:${password1}`
    const signature = this.getMD5Hash(signatureData)

    const checkoutParams = new URLSearchParams({
      MerchantLogin: merchantLogin,
      Sum: sum,
      InvoiceID: invoiceId,
      Description: request.description,
      SignatureValue: signature,
      Email: request.metadata?.email || '',
      Encoding: 'utf-8',
      Culture: 'ru'
    })

    return {
      url: `${this.checkoutUrl}?${checkoutParams.toString()}`,
      paymentId: invoiceId
    }
  }

  verify(payload: any): PaymentWebhook {
    // Robokassa POST /Result webhook с параметрами:
    // MerchantLogin, Sum, InvoiceID, SignatureValue, InvId, OperationId, Status
    // https://docs.robokassa.ru/

    return {
      provider: 'robokassa',
      providerPaymentId: payload.OperationId || payload.InvoiceID,
      status: payload.Status === 'received' || payload.Status === 'confirmed' 
        ? PaymentStatus.SUCCEEDED 
        : PaymentStatus.FAILED,
      amount: Math.round(parseFloat(payload.Sum) * 100),
      currency: 'RUB',
      timestamp: Date.now(),
      data: {
        invoice_id: payload.InvoiceID,
        operation_id: payload.OperationId,
        status: payload.Status
      }
    }
  }

  async refund(paymentId: string, amount?: number): Promise<boolean> {
    // Robokassa не поддерживает автоматические рефанды через API
    // Требует ручного обращения к поддержке
    this.logger.warn(`Robokassa refund: ${paymentId} requires manual support request`)
    return false
  }
}
