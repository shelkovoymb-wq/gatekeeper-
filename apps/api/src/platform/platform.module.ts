import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { BillingCron } from './billing.cron.js';

@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, BillingCron],
  exports: [PlatformService],
})
export class PlatformModule {}
