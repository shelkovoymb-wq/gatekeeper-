import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeDb } from '../owner/fake-db.js';
import { PostPublisher } from './post-publisher.js';
import type { MediaStorage } from './media-storage.js';
import type { TelegramService } from '../telegram/telegram.service.js';

const POST = '44444444-4444-4444-4444-444444444444';
const CLIENT = '11111111-1111-1111-1111-111111111111';
const FILE = '55555555-5555-5555-5555-555555555555';

function build() {
  const { db, fake } = createFakeDb();
  const telegram = {
    sendPost: vi.fn().mockResolvedValue({ messageId: 500, fileIds: [] }),
  } as unknown as TelegramService;
  const storage = {
    remove: vi.fn().mockResolvedValue(undefined),
    absolute: (p: string) => `/data/uploads/${p}`,
  } as unknown as MediaStorage;
  const publisher = new PostPublisher(db, telegram, storage);
  return { publisher, fake, telegram, storage };
}

const draft = {
  id: POST,
  clientId: CLIENT,
  bodyHtml: 'текст',
  status: 'scheduled',
  disablePreview: false,
};

describe('PostPublisher', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it('исчезнувший пост не роняет задачу', async () => {
    ctx.fake.queue([]);
    await expect(ctx.publisher.publish(POST)).resolves.toBeUndefined();
    expect(ctx.telegram.sendPost).not.toHaveBeenCalled();
  });

  it('уже опубликованный пост второй раз не уходит', async () => {
    // Главная защита от дублей: BullMQ повторяет задачу при сбое воркера.
    ctx.fake.queue([{ ...draft, status: 'published' }]);
    await ctx.publisher.publish(POST);
    expect(ctx.telegram.sendPost).not.toHaveBeenCalled();
  });

  it('цель с message_id пропускается на повторе', async () => {
    // Выборка целей идёт с условием message_id IS NULL, поэтому на повторе
    // отправлять уже нечего.
    // Порядок результатов: пост → апдейт в publishing → вложения → цели.
    ctx.fake.queue([draft], [], [], []);
    await ctx.publisher.publish(POST);
    expect(ctx.telegram.sendPost).not.toHaveBeenCalled();
    const set = ctx.fake.calls.filter((c) => c.method === 'set').pop()?.args[0] as Record<
      string,
      unknown
    >;
    expect(set.status).toBe('published');
  });

  it('успешная отправка записывает message_id', async () => {
    ctx.fake.queue([draft], [], [], [{ targetId: 't1', chatId: -100, botId: 'b1', title: 'Канал' }]);
    await ctx.publisher.publish(POST);

    const sets = ctx.fake.calls.filter((c) => c.method === 'set').map((c) => c.args[0] as Record<string, unknown>);
    expect(sets.some((s) => s.messageId === 500)).toBe(true);
    expect(sets.at(-1)?.status).toBe('published');
  });

  it('ошибка канала помечает пост как failed и бросается наверх для повтора', async () => {
    (ctx.telegram.sendPost as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('bot was kicked'),
    );
    ctx.fake.queue([draft], [], [], [{ targetId: 't1', chatId: -100, botId: 'b1', title: 'Канал' }]);

    await expect(ctx.publisher.publish(POST)).rejects.toThrow(/не доставлен/);
    const sets = ctx.fake.calls.filter((c) => c.method === 'set').map((c) => c.args[0] as Record<string, unknown>);
    expect(sets.at(-1)?.status).toBe('failed');
    expect(String(sets.at(-1)?.error)).toContain('bot was kicked');
  });

  it('упавший канал не мешает остальным', async () => {
    const send = ctx.telegram.sendPost as ReturnType<typeof vi.fn>;
    send.mockRejectedValueOnce(new Error('нет прав')).mockResolvedValueOnce({
      messageId: 501,
      fileIds: [],
    });
    ctx.fake.queue(
      [draft],
      [],
      [],
      [
        { targetId: 't1', chatId: -100, botId: 'b1', title: 'Первый' },
        { targetId: 't2', chatId: -200, botId: 'b1', title: 'Второй' },
      ],
    );

    await expect(ctx.publisher.publish(POST)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('file_id с первой отправки сохраняется, а файл с диска убирается', async () => {
    // Иначе один и тот же файл заливался бы в Telegram заново для каждого канала.
    (ctx.telegram.sendPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      messageId: 500,
      fileIds: ['AgACAgI'],
    });
    ctx.fake.queue(
      [draft],
      [],
      [{ id: 'm1', mediaType: 'photo', fileId: null, storagePath: `${CLIENT}/${FILE}.jpg`, position: 0 }],
      [{ targetId: 't1', chatId: -100, botId: 'b1', title: 'Канал' }],
    );

    await ctx.publisher.publish(POST);

    const sets = ctx.fake.calls.filter((c) => c.method === 'set').map((c) => c.args[0] as Record<string, unknown>);
    expect(sets.some((s) => s.fileId === 'AgACAgI' && s.storagePath === null)).toBe(true);
    expect(ctx.storage.remove).toHaveBeenCalledWith(`${CLIENT}/${FILE}.jpg`);
  });

  it('вложение уходит путём к файлу, пока file_id ещё нет', async () => {
    ctx.fake.queue(
      [draft],
      [],
      [{ id: 'm1', mediaType: 'photo', fileId: null, storagePath: `${CLIENT}/${FILE}.jpg`, position: 0 }],
      [{ targetId: 't1', chatId: -100, botId: 'b1', title: 'Канал' }],
    );
    await ctx.publisher.publish(POST);

    const sent = (ctx.telegram.sendPost as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(sent.media[0].path).toBe(`/data/uploads/${CLIENT}/${FILE}.jpg`);
    expect(sent.media[0].fileId).toBeNull();
  });
});
