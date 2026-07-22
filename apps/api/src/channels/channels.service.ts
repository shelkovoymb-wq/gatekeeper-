import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ChatMemberUpdated } from 'grammy/types';
import { DB, type Database } from '../db/db.module.js';
import { bots, channels, inviteLinks } from '../db/schema.js';
import { TelegramService } from '../telegram/telegram.service.js';

/** Права, при которых бот может выдавать/отзывать доступ. */
function hasRequiredRights(u: ChatMemberUpdated): boolean {
  const m = u.new_chat_member;
  if (m.status !== 'administrator') return false;
  // can_invite_users нужен для approve join request; can_restrict_members — для kick.
  return Boolean(m.can_invite_users) && Boolean(m.can_restrict_members);
}

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tg: TelegramService,
  ) {}

  /**
   * Реакция на my_chat_member: бота добавили/сняли/поменяли права в канале.
   * Создаёт/обновляет строку channels с актуальным bot_status.
   */
  async onBotStatusChange(botId: string, u: ChatMemberUpdated): Promise<void> {
    const chat = u.chat as { id: number; type: string; title?: string };
    if (chat.type !== 'channel' && chat.type !== 'supergroup' && chat.type !== 'group') {
      return;
    }

    const [bot] = await this.db
      .select({ clientId: bots.clientId })
      .from(bots)
      .where(eq(bots.id, botId))
      .limit(1);
    if (!bot) return;

    const status = u.new_chat_member.status;
    const removed = status === 'left' || status === 'kicked';
    const botStatus = removed ? 'removed' : hasRequiredRights(u) ? 'ok' : 'no_rights';
    const title = chat.title ?? String(chat.id);
    const type = chat.type === 'channel' ? 'channel' : 'group';

    const [existing] = await this.db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.botId, botId), eq(channels.tgChatId, chat.id)))
      .limit(1);

    if (existing) {
      await this.db
        .update(channels)
        .set({ title, botStatus })
        .where(eq(channels.id, existing.id));
    } else if (!removed) {
      await this.db.insert(channels).values({
        clientId: bot.clientId,
        botId,
        tgChatId: chat.id,
        title,
        type,
        botStatus,
      });
    }

    this.logger.log(
      `channel ${chat.id} ("${title}") bot=${botId} status=${botStatus}`,
    );
  }

  async listByBot(botId: string) {
    return this.db.select().from(channels).where(eq(channels.botId, botId));
  }

  /** Создаёт join-request invite-ссылку для канала (для вставки в посты клиента). */
  async createInviteLink(channelId: string, planId?: string): Promise<string> {
    const [ch] = await this.db
      .select()
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1);
    if (!ch) throw new NotFoundException('channel not found');
    if (ch.botStatus !== 'ok') {
      throw new NotFoundException(`bot has no rights in channel (${ch.botStatus})`);
    }

    const url = await this.tg.createJoinRequestLink(
      ch.botId,
      Number(ch.tgChatId),
      planId ? `plan:${planId}` : `ch:${channelId.slice(0, 8)}`,
    );

    await this.db.insert(inviteLinks).values({
      channelId,
      planId: planId ?? null,
      url,
      kind: 'join_request',
    });
    return url;
  }
}
