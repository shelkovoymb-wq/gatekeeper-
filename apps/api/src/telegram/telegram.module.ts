import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller.js';
import { TelegramUpdateHandler } from './update-handler.js';
import { TelegramCoreModule } from './telegram-core.module.js';
import { BotPoller } from './bot-poller.js';
import { AccessModule } from '../access/access.module.js';
import { ChannelsModule } from '../channels/channels.module.js';
import { StorefrontModule } from '../storefront/storefront.module.js';

@Module({
  imports: [TelegramCoreModule, AccessModule, ChannelsModule, StorefrontModule],
  controllers: [TelegramController],
  providers: [TelegramUpdateHandler, BotPoller],
  exports: [BotPoller],
})
export class TelegramModule {}
