import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';
import { TelegramStarsProvider } from './providers/telegram-stars.provider.js';
import { YooKassaProvider } from './providers/yookassa.provider.js';
import { CloudPaymentsProvider } from './providers/cloudpayments.provider.js';
import { RobokassaProvider } from './providers/robokassa.provider.js';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    TelegramStarsProvider,
    YooKassaProvider,
    CloudPaymentsProvider,
    RobokassaProvider,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
