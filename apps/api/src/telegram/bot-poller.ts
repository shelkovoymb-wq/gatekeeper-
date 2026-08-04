import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { bots } from '../db/schema.js';
import { BotRegistry } from './bot-registry.js';
import { TelegramUpdateHandler } from './update-handler.js';

const ALLOWED_UPDATES = [
  'message',
  'callback_query',
  'chat_join_request',
  'chat_member',
  'my_chat_member',
  'pre_checkout_query',
] as const;

/**
 * Приём апдейтов через long polling вместо webhook.
 *
 * Причина: входящие HTTPS-соединения от Telegram к нашему публичному адресу
 * блокируются на уровне сети/провайдера (подтверждено: исходящие к Telegram
 * работают, webhook ни разу не долетел до приложения). Long polling требует
 * только исходящих соединений, которые у нас есть — поэтому решает проблему
 * полностью, без входящего трафика вообще.
 *
 * На старте поднимает поллинг для всех активных ботов; BotsService вызывает
 * start() сразу после регистрации нового бота, чтобы не ждать рестарта.
 */
@Injectable()
export class BotPoller implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(BotPoller.name);
  private readonly running = new Set<string>();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly registry: BotRegistry,
    private readonly handler: TelegramUpdateHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const rows = await this.db
      .select({ id: bots.id })
      .from(bots)
      .where(eq(bots.status, 'active'));
    for (const r of rows) {
      void this.start(r.id);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.running].map((botId) => this.stop(botId)));
  }

  async start(botId: string): Promise<void> {
    if (this.running.has(botId)) return;
    const entry = await this.registry.get(botId);
    if (!entry) {
      this.logger.warn(`poller: bot ${botId} not found/disabled`);
      return;
    }
    const { bot } = entry;

    bot.catch((err) => {
      this.logger.error(`poll error bot=${botId}: ${String(err)}`);
    });
    bot.use(async (ctx) => {
      try {
        await this.handler.handle(botId, ctx.update);
      } catch (e) {
        this.logger.error(`update handling failed bot=${botId}: ${String(e)}`);
      }
    });

    try {
      await bot.api.deleteWebhook({ drop_pending_updates: false });
    } catch (e) {
      this.logger.warn(`deleteWebhook failed bot=${botId}: ${String(e)}`);
    }

    this.running.add(botId);
    this.logger.log(`long-polling started for bot ${botId}`);
    bot
      .start({ allowed_updates: [...ALLOWED_UPDATES] })
      .catch((e) => {
        this.logger.error(`polling loop crashed bot=${botId}: ${String(e)}`);
      })
      .finally(() => {
        this.running.delete(botId);
      });
  }

  async stop(botId: string): Promise<void> {
    const entry = await this.registry.get(botId);
    if (!entry) return;
    await entry.bot.stop().catch(() => {});
    this.running.delete(botId);
  }
}
