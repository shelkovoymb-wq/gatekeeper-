import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentAccountsController } from './payment-accounts.controller.js';
import { TelegramStarsProvider } from './providers/telegram-stars.provider.js';
import { YooKassaProvider } from './providers/yookassa.provider.js';
import { CloudPaymentsProvider } from './providers/cloudpayments.provider.js';
import { RobokassaProvider } from './providers/robokassa.provider.js';
import { ProdamusProvider } from './providers/prodamus.provider.js';
import { DirectTransferProvider } from './providers/direct-transfer.provider.js';

@Module({
  controllers: [PaymentsController, PaymentAccountsController],
  providers: [
    PaymentsService,
    TelegramStarsProvider,
    YooKassaProvider,
    CloudPaymentsProvider,
    RobokassaProvider,
    ProdamusProvider,
    DirectTransferProvider,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
