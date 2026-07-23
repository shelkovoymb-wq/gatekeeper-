import { Module } from '@nestjs/common'
import { PaymentsService } from './payments.service'
import { PaymentsController } from './payments.controller'
import { TelegramStarsProvider } from './providers/telegram-stars.provider'

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, TelegramStarsProvider],
  exports: [PaymentsService]
})
export class PaymentsModule {}
