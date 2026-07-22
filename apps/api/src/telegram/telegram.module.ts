import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller.js';
import { TelegramUpdateHandler } from './update-handler.js';
import { TelegramCoreModule } from './telegram-core.module.js';
import { AccessModule } from '../access/access.module.js';
import { ChannelsModule } from '../channels/channels.module.js';

@Module({
  imports: [TelegramCoreModule, AccessModule, ChannelsModule],
  controllers: [TelegramController],
  providers: [TelegramUpdateHandler],
})
export class TelegramModule {}
