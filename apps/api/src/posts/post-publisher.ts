import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { channels, postMedia, postTargets, posts } from '../db/schema.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { MediaStorage } from './media-storage.js';

/**
 * Отправка поста в каналы.
 *
 * Ключевое правило: **публикация идемпотентна**. BullMQ при сбое воркера
 * повторяет задачу, и без проверки «у этой цели уже есть message_id»
 * подписчики получат пост дважды. Поэтому единственный признак «отправлено» —
 * записанный message_id, и цели с ним пропускаются на любом повторе.
 */
@Injectable()
export class PostPublisher {
  private readonly logger = new Logger(PostPublisher.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly telegram: TelegramService,
    private readonly storage: MediaStorage,
  ) {}

  async publish(postId: string): Promise<void> {
    const [post] = await this.db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post) {
      this.logger.warn(`пост ${postId} исчез до публикации — задача снята`);
      return;
    }
    if (post.status === 'published') return;

    await this.db
      .update(posts)
      .set({ status: 'publishing', updatedAt: new Date() })
      .where(eq(posts.id, postId));

    const media = await this.db
      .select()
      .from(postMedia)
      .where(eq(postMedia.postId, postId))
      .orderBy(asc(postMedia.position));

    // Только неотправленные цели: пересланное на прошлой попытке не трогаем.
    const pending = await this.db
      .select({
        targetId: postTargets.id,
        chatId: channels.tgChatId,
        botId: channels.botId,
        title: channels.title,
      })
      .from(postTargets)
      .innerJoin(channels, eq(channels.id, postTargets.channelId))
      .where(and(eq(postTargets.postId, postId), isNull(postTargets.messageId)));

    const failures: string[] = [];
    for (const target of pending) {
      try {
        const sent = await this.telegram.sendPost(target.botId, target.chatId, {
          bodyHtml: post.bodyHtml,
          disablePreview: post.disablePreview,
          media: media.map((m) => ({
            mediaType: m.mediaType as 'photo' | 'video' | 'document',
            fileId: m.fileId,
            path: m.storagePath ? this.storage.absolute(m.storagePath) : null,
          })),
        });
        await this.db
          .update(postTargets)
          .set({ messageId: sent.messageId, sentAt: new Date(), error: null })
          .where(eq(postTargets.id, target.targetId));

        // Первая отправка вернула file_id — со второго канала файл заливать уже
        // не нужно, и с диска его можно убрать.
        await this.rememberFileIds(media, sent.fileIds);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        failures.push(`${target.title}: ${reason}`);
        await this.db
          .update(postTargets)
          .set({ error: reason.slice(0, 500) })
          .where(eq(postTargets.id, target.targetId));
        this.logger.error(`пост ${postId} → ${target.title}: ${reason}`);
      }
    }

    if (failures.length) {
      await this.db
        .update(posts)
        .set({ status: 'failed', error: failures.join('; ').slice(0, 1000), updatedAt: new Date() })
        .where(eq(posts.id, postId));
      // Бросаем наверх: BullMQ повторит задачу, а повтор безопасен — успевшие
      // уйти каналы уже с message_id и пропускаются.
      throw new Error(`пост ${postId}: не доставлен в ${failures.length} канал(ов)`);
    }

    await this.db
      .update(posts)
      .set({ status: 'published', publishedAt: new Date(), error: null, updatedAt: new Date() })
      .where(eq(posts.id, postId));
    this.logger.log(`пост ${postId} опубликован`);
  }

  /**
   * Запомнить file_id, полученные при первой отправке: следующим каналам файл
   * уже не заливаем, а с диска его убираем — хранилище нам не нужно.
   * Порядок ответа совпадает с порядком вложений, по нему и сопоставляем.
   */
  private async rememberFileIds(
    media: { id: string; fileId: string | null; storagePath: string | null }[],
    fileIds: (string | null)[],
  ): Promise<void> {
    for (let i = 0; i < media.length; i += 1) {
      const fileId = fileIds[i];
      const row = media[i];
      if (!fileId || row.fileId) continue;

      await this.db
        .update(postMedia)
        .set({ fileId, storagePath: null })
        .where(eq(postMedia.id, row.id));
      await this.storage.remove(row.storagePath);
      // Локальную копию тоже правим: следующий канал в этом же цикле должен
      // увидеть file_id, а не путь к уже удалённому файлу.
      row.fileId = fileId;
      row.storagePath = null;
    }
  }
}
