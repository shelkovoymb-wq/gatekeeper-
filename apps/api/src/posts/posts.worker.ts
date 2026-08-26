import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS, POSTS_QUEUE_NAME, type PublishJob } from '../queue/queue.module.js';
import { PostPublisher } from './post-publisher.js';

/** Консюмер отложенных публикаций. Повторы настроены продюсером. */
@Injectable()
export class PostsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostsWorker.name);
  private worker?: Worker<PublishJob>;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly publisher: PostPublisher,
  ) {}

  onModuleInit() {
    // Отдельное подключение для воркера (требование BullMQ).
    const connection = this.redis.duplicate();
    this.worker = new Worker<PublishJob>(
      POSTS_QUEUE_NAME,
      async (job) => {
        await this.publisher.publish(job.data.postId);
      },
      // Не больше одной публикации разом: Telegram ограничивает частоту
      // отправки, и параллельная рассылка быстрее упирается в 429.
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`publish job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log('posts worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
