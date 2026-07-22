import { Module } from '@nestjs/common';
import { SubscribersService } from './subscribers.service.js';

@Module({
  providers: [SubscribersService],
  exports: [SubscribersService],
})
export class SubscribersModule {}
