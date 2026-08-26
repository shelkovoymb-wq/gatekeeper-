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
export const POSTS_QUEUE = Symbol('POSTS_QUEUE');

export const ACCESS_QUEUE_NAME = 'access';
export const POSTS_QUEUE_NAME = 'posts';

export interface RevokeJob {
  subscriberId: string;
  tgUserId: number;
  reason: string;
}

/** Отложенная публикация поста. Задержку считает продюсер, время хранит база. */
export interface PublishJob {
  postId: string;
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
    {
      provide: POSTS_QUEUE,
      useFactory: (connection: Redis) =>
        new Queue<PublishJob>(POSTS_QUEUE_NAME, { connection }),
      inject: [REDIS],
    },
  ],
  exports: [REDIS, ACCESS_QUEUE, POSTS_QUEUE],
})
export class QueueModule implements OnModuleDestroy {
  private readonly logger = new Logger(QueueModule.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ACCESS_QUEUE) private readonly accessQueue: Queue,
    @Inject(POSTS_QUEUE) private readonly postsQueue: Queue,
  ) {}

  async onModuleDestroy() {
    try {
      await this.accessQueue.close();
      await this.postsQueue.close();
      await this.redis.quit();
    } catch (e) {
      this.logger.warn(`queue shutdown: ${String(e)}`);
    }
  }
}
