import { Module } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'
import { TelegramStarsProvider } from './providers/telegram-stars.provider'
import { YooKassaProvider } from './providers/yookassa.provider'
import { CloudPaymentsProvider } from './providers/cloudpayments.provider'
import { RobokassaProvider } from './providers/robokassa.provider'

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    TelegramStarsProvider,
    YooKassaProvider,
    CloudPaymentsProvider,
    RobokassaProvider
  ],
  exports: [PaymentsService]
})
export class PaymentsModule {}
