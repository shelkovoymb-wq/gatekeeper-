import { Module } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { OutboxDispatcher } from './outbox-dispatcher.service.js';

@Module({
  providers: [EventsService, OutboxDispatcher],
  exports: [EventsService],
})
export class EventsModule {}
