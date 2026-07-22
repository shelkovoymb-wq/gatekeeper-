import { Inject, Injectable, Logger } from '@nestjs/common';
import { Bot } from 'grammy';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { SecretBox } from '../common/crypto.js';
import { bots } from '../db/schema.js';

/**
 * Реестр ботов: по botId (UUID из БД) отдаёт инициализированный grammY Bot и
 * webhook-secret. Токены расшифровываются лениво и кешируются в памяти процесса.
 * Один бэкенд обслуживает все боты всех клиентов.
 */
@Injectable()
export class BotRegistry {
  private readonly logger = new Logger(BotRegistry.name);
  private readonly box: SecretBox;
  private readonly cache = new Map<string, { bot: Bot; secret: string }>();

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.box = new SecretBox(env.SECRET_ENCRYPTION_KEY);
  }

  async get(botId: string): Promise<{ bot: Bot; secret: string } | null> {
    const cached = this.cache.get(botId);
    if (cached) return cached;

    const [row] = await this.db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!row || row.status === 'disabled') return null;

    let token: string;
    try {
      token = this.box.decrypt(row.tokenEnc);
    } catch (e) {
      this.logger.error(`Failed to decrypt token for bot ${botId}`);
      return null;
    }

    const bot = new Bot(token);
    const entry = { bot, secret: row.webhookSecret };
    this.cache.set(botId, entry);
    return entry;
  }

  invalidate(botId: string) {
    this.cache.delete(botId);
  }
}
