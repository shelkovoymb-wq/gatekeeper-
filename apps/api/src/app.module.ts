import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DbModule } from './db/db.module.js';
import { HealthController } from './health/health.controller.js';
import { TelegramModule } from './telegram/telegram.module.js';

/**
 * Корневой модуль. По мере роста сюда подключаются доменные модули:
 * auth, tenants, platform-billing, bots, channels, plans, subscriptions,
 * payments, access, messaging, events, analytics (см. docs 02-architecture.md).
 */
@Module({
  imports: [ConfigModule, DbModule, TelegramModule],
  controllers: [HealthController],
})
export class AppModule {}
