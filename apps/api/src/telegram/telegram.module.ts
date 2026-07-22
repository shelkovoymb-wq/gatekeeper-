import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller.js';
import { BotRegistry } from './bot-registry.js';
import { TelegramUpdateHandler } from './update-handler.js';

@Module({
  controllers: [TelegramController],
  providers: [BotRegistry, TelegramUpdateHandler],
  exports: [BotRegistry],
})
export class TelegramModule {}
