import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  DirectMembersController,
  DirectMembersOwnerController,
} from './direct-members.controller.js';
import { DirectMembersService } from './direct-members.service.js';

@Module({
  imports: [AuthModule],
  controllers: [DirectMembersController, DirectMembersOwnerController],
  providers: [DirectMembersService],
  exports: [DirectMembersService],
})
export class DirectMembersModule {}
