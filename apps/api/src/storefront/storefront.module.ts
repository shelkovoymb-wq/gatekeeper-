import { Module } from '@nestjs/common';
import { TelegramCoreModule } from '../telegram/telegram-core.module.js';
import { SubscribersModule } from '../subscribers/subscribers.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { FulfillmentService } from './fulfillment.service.js';
import { StorefrontService } from './storefront.service.js';

@Module({
  imports: [TelegramCoreModule, SubscribersModule, SubscriptionsModule],
  providers: [FulfillmentService, StorefrontService],
  exports: [StorefrontService, FulfillmentService],
})
export class StorefrontModule {}
