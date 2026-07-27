import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { ConfigModule } from './config/config.module.js'
import { DbModule } from './db/db.module.js'
import { CryptoModule } from './common/crypto.module.js'
import { QueueModule } from './queue/queue.module.js'
import { AppController } from './app.controller.js'
import { HealthController } from './health/health.controller.js'
import { TelegramCoreModule } from './telegram/telegram-core.module.js'
import { TelegramModule } from './telegram/telegram.module.js'
import { TenantsModule } from './tenants/tenants.module.js'
import { BotsModule } from './bots/bots.module.js'
import { ChannelsModule } from './channels/channels.module.js'
import { PlansModule } from './plans/plans.module.js'
import { SubscribersModule } from './subscribers/subscribers.module.js'
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js'
import { AccessModule } from './access/access.module.js'
import { EventsModule } from './events/events.module.js'
import { ReaperModule } from './reaper/reaper.module.js'
import { PaymentsModule } from './payments/payments.module.js'
import { AdminModule } from './admin/admin.module.js'
import { AuthModule } from './auth/auth.module.js'
import { CabinetModule } from './cabinet/cabinet.module.js'
import { AssistantModule } from './assistant/assistant.module.js'

/**
 * Корневой модуль. Фаза 1 (join-request flow): bots, channels, plans,
 * subscribers, subscriptions, access + telegram webhook.
 * Фаза 1.5 (payments): YooKassa, CloudPayments, Robokassa, Telegram Stars
 * Далее (Фаза 2): auth (JWT), messaging (очередь), events (outbox→n8n),
 * platform-billing, analytics — см. docs 02-architecture.md.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    DbModule,
    CryptoModule,
    QueueModule,
    TelegramCoreModule,
    TenantsModule,
    BotsModule,
    ChannelsModule,
    PlansModule,
    SubscribersModule,
    SubscriptionsModule,
    AccessModule,
    EventsModule,
    ReaperModule,
    PaymentsModule,
    AdminModule,
    AuthModule,
    CabinetModule,
    AssistantModule,
    TelegramModule
  ],
  controllers: [AppController, HealthController]
})
export class AppModule {}
