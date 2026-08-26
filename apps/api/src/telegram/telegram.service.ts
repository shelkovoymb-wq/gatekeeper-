import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GrammyError } from 'grammy';
import { InputFile } from 'grammy';
import type { Message } from 'grammy/types';
import { BotRegistry } from './bot-registry.js';

/** Ограничение Telegram на подпись к вложению. У сообщения лимит 4096. */
const CAPTION_LIMIT = 1024;

/**
 * Вложение поста: либо file_id уже отправленного файла, либо путь к файлу на
 * диске — его придётся залить.
 */
export interface PostAttachment {
  mediaType: 'photo' | 'video' | 'document';
  fileId?: string | null;
  path?: string | null;
}

function attachmentSource(m: PostAttachment): string | InputFile {
  if (m.fileId) return m.fileId;
  if (!m.path) throw new Error('вложение без файла и без file_id');
  return new InputFile(m.path);
}

/** file_id из ответа Telegram: у фото берём самый крупный размер — он последний. */
function fileIdOf(msg: Message): string | null {
  if (msg.photo?.length) return msg.photo[msg.photo.length - 1].file_id;
  return msg.video?.file_id ?? msg.document?.file_id ?? null;
}

/**
 * Тонкая обёртка над grammY Bot API, работающая по botId (UUID из БД).
 * Здесь только доставка команд в Telegram; решения принимают доменные модули.
 * На Фазе 1 вызовы прямые; на Фазе 2 исходящие уйдут в очередь с rate-limit по боту.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly registry: BotRegistry) {}

  private async api(botId: string) {
    const entry = await this.registry.get(botId);
    if (!entry) throw new NotFoundException(`bot ${botId} not available`);
    return entry.bot.api;
  }

  async approveJoinRequest(botId: string, chatId: number, userId: number): Promise<void> {
    const api = await this.api(botId);
    await api.approveChatJoinRequest(chatId, userId);
  }

  async declineJoinRequest(botId: string, chatId: number, userId: number): Promise<void> {
    const api = await this.api(botId);
    try {
      await api.declineChatJoinRequest(chatId, userId);
    } catch (e) {
      // Запрос мог быть уже отозван/обработан — не критично.
      if (e instanceof GrammyError && e.error_code === 400) return;
      throw e;
    }
  }

  /** «Мягкий кик»: удалить из чата, но разрешить вернуться после оплаты. */
  async kick(botId: string, chatId: number, userId: number): Promise<void> {
    const api = await this.api(botId);
    await api.banChatMember(chatId, userId, {
      until_date: Math.floor(Date.now() / 1000) + 40,
    });
    await api.unbanChatMember(chatId, userId, { only_if_banned: true });
  }

  async createJoinRequestLink(
    botId: string,
    chatId: number,
    name: string,
  ): Promise<string> {
    const api = await this.api(botId);
    const link = await api.createChatInviteLink(chatId, {
      creates_join_request: true,
      name: name.slice(0, 32),
    });
    return link.invite_link;
  }

  async sendMessage(
    botId: string,
    chatId: number,
    text: string,
    replyMarkup?: unknown,
  ): Promise<void> {
    const api = await this.api(botId);
    try {
      await api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reply_markup: replyMarkup as any,
      });
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 403) {
        this.logger.warn(`user ${chatId} blocked bot ${botId}`);
        return;
      }
      throw e;
    }
  }

  /**
   * Публикация поста в канал.
   *
   * Возвращает message_id (без него уже отправленное сообщение для нас
   * потеряно: не отредактировать и не удалить) и file_id каждого вложения.
   * file_id появляется только после отправки, и он же избавляет от повторной
   * заливки файла во второй, третий и десятый канал.
   *
   * Подпись у вложения ограничена 1024 символами, обычное сообщение — 4096.
   * Длинный текст поэтому уходит отдельным сообщением следом за вложениями,
   * а не обрезается.
   */
  async sendPost(
    botId: string,
    chatId: number,
    post: {
      bodyHtml: string;
      disablePreview?: boolean;
      media?: PostAttachment[];
    },
  ): Promise<{ messageId: number; fileIds: (string | null)[] }> {
    const api = await this.api(botId);
    const media = post.media ?? [];
    const text = post.bodyHtml ?? '';

    if (!media.length) {
      const msg = await api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: post.disablePreview ?? false },
      });
      return { messageId: msg.message_id, fileIds: [] };
    }

    const caption = text.length > 0 && text.length <= CAPTION_LIMIT ? text : undefined;

    let messageId: number;
    let fileIds: (string | null)[];

    if (media.length === 1) {
      const opts = { caption, parse_mode: 'HTML' as const };
      const source = attachmentSource(media[0]);
      const msg =
        media[0].mediaType === 'photo'
          ? await api.sendPhoto(chatId, source, opts)
          : media[0].mediaType === 'video'
            ? await api.sendVideo(chatId, source, opts)
            : await api.sendDocument(chatId, source, opts);
      messageId = msg.message_id;
      fileIds = [fileIdOf(msg)];
    } else {
      const group = media.map((m, i) => ({
        type: m.mediaType,
        media: attachmentSource(m),
        ...(i === 0 && caption ? { caption, parse_mode: 'HTML' as const } : {}),
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgs = await api.sendMediaGroup(chatId, group as any);
      messageId = msgs[0].message_id;
      fileIds = msgs.map((m) => fileIdOf(m));
    }

    if (text && !caption) {
      await api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: post.disablePreview ?? false },
      });
    }
    return { messageId, fileIds };
  }

  /** Инвойс Telegram Stars (валюта XTR, provider_token пустой). */
  async sendStarsInvoice(
    botId: string,
    chatId: number,
    params: { title: string; description: string; payload: string; amount: number; label: string },
  ): Promise<void> {
    const api = await this.api(botId);
    await api.sendInvoice(
      chatId,
      params.title.slice(0, 32),
      params.description.slice(0, 255),
      params.payload,
      'XTR',
      [{ label: params.label.slice(0, 32), amount: params.amount }],
      // provider_token пустой для Stars
      { provider_token: '' } as never,
    );
  }

  async answerPreCheckoutQuery(botId: string, queryId: string, ok = true, error?: string): Promise<void> {
    const api = await this.api(botId);
    await api.answerPreCheckoutQuery(queryId, ok, error ? { error_message: error } : undefined);
  }

  async answerCallbackQuery(botId: string, queryId: string, text?: string): Promise<void> {
    const api = await this.api(botId);
    try {
      await api.answerCallbackQuery(queryId, text ? { text } : undefined);
    } catch {
      /* устаревший callback — не критично */
    }
  }
}
