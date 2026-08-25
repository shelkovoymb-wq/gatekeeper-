import { Module } from '@nestjs/common';
import { TelegramCoreModule } from '../telegram/telegram-core.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { FulfillmentModule } from './fulfillment.module.js';
import { StorefrontService } from './storefront.service.js';

@Module({
  imports: [TelegramCoreModule, FulfillmentModule, PaymentsModule],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
