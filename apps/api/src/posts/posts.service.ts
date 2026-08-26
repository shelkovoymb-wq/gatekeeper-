import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { DB, type Database } from '../db/db.module.js';
import { channels, postMedia, postTargets, posts } from '../db/schema.js';
import { POSTS_QUEUE, POSTS_QUEUE_NAME, type PublishJob } from '../queue/queue.module.js';
import { MESSAGE_LIMIT, plainLength, sanitizeTelegramHtml } from './telegram-html.js';
import { MediaStorage, assertOwnedPath } from './media-storage.js';

export interface PostInput {
  bodyHtml?: string;
  channelIds?: string[];
  /** ISO-строка в UTC. Пусто — публикуем сразу. */
  publishAt?: string | null;
  disablePreview?: boolean;
  media?: PostMediaInput[];
}

/**
 * Вложение приходит из загрузки: браузер уже положил файл, здесь — только путь.
 * fileId появляется у уже опубликованных постов, при копировании вложения.
 */
export interface PostMediaInput {
  mediaType: string;
  storagePath?: string | null;
  fileId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

const MEDIA_TYPES = ['photo', 'video', 'document'] as const;
/** Телеграм принимает в альбом не больше десяти вложений. */
const MAX_MEDIA = 10;

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(POSTS_QUEUE) private readonly queue: Queue<PublishJob>,
    private readonly storage: MediaStorage,
  ) {}

  /** Загрузка вложения: файл ложится на диск, в пост уйдёт только путь. */
  async upload(
    clientId: string,
    file: { buffer: Buffer; originalName?: string; mimeType?: string },
  ) {
    const saved = await this.storage.save(clientId, file);
    return {
      storagePath: saved.storagePath,
      mediaType: saved.mediaType,
      fileName: file.originalName ?? null,
      fileSize: saved.size,
    };
  }

  /** Каналы клиента — из них он выбирает, куда публиковать. */
  private async assertChannelsOwned(clientId: string, channelIds: string[]): Promise<void> {
    if (!channelIds.length) throw new BadRequestException('выберите хотя бы один канал');

    const rows = await this.db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.clientId, clientId), inArray(channels.id, channelIds)));

    if (rows.length !== channelIds.length) {
      // Не «канал не найден»: клиент подставил чужой id, и говорить ему, какой
      // именно существует, незачем.
      throw new ForbiddenException('среди выбранных есть чужой канал');
    }
  }

  private validateMedia(clientId: string, media: PostInput['media']): void {
    if (!media?.length) return;
    if (media.length > MAX_MEDIA) {
      throw new BadRequestException(`вложений не больше ${MAX_MEDIA}`);
    }
    for (const m of media) {
      if (!(MEDIA_TYPES as readonly string[]).includes(m.mediaType)) {
        throw new BadRequestException(`неизвестный тип вложения: ${m.mediaType}`);
      }
      if (!m.storagePath && !m.fileId) throw new BadRequestException('вложение без файла');
      // Путь приходит от клиента: без проверки сюда приедет чужой каталог.
      if (m.storagePath) assertOwnedPath(clientId, m.storagePath);
    }
    // Телеграм собирает альбом либо из фото и видео, либо из документов.
    // Смешанный альбом он отвергает целиком — ловим это здесь, а не через час
    // при отложенной публикации.
    if (media.length > 1) {
      const docs = media.filter((m) => m.mediaType === 'document').length;
      if (docs > 0 && docs !== media.length) {
        throw new BadRequestException('документы нельзя слать в одном альбоме с фото и видео');
      }
    }
  }

  /**
   * Чистим разметку при сохранении: Telegram на чужом теге отвечает 400 и пост
   * не публикует вовсе. Клиент должен увидеть результат сразу в редакторе.
   */
  private prepareBody(raw: string): string {
    const bodyHtml = sanitizeTelegramHtml(raw.trim());
    if (plainLength(bodyHtml) > MESSAGE_LIMIT) {
      throw new BadRequestException(`текст длиннее ${MESSAGE_LIMIT} символов`);
    }
    return bodyHtml;
  }

  private parsePublishAt(value: string | null | undefined): Date | null {
    if (!value) return null;
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) throw new BadRequestException('некорректное время публикации');
    return at;
  }

  async list(clientId: string, limit = 100) {
    const rows = await this.db
      .select()
      .from(posts)
      .where(eq(posts.clientId, clientId))
      .orderBy(sql`coalesce(${posts.publishAt}, ${posts.createdAt}) desc`)
      .limit(limit);

    if (!rows.length) return [];

    const ids = rows.map((p) => p.id);
    const targets = await this.db
      .select()
      .from(postTargets)
      .where(inArray(postTargets.postId, ids));
    const media = await this.db.select().from(postMedia).where(inArray(postMedia.postId, ids));

    return rows.map((p) => ({
      id: p.id,
      bodyHtml: p.bodyHtml,
      status: p.status,
      publishAt: p.publishAt,
      publishedAt: p.publishedAt,
      error: p.error,
      disablePreview: p.disablePreview,
      createdAt: p.createdAt,
      channelIds: targets.filter((t) => t.postId === p.id).map((t) => t.channelId),
      targets: targets
        .filter((t) => t.postId === p.id)
        .map((t) => ({ channelId: t.channelId, messageId: t.messageId, error: t.error })),
      media: media
        .filter((m) => m.postId === p.id)
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          mediaType: m.mediaType,
          fileId: m.fileId,
          storagePath: m.storagePath,
          fileName: m.fileName,
          fileSize: m.fileSize,
        })),
    }));
  }

  private async assertOwned(clientId: string, postId: string) {
    const [post] = await this.db
      .select()
      .from(posts)
      .where(and(eq(posts.id, postId), eq(posts.clientId, clientId)))
      .limit(1);
    if (!post) throw new NotFoundException('пост не найден');
    return post;
  }

  async create(clientId: string, input: PostInput) {
    const channelIds = input.channelIds ?? [];
    const bodyHtml = this.prepareBody(input.bodyHtml ?? '');
    const media = input.media ?? [];

    if (!bodyHtml && !media.length) {
      throw new BadRequestException('пост пустой: нужен текст или вложение');
    }
    await this.assertChannelsOwned(clientId, channelIds);
    this.validateMedia(clientId, media);
    const publishAt = this.parsePublishAt(input.publishAt);

    const [post] = await this.db
      .insert(posts)
      .values({
        clientId,
        bodyHtml,
        status: 'draft',
        publishAt,
        disablePreview: input.disablePreview ?? false,
      })
      .returning();

    await this.db
      .insert(postTargets)
      .values(channelIds.map((channelId) => ({ postId: post.id, channelId })));

    if (media.length) {
      await this.db.insert(postMedia).values(media.map((m, i) => this.mediaRow(post.id, m, i)));
    }

    return { id: post.id, status: post.status };
  }

  async update(clientId: string, postId: string, input: PostInput) {
    const post = await this.assertOwned(clientId, postId);
    if (post.status === 'published' || post.status === 'publishing') {
      throw new BadRequestException('пост уже ушёл в канал, править нельзя');
    }

    const bodyHtml =
      input.bodyHtml !== undefined ? this.prepareBody(input.bodyHtml) : post.bodyHtml;
    const publishAt =
      input.publishAt !== undefined ? this.parsePublishAt(input.publishAt) : post.publishAt;

    if (input.channelIds) await this.assertChannelsOwned(clientId, input.channelIds);
    this.validateMedia(clientId, input.media);

    await this.db
      .update(posts)
      .set({
        bodyHtml,
        publishAt,
        disablePreview: input.disablePreview ?? post.disablePreview,
        // Правка снимает прежнюю ошибку: пост снова черновик, пока его не
        // поставили в очередь заново.
        status: 'draft',
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));

    if (input.channelIds) {
      await this.db.delete(postTargets).where(eq(postTargets.postId, postId));
      await this.db
        .insert(postTargets)
        .values(input.channelIds.map((channelId) => ({ postId, channelId })));
    }

    if (input.media) {
      await this.dropMedia(postId, input.media);
      if (input.media.length) {
        await this.db
          .insert(postMedia)
          .values(input.media.map((m, i) => this.mediaRow(postId, m, i)));
      }
    }

    // Запланированный пост, который отредактировали, надо переставить в
    // очередь: старая задача указывает на прежнее время.
    await this.removeJob(postId);
    return { id: postId, status: 'draft' as const };
  }

  /**
   * Поставить в очередь. «Опубликовать сейчас» — это тот же путь с нулевой
   * задержкой: второй ветки исполнения не заводим, иначе она со временем
   * разойдётся с основной.
   */
  async schedule(clientId: string, postId: string) {
    const post = await this.assertOwned(clientId, postId);
    if (post.status === 'published') throw new BadRequestException('пост уже опубликован');

    const targets = await this.db
      .select({ id: postTargets.id })
      .from(postTargets)
      .where(eq(postTargets.postId, postId));
    if (!targets.length) throw new BadRequestException('не выбран ни один канал');

    const delay = post.publishAt ? Math.max(0, post.publishAt.getTime() - Date.now()) : 0;

    await this.db
      .update(posts)
      .set({ status: 'scheduled', error: null, updatedAt: new Date() })
      .where(eq(posts.id, postId));

    await this.queue.add(
      POSTS_QUEUE_NAME,
      { postId },
      {
        delay,
        // Детерминированный id: повторная постановка того же поста заменяет
        // задачу, а не добавляет вторую.
        jobId: `post:${postId}`,
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    );

    this.logger.log(`пост ${postId} запланирован, задержка ${Math.round(delay / 1000)} с`);
    return { id: postId, status: 'scheduled' as const, publishAt: post.publishAt };
  }

  /** Снять с публикации: пока не наступил срок. */
  async unschedule(clientId: string, postId: string) {
    const post = await this.assertOwned(clientId, postId);
    if (post.status !== 'scheduled') {
      throw new BadRequestException('снять можно только запланированный пост');
    }
    await this.removeJob(postId);
    await this.db
      .update(posts)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(posts.id, postId));
    return { id: postId, status: 'draft' as const };
  }

  async remove(clientId: string, postId: string) {
    const post = await this.assertOwned(clientId, postId);
    if (post.status === 'publishing') {
      throw new BadRequestException('пост сейчас публикуется, подождите');
    }
    await this.removeJob(postId);
    // Строки targets и media уйдут по ON DELETE CASCADE, а вот файлы на диске
    // база за собой не подчистит.
    await this.dropMedia(postId, []);
    await this.db.delete(posts).where(eq(posts.id, postId));
    return { ok: true };
  }

  private mediaRow(postId: string, m: PostMediaInput, position: number) {
    return {
      postId,
      mediaType: m.mediaType,
      fileId: m.fileId ?? null,
      storagePath: m.storagePath ?? null,
      fileName: m.fileName ?? null,
      fileSize: m.fileSize ?? null,
      position,
    };
  }

  /**
   * Заменить вложения поста, убрав с диска то, что клиент выкинул из поста.
   * Иначе каждая правка оставляет за собой файл, на который никто не ссылается.
   */
  private async dropMedia(postId: string, keepInput: PostMediaInput[]): Promise<void> {
    const existing = await this.db
      .select({ storagePath: postMedia.storagePath })
      .from(postMedia)
      .where(eq(postMedia.postId, postId));

    const keep = new Set(keepInput.map((m) => m.storagePath).filter(Boolean) as string[]);
    await this.db.delete(postMedia).where(eq(postMedia.postId, postId));
    for (const row of existing) {
      if (row.storagePath && !keep.has(row.storagePath)) await this.storage.remove(row.storagePath);
    }
  }

  private async removeJob(postId: string): Promise<void> {
    try {
      const job = await this.queue.getJob(`post:${postId}`);
      await job?.remove();
    } catch (e) {
      // Задачи может не быть — это норма. Ронять из-за этого правку поста
      // незачем.
      this.logger.warn(`не удалось снять задачу поста ${postId}: ${String(e)}`);
    }
  }
}
