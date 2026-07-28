import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GrammyError } from 'grammy';
import { BotRegistry } from './bot-registry.js';

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
