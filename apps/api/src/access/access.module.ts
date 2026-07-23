import { Module } from '@nestjs/common';
import { AccessService } from './access.service.js';
import { AccessQueueProducer } from './access.queue.js';
import { AccessWorker } from './access.worker.js';
import { TelegramCoreModule } from '../telegram/telegram-core.module.js';
import { SubscribersModule } from '../subscribers/subscribers.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  imports: [TelegramCoreModule, SubscribersModule, SubscriptionsModule],
  providers: [AccessService, AccessQueueProducer, AccessWorker],
  exports: [AccessService, AccessQueueProducer],
})
export class AccessModule {}
