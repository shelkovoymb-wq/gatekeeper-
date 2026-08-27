import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { DB, type Database } from '../db/db.module.js';
import { postMedia, posts } from '../db/schema.js';
import { POSTS_QUEUE, POSTS_QUEUE_NAME, type PublishJob } from '../queue/queue.module.js';
import { MediaStorage } from './media-storage.js';

/**
 * Страховка отложенных публикаций.
 *
 * Задача живёт в Redis, а срок — в базе. Если Redis чистили или он поднялся
 * пустым, запланированный пост останется в статусе scheduled навсегда и просто
 * не выйдет. Раз в пять минут добираем такие посты: постановка идемпотентна —
 * jobId детерминированный, и живая задача не задваивается.
 */
@Injectable()
export class PostsCron {
  private readonly logger = new Logger(PostsCron.name);
  private running = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POSTS_QUEUE) private readonly queue: Queue<PublishJob>,
    private readonly storage: MediaStorage,
  ) {}

  @Cron('*/5 * * * *')
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Минута форы: пост, чей срок наступил только что, ещё ждёт своей
      // задачи в Redis — дёргать его рано.
      const overdue = await this.db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.status, 'scheduled'), lte(posts.publishAt, sql`now() - interval '1 minute'`)))
        .limit(100);

      for (const post of overdue) {
        await this.queue.add(
          POSTS_QUEUE_NAME,
          { postId: post.id },
          { jobId: `post:${post.id}`, removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
        );
      }
      if (overdue.length) {
        this.logger.warn(`добрали ${overdue.length} просроченных публикаций`);
      }
    } catch (e) {
      this.logger.error(`posts cron: ${String(e)}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Раз в сутки убрать брошенные загрузки: файл залили, пост не сохранили.
   * Файлы, на которые ссылается хоть один неопубликованный пост, не трогаем —
   * публикацию могли назначить на месяц вперёд.
   */
  @Cron('30 4 * * *')
  async sweepUploads(): Promise<void> {
    try {
      const rows = await this.db
        .select({ path: postMedia.storagePath })
        .from(postMedia)
        .where(isNotNull(postMedia.storagePath));
      const keep = new Set(rows.map((r) => r.path as string));

      const removed = await this.storage.sweep(keep);
      if (removed) this.logger.log(`убрано брошенных вложений: ${removed}`);
    } catch (e) {
      this.logger.error(`uploads sweep: ${String(e)}`);
    }
  }
}
