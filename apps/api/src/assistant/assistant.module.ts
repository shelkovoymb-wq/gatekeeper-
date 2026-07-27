import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CabinetModule } from '../cabinet/cabinet.module.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [AuthModule, CabinetModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
