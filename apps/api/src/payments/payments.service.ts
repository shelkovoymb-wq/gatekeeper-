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
    
    this.logger.log(`Initialized payment providers: ${Array.from(this.providers.keys()).join(', ')}`)
  }

  async initiatePayment(request: PaymentRequest) {
    const provider = this.providers.get(request.provider)
    if (!provider) {
      throw new BadRequestException(
        `Unsupported payment provider: ${request.provider}. Supported: ${Array.from(this.providers.keys()).join(', ')}`
      )
    }

    const { url, paymentId } = await provider.initiate(request)

    // Сохраняем платёж в БД
    await db.insert(payments).values({
      clientId: request.clientId,
      subscriberId: request.subscriberId,
      subscriptionId: request.subscriptionId,
      provider: request.provider,
      providerPaymentId: paymentId,
      amount: request.amount,
      currency: request.currency,
      status: PaymentStatus.PENDING,
      metadata: request.metadata || {},
      createdAt: new Date()
    })

    this.logger.log(`Payment initiated: ${paymentId} (${request.provider}) for subscription ${request.subscriptionId}`)
    return { paymentId, url }
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
      this.logger.error(`Webhook verification failed for ${provider}: ${error.message}`)
      throw new BadRequestException(`Invalid webhook signature or format`)
    }
    
    // Найдём платёж в БД
    const [payment] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.providerPaymentId, webhook.providerPaymentId),
          eq(payments.provider, webhook.provider)
        )
      )

    if (!payment) {
      throw new NotFoundException(`Payment not found: ${webhook.providerPaymentId}`)
    }

    // Обновим статус
    await db
      .update(payments)
      .set({
        status: webhook.status,
        metadata: webhook.data,
        updatedAt: new Date()
      })
      .where(eq(payments.id, payment.id))

    this.logger.log(`Payment ${webhook.status}: ${webhook.providerPaymentId} from ${provider}`)

    // Отправим event в outbox для n8n (подписка активируется)
    if (webhook.status === PaymentStatus.SUCCEEDED) {
      // TODO: await this.eventsService.outbox('subscription.payment.succeeded', {
      //   subscriptionId: payment.subscriptionId,
      //   paymentId: payment.id,
      //   amount: payment.amount
      // })
    }

    return payment
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

  async getPaymentStatistics(clientId: string) {
    // TODO: Implement with aggregation queries
    return {
      totalSucceeded: 0,
      totalFailed: 0,
      totalRefunded: 0,
      totalAmount: 0
    }
  }
}
