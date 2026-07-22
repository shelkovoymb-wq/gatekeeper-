import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { CryptoModule } from './common/crypto.module.js';
import { HealthController } from './health/health.controller.js';
import { TelegramCoreModule } from './telegram/telegram-core.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { TenantsModule } from './tenants/tenants.module.js';
import { BotsModule } from './bots/bots.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { PlansModule } from './plans/plans.module.js';
import { SubscribersModule } from './subscribers/subscribers.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { AccessModule } from './access/access.module.js';

/**
 * Корневой модуль. Фаза 1 (join-request flow): bots, channels, plans,
 * subscribers, subscriptions, access + telegram webhook.
 * Далее (Фаза 1+/2): auth (JWT), payments, messaging (очередь), events (outbox→n8n),
 * platform-billing, analytics — см. docs 02-architecture.md.
 */
@Module({
  imports: [
    ConfigModule,
    DbModule,
    CryptoModule,
    TelegramCoreModule,
    TenantsModule,
    BotsModule,
    ChannelsModule,
    PlansModule,
    SubscribersModule,
    SubscriptionsModule,
    AccessModule,
    TelegramModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
