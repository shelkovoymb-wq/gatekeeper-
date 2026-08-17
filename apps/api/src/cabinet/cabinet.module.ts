import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BotsModule } from '../bots/bots.module.js';
import { PlansModule } from '../plans/plans.module.js';
import { ChannelsModule } from '../channels/channels.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { CabinetController } from './cabinet.controller.js';
import { CabinetService } from './cabinet.service.js';

@Module({
  imports: [AuthModule, BotsModule, PlansModule, ChannelsModule, PaymentsModule],
  controllers: [CabinetController],
  providers: [CabinetService],
  exports: [CabinetService],
})
export class CabinetModule {}
