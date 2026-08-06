import {
  Controller,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Update } from 'grammy/types';
import { BotRegistry } from './bot-registry.js';
import { TelegramUpdateHandler } from './update-handler.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Единая точка входа для webhook'ов всех ботов: /tg/webhook/:botId.
 * Проверяем секрет из заголовка X-Telegram-Bot-Api-Secret-Token, затем
 * передаём update в обработчик. Бизнес-логики здесь нет.
 */
@Controller('tg/webhook')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly registry: BotRegistry,
    private readonly handler: TelegramUpdateHandler,
  ) {}

  @Post(':botId')
  @HttpCode(200)
  async webhook(
    @Param('botId') botId: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Update,
  ) {
    const entry = await this.registry.get(botId);
    if (!entry) throw new NotFoundException('unknown bot');
    if (!secret || !safeEqual(secret, entry.secret)) {
      throw new ForbiddenException('bad webhook secret');
    }

    try {
      await this.handler.handle(botId, update);
    } catch (e) {
      // Никогда не отдаём Telegram не-200: иначе он будет ретраить и копить лаг.
      this.logger.error(`update handling failed for bot ${botId}: ${String(e)}`);
    }
    return { ok: true };
  }
}
