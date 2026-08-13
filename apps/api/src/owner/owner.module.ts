import { Module } from '@nestjs/common';
import { OwnerPayoutsService } from './owner-payouts.service.js';
import { OwnerPayoutsController } from './owner-payouts.controller.js';

@Module({
  controllers: [OwnerPayoutsController],
  providers: [OwnerPayoutsService],
  exports: [OwnerPayoutsService],
})
export class OwnerModule {}
