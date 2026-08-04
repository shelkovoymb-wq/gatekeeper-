import { Module } from '@nestjs/common';
import { BotsService } from './bots.service.js';
import { BotsController } from './bots.controller.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { TelegramModule } from '../telegram/telegram.module.js';

@Module({
  imports: [TenantsModule, TelegramModule],
  controllers: [BotsController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
