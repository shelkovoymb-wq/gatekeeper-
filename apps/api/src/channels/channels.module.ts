import { Module } from '@nestjs/common';
import { ChannelsService } from './channels.service.js';
import { ChannelsController } from './channels.controller.js';
import { TelegramCoreModule } from '../telegram/telegram-core.module.js';

@Module({
  imports: [TelegramCoreModule],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [ChannelsService],
})
export class ChannelsModule {}
