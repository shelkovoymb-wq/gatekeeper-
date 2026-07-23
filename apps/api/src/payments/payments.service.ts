import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { db } from '../db'
import { payments, paymentConfigs } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { PaymentProvider as IPaymentProvider, PaymentRequest, PaymentStatus } from './payment.types'
import { TelegramStarsProvider } from './providers/telegram-stars.provider'
import { YooKassaProvider } from './providers/yookassa.provider'
import { CloudPaymentsProvider } from './providers/cloudpayments.provider'
import { RobokassaProvider } from './providers/robokassa.provider'

@Injectable()
export class PaymentsService {
  private logger = new Logger(PaymentsService.name)
  private providers: Map<string, IPaymentProvider>

  constructor(
    private config: ConfigService,
    private starsProvider: TelegramStarsProvider,
    private yookassaProvider: YooKassaProvider,
    private cloudpaymentsProvider: CloudPaymentsProvider,
    private robokassaProvider: RobokassaProvider
  ) {
    this.initializeProviders()
  }

  private initializeProviders() {
    this.providers = new Map([
      ['stars', this.starsProvider],
      ['yookassa', this.yookassaProvider],
      ['cloudpayments', this.cloudpaymentsProvider],
      ['robokassa', this.robokassaProvider]
    ])
    
    this.logger.log(`Payment providers initialized: ${Array.from(this.providers.keys()).join(', ')}`)
  }

  async initiatePayment(request: PaymentRequest) {
    const provider = this.providers.get(request.provider)
    if (!provider) {
      throw new BadRequestException(
        `Unsupported provider: ${request.provider}. Supported: ${Array.from(this.providers.keys()).join(', ')}`
      )
    }

    const { url, paymentId } = await provider.initiate(request)

    await db.insert(payments).values({
      clientId: request.clientId,
      subscriberId: request.subscriberId,
      subscriptionId: request.subscriptionId,
      provider: request.provider,
      providerPaymentId: paymentId,
      amount: request.amount,
      currency: request.currency || 'RUB',
      status: PaymentStatus.PENDING,
      metadata: request.metadata || {},
      createdAt: new Date()
    })

    this.logger.log(`Payment initiated: ${paymentId} (${request.provider}) for subscription ${request.subscriptionId}`)
    return { paymentId, url, status: 'pending' }
  }

  async handleWebhook(provider: string, payload: any) {
    const providerInstance = this.providers.get(provider)
    if (!providerInstance) {
      throw new BadRequestException(`Unknown provider: ${provider}`)
    }

    let webhook
    try {
      webhook = providerInstance.verify(payload)
    } catch (error) {
      this.logger.error(`Webhook verification failed for ${provider}: ${(error as Error).message}`)
      throw new BadRequestException(`Invalid webhook signature or format`)
    }
    
    const [payment] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.providerPaymentId, webhook.providerPaymentId),
          eq(payments.provider, webhook.provider as any)
        )
      )

    if (!payment) {
      throw new NotFoundException(`Payment not found: ${webhook.providerPaymentId}`)
    }

    await db
      .update(payments)
      .set({
        status: webhook.status as any,
        metadata: webhook.data,
        updatedAt: new Date()
      })
      .where(eq(payments.id, payment.id))

    this.logger.log(`Payment ${webhook.status}: ${webhook.providerPaymentId} from ${provider}`)
    return { id: payment.id, status: webhook.status, updatedAt: new Date() }
  }

  async getPayment(paymentId: string) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, paymentId))

    if (!payment) {
      throw new NotFoundException(`Payment not found: ${paymentId}`)
    }

    return payment
  }

  async listClientPayments(clientId: string, limit = 50, offset = 0) {
    return db
      .select()
      .from(payments)
      .where(eq(payments.clientId, clientId))
      .limit(limit)
      .offset(offset)
  }

  async refundPayment(paymentId: string, amount?: number, reason?: string) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, paymentId))

    if (!payment) {
      throw new NotFoundException(`Payment not found: ${paymentId}`)
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new BadRequestException(`Cannot refund payment with status: ${payment.status}`)
    }

    const provider = this.providers.get(payment.provider)
    if (!provider) {
      throw new BadRequestException(`Provider not found: ${payment.provider}`)
    }

    const success = await provider.refund(paymentId, amount)
    
    if (success) {
      await db
        .update(payments)
        .set({
          status: PaymentStatus.REFUNDED,
          updatedAt: new Date()
        })
        .where(eq(payments.id, payment.id))

      this.logger.log(`Refund processed: ${paymentId} (${amount || 'full'})`)
    }

    return { id: payment.id, status: success ? 'refunded' : 'failed', refundedAt: new Date() }
  }

  async getPaymentStatistics(clientId: string) {
    const allPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.clientId, clientId))

    const stats = {
      totalSucceeded: allPayments.filter(p => p.status === PaymentStatus.SUCCEEDED).length,
      totalFailed: allPayments.filter(p => p.status === PaymentStatus.FAILED).length,
      totalRefunded: allPayments.filter(p => p.status === PaymentStatus.REFUNDED).length,
      totalAmount: allPayments
        .filter(p => p.status === PaymentStatus.SUCCEEDED)
        .reduce((sum, p) => sum + p.amount, 0),
      totalCount: allPayments.length
    }

    return stats
  }
}
