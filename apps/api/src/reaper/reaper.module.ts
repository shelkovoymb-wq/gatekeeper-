import { Module } from '@nestjs/common';
import { ReaperService } from './reaper.service.js';
import { EventsModule } from '../events/events.module.js';
import { AccessModule } from '../access/access.module.js';

@Module({
  imports: [EventsModule, AccessModule],
  providers: [ReaperService],
})
export class ReaperModule {}
