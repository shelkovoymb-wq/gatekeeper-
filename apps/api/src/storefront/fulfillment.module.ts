import { Module } from '@nestjs/common';
import { TelegramCoreModule } from '../telegram/telegram-core.module.js';
import { SubscribersModule } from '../subscribers/subscribers.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';
import { FulfillmentService } from './fulfillment.service.js';

/**
 * Выдача доступа вынесена в отдельный модуль, потому что нужна с двух сторон:
 * витрине бота (оплата звёздами закрывается на месте) и PaymentsService
 * (оплата через провайдера закрывается вебхуком). Если бы она осталась внутри
 * StorefrontModule, получился бы цикл Storefront → Payments → Storefront.
 */
@Module({
  imports: [TelegramCoreModule, SubscribersModule, SubscriptionsModule],
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
