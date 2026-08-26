import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AddonsController } from './addons.controller.js';
import { AddonWebhookController } from './addon-webhook.controller.js';
import { AddonsOwnerController } from './addons.owner.controller.js';
import { AddonsService } from './addons.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AddonsController, AddonsOwnerController, AddonWebhookController],
  providers: [AddonsService],
  exports: [AddonsService],
})
export class AddonsModule {}
