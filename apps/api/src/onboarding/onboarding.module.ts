import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CabinetModule } from '../cabinet/cabinet.module.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

@Module({
  imports: [AuthModule, CabinetModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
