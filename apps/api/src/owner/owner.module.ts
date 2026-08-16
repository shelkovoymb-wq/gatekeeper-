import { Module } from '@nestjs/common';
// JwtAuthGuard на контроллере тянет JwtService — без AuthModule Nest не
// резолвит гвард и приложение не поднимается вовсе (см. PlatformModule).
import { AuthModule } from '../auth/auth.module.js';
import { OwnerPayoutsService } from './owner-payouts.service.js';
import { OwnerPayoutsController } from './owner-payouts.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [OwnerPayoutsController],
  providers: [OwnerPayoutsService],
  exports: [OwnerPayoutsService],
})
export class OwnerModule {}
