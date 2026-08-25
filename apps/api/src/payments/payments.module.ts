import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentAccountsController } from './payment-accounts.controller.js';
import { PaymentConfigService } from './payment-config.service.js';
import { PaymentConfigController } from './payment-config.controller.js';
import { TelegramStarsProvider } from './providers/telegram-stars.provider.js';
import { YooKassaProvider } from './providers/yookassa.provider.js';
import { CloudPaymentsProvider } from './providers/cloudpayments.provider.js';
import { RobokassaProvider } from './providers/robokassa.provider.js';
import { ProdamusProvider } from './providers/prodamus.provider.js';
import { DirectTransferProvider } from './providers/direct-transfer.provider.js';
import { ProviderCredentials } from './provider-credentials.js';
import { FulfillmentModule } from '../storefront/fulfillment.module.js';

@Module({
  imports: [FulfillmentModule],
  controllers: [PaymentsController, PaymentAccountsController, PaymentConfigController],
  providers: [
    PaymentsService,
    PaymentConfigService,
    ProviderCredentials,
    TelegramStarsProvider,
    YooKassaProvider,
    CloudPaymentsProvider,
    RobokassaProvider,
    ProdamusProvider,
    DirectTransferProvider,
  ],
  exports: [PaymentsService, PaymentConfigService],
})
export class PaymentsModule {}
