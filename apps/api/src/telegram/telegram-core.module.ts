import { Module } from '@nestjs/common';
import { BotRegistry } from './bot-registry.js';
import { TelegramService } from './telegram.service.js';

/**
 * Базовый Telegram-слой без доменных зависимостей: реестр ботов и API-обёртка.
 * Импортируется доменными модулями (channels, access) — исключает циклы с
 * TelegramModule, который, наоборот, зависит от доменных модулей.
 */
@Module({
  providers: [BotRegistry, TelegramService],
  exports: [BotRegistry, TelegramService],
})
export class TelegramCoreModule {}
