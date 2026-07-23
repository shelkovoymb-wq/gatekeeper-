import {
  Global,
  Module,
  type OnModuleDestroy,
  Inject,
  Logger,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

export const REDIS = Symbol('REDIS');
export const ACCESS_QUEUE = Symbol('ACCESS_QUEUE');

export const ACCESS_QUEUE_NAME = 'access';

export interface RevokeJob {
  subscriberId: string;
  tgUserId: number;
  reason: string;
}

/**
 * Инфраструктура очередей. Одно Redis-подключение под продюсеров/Queue;
 * воркеры создают собственное (duplicate) — требование BullMQ.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      useFactory: (env: Env): Redis =>
        new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
      inject: [ENV],
    },
    {
      provide: ACCESS_QUEUE,
      useFactory: (connection: Redis) =>
        new Queue<RevokeJob>(ACCESS_QUEUE_NAME, { connection }),
      inject: [REDIS],
    },
  ],
  exports: [REDIS, ACCESS_QUEUE],
})
export class QueueModule implements OnModuleDestroy {
  private readonly logger = new Logger(QueueModule.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ACCESS_QUEUE) private readonly accessQueue: Queue,
  ) {}

  async onModuleDestroy() {
    try {
      await this.accessQueue.close();
      await this.redis.quit();
    } catch (e) {
      this.logger.warn(`queue shutdown: ${String(e)}`);
    }
  }
}
