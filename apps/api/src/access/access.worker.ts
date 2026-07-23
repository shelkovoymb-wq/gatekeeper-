import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS, ACCESS_QUEUE_NAME, type RevokeJob } from '../queue/queue.module.js';
import { AccessService } from './access.service.js';

/** Консюмер задач отзыва доступа: kick с retry/backoff (настроено продюсером). */
@Injectable()
export class AccessWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccessWorker.name);
  private worker?: Worker<RevokeJob>;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly access: AccessService,
  ) {}

  onModuleInit() {
    // Отдельное подключение для воркера (требование BullMQ).
    const connection = this.redis.duplicate();
    this.worker = new Worker<RevokeJob>(
      ACCESS_QUEUE_NAME,
      async (job) => {
        const { subscriberId, tgUserId } = job.data;
        await this.access.revokeAllForSubscriber(subscriberId, tgUserId);
      },
      { connection, concurrency: 5 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`revoke job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log('access worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
