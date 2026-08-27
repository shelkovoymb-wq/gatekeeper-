import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';
import { PostsService } from './posts.service.js';
import type { MediaStorage } from './media-storage.js';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const CHANNEL = '33333333-3333-3333-3333-333333333333';
const POST = '44444444-4444-4444-4444-444444444444';
const FILE = '55555555-5555-5555-5555-555555555555';

function build() {
  const { db, fake } = createFakeDb();
  const queue = {
    add: vi.fn().mockResolvedValue({ id: 'job' }),
    getJob: vi.fn().mockResolvedValue(null),
  };
  const storage = { remove: vi.fn().mockResolvedValue(undefined) } as unknown as MediaStorage;
  const service = new PostsService(db, queue as never, storage);
  return { service, fake, queue, storage };
}

describe('PostsService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  describe('создание', () => {
    it('пустой пост не создаётся', async () => {
      await expect(ctx.service.create(CLIENT, { channelIds: [CHANNEL] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('без каналов не создаётся', async () => {
      await expect(ctx.service.create(CLIENT, { bodyHtml: 'текст' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('чужой канал — 403, пост не пишется', async () => {
      // Клиент подставил id канала другого проекта: проверка возвращает меньше
      // строк, чем он прислал.
      ctx.fake.queue([]);
      await expect(
        ctx.service.create(CLIENT, { bodyHtml: 'текст', channelIds: [CHANNEL] }),
      ).rejects.toThrow(ForbiddenException);
      expect(ctx.fake.calls.some((c) => c.method === 'insert')).toBe(false);
    });

    it('свой канал — пост сохраняется вместе с целью', async () => {
      ctx.fake.queue([{ id: CHANNEL }], [{ id: POST, status: 'draft' }]);
      const res = await ctx.service.create(CLIENT, {
        bodyHtml: '<b>привет</b>',
        channelIds: [CHANNEL],
      });
      expect(res).toEqual({ id: POST, status: 'draft' });

      const values = ctx.fake.argsOf('values', 0)?.[0] as Record<string, unknown>;
      expect(values.bodyHtml).toBe('<b>привет</b>');
      expect(values.status).toBe('draft');
    });

    it('разметка чистится при сохранении, а не при отправке', async () => {
      ctx.fake.queue([{ id: CHANNEL }], [{ id: POST, status: 'draft' }]);
      await ctx.service.create(CLIENT, {
        bodyHtml: '<div>текст</div><script>hack()</script>',
        channelIds: [CHANNEL],
      });
      const values = ctx.fake.argsOf('values', 0)?.[0] as Record<string, unknown>;
      // Telegram на <div> отвечает 400 и не публикует пост вовсе.
      expect(values.bodyHtml).toBe('текстhack()');
    });

    it('вложение из чужого каталога — 403', async () => {
      ctx.fake.queue([{ id: CHANNEL }]);
      await expect(
        ctx.service.create(CLIENT, {
          bodyHtml: 'текст',
          channelIds: [CHANNEL],
          media: [{ mediaType: 'photo', storagePath: `${OTHER}/${FILE}.jpg` }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('больше десяти вложений не принимается', async () => {
      ctx.fake.queue([{ id: CHANNEL }]);
      const media = Array.from({ length: 11 }, () => ({
        mediaType: 'photo',
        storagePath: `${CLIENT}/${FILE}.jpg`,
      }));
      await expect(
        ctx.service.create(CLIENT, { bodyHtml: 'текст', channelIds: [CHANNEL], media }),
      ).rejects.toThrow(BadRequestException);
    });

    it('документ вместе с фото в одном альбоме не принимается', async () => {
      // Telegram отвергает такой альбом целиком — ловим до отправки.
      ctx.fake.queue([{ id: CHANNEL }]);
      await expect(
        ctx.service.create(CLIENT, {
          bodyHtml: 'текст',
          channelIds: [CHANNEL],
          media: [
            { mediaType: 'photo', storagePath: `${CLIENT}/${FILE}.jpg` },
            { mediaType: 'document', storagePath: `${CLIENT}/${FILE}.pdf` },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('битое время публикации не принимается', async () => {
      ctx.fake.queue([{ id: CHANNEL }]);
      await expect(
        ctx.service.create(CLIENT, {
          bodyHtml: 'текст',
          channelIds: [CHANNEL],
          publishAt: 'завтра утром',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('правка', () => {
    it('чужой пост не находится', async () => {
      ctx.fake.queue([]);
      await expect(ctx.service.update(CLIENT, POST, { bodyHtml: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('опубликованный пост править нельзя', async () => {
      ctx.fake.queue([{ id: POST, clientId: CLIENT, status: 'published' }]);
      await expect(ctx.service.update(CLIENT, POST, { bodyHtml: 'x' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('правка возвращает пост в черновики и снимает задачу', async () => {
      ctx.fake.queue([{ id: POST, clientId: CLIENT, status: 'scheduled', bodyHtml: 'старое' }]);
      const res = await ctx.service.update(CLIENT, POST, { bodyHtml: 'новое' });
      expect(res.status).toBe('draft');
      // Старая задача указывает на прежнее время — её надо снять.
      expect(ctx.queue.getJob).toHaveBeenCalledWith(`post:${POST}`);
      const set = ctx.fake.argsOf('set', 0)?.[0] as Record<string, unknown>;
      expect(set.status).toBe('draft');
      expect(set.error).toBeNull();
    });
  });

  describe('постановка в очередь', () => {
    it('без целей не ставится', async () => {
      ctx.fake.queue([{ id: POST, clientId: CLIENT, status: 'draft', publishAt: null }], []);
      await expect(ctx.service.schedule(CLIENT, POST)).rejects.toThrow(BadRequestException);
      expect(ctx.queue.add).not.toHaveBeenCalled();
    });

    it('«сейчас» — это нулевая задержка, а не отдельная ветка', async () => {
      ctx.fake.queue([{ id: POST, clientId: CLIENT, status: 'draft', publishAt: null }], [{ id: 'target' }]);
      await ctx.service.schedule(CLIENT, POST);
      const opts = ctx.queue.add.mock.calls[0][2];
      expect(opts.delay).toBe(0);
      expect(opts.jobId).toBe(`post:${POST}`);
    });

    it('отложенная публикация считает задержку от времени поста', async () => {
      const publishAt = new Date(Date.now() + 3_600_000);
      ctx.fake.queue(
        [{ id: POST, clientId: CLIENT, status: 'draft', publishAt }],
        [{ id: 'target' }],
      );
      await ctx.service.schedule(CLIENT, POST);
      const opts = ctx.queue.add.mock.calls[0][2];
      expect(opts.delay).toBeGreaterThan(3_500_000);
      expect(opts.delay).toBeLessThanOrEqual(3_600_000);
    });

    it('срок в прошлом не даёт отрицательной задержки', async () => {
      ctx.fake.queue(
        [{ id: POST, clientId: CLIENT, status: 'draft', publishAt: new Date(Date.now() - 60_000) }],
        [{ id: 'target' }],
      );
      await ctx.service.schedule(CLIENT, POST);
      expect(ctx.queue.add.mock.calls[0][2].delay).toBe(0);
    });

    it('опубликованный пост второй раз не ставится', async () => {
      ctx.fake.queue([{ id: POST, clientId: CLIENT, status: 'published' }]);
      await expect(ctx.service.schedule(CLIENT, POST)).rejects.toThrow(BadRequestException);
    });
  });

  describe('снятие и удаление', () => {
    it('снять можно только запланированный', async () => {
      ctx.fake.queue([{ id: POST, clientId: CLIENT, status: 'draft' }]);
      await expect(ctx.service.unschedule(CLIENT, POST)).rejects.toThrow(BadRequestException);
    });

    it('пост в процессе публикации не удаляется', async () => {
      ctx.fake.queue([{ id: POST, clientId: CLIENT, status: 'publishing' }]);
      await expect(ctx.service.remove(CLIENT, POST)).rejects.toThrow(BadRequestException);
    });

    it('удаление поста убирает и файлы с диска', async () => {
      ctx.fake.queue(
        [{ id: POST, clientId: CLIENT, status: 'draft' }],
        [{ storagePath: `${CLIENT}/${FILE}.jpg` }],
      );
      await ctx.service.remove(CLIENT, POST);
      // База сама файлы не подчистит: каскад удаляет строки, но не байты.
      expect(ctx.storage.remove).toHaveBeenCalledWith(`${CLIENT}/${FILE}.jpg`);
    });
  });
});
