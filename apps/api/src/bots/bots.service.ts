import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Bot } from 'grammy';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import { SECRET_BOX } from '../common/crypto.module.js';
import type { SecretBox } from '../common/crypto.js';
import { bots } from '../db/schema.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { BotPoller } from '../telegram/bot-poller.js';

export interface RegisterBotResult {
  botId: string;
  tgBotId: number;
  username: string;
}

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    private readonly tenants: TenantsService,
    private readonly poller: BotPoller,
  ) {}

  /**
   * Подключает бота по BotFather-токену: валидирует через getMe, шифрует токен,
   * сохраняет и запускает приём апдейтов через long polling (входящие webhook'и
   * от Telegram блокируются сетью — long polling требует только исходящих
   * соединений, см. bot-poller.ts).
   */
  async register(params: {
    token: string;
    clientId?: string;
    isPlatformBot?: boolean;
  }): Promise<RegisterBotResult> {
    const token = params.token.trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) {
      throw new BadRequestException('malformed bot token');
    }

    // 1. Валидация токена
    const probe = new Bot(token);
    let me;
    try {
      me = await probe.api.getMe();
    } catch {
      throw new BadRequestException('token rejected by Telegram (getMe failed)');
    }

    const clientId = params.clientId ?? (await this.tenants.ensureDefaultClient());
    const webhookSecret = randomBytes(24).toString('hex');
    const tokenEnc = this.box.encrypt(token);

    // 2. Upsert по tg_bot_id
    const [existing] = await this.db
      .select({ id: bots.id })
      .from(bots)
      .where(eq(bots.tgBotId, me.id))
      .limit(1);

    let botId: string;
    if (existing) {
      await this.db
        .update(bots)
        .set({
          clientId,
          username: me.username ?? '',
          tokenEnc,
          webhookSecret,
          isPlatformBot: params.isPlatformBot ?? false,
          status: 'active',
        })
        .where(eq(bots.id, existing.id));
      botId = existing.id;
    } else {
      const [created] = await this.db
        .insert(bots)
        .values({
          clientId,
          tgBotId: me.id,
          username: me.username ?? '',
          tokenEnc,
          webhookSecret,
          isPlatformBot: params.isPlatformBot ?? false,
          status: 'active',
        })
        .returning({ id: bots.id });
      botId = created.id;
    }

    // 3. Приём апдейтов — long polling (снимает вебхук, если был, и стартует цикл).
    void this.poller.start(botId);

    this.logger.log(`bot @${me.username} (${me.id}) registered as ${botId}`);
    return { botId, tgBotId: me.id, username: me.username ?? '' };
  }
}
