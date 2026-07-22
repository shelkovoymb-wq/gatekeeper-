import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { ChatJoinRequest, ChatMemberUpdated } from 'grammy/types';
import { DB, type Database } from '../db/db.module.js';
import { channels, channelMembers } from '../db/schema.js';
import { TelegramService } from '../telegram/telegram.service.js';
import { SubscribersService } from '../subscribers/subscribers.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';

/**
 * Ядро контроля доступа: решает, впускать ли пользователя в канал, и отзывает
 * доступ у неоплативших. Работает по join requests — утечка invite-ссылки
 * безвредна, т.к. approve выдаётся только при активной подписке.
 */
@Injectable()
export class AccessService {
  private readonly logger = new Logger(AccessService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tg: TelegramService,
    private readonly subscribers: SubscribersService,
    private readonly subs: SubscriptionsService,
  ) {}

  private async findChannel(botId: string, tgChatId: number) {
    const [ch] = await this.db
      .select()
      .from(channels)
      .where(and(eq(channels.botId, botId), eq(channels.tgChatId, tgChatId)))
      .limit(1);
    return ch ?? null;
  }

  /** Обработка chat_join_request: approve при активной подписке, иначе decline + ЛС. */
  async onJoinRequest(botId: string, req: ChatJoinRequest): Promise<void> {
    const ch = await this.findChannel(botId, req.chat.id);
    if (!ch) {
      this.logger.warn(`join request to unknown channel ${req.chat.id} (bot ${botId})`);
      return;
    }

    const subscriber = await this.subscribers.upsert({
      tgUserId: req.from.id,
      username: req.from.username,
      firstName: req.from.first_name,
      language: req.from.language_code,
    });

    const access = await this.subs.findAccessForChannel(subscriber.id, ch.id);

    if (access) {
      await this.tg.approveJoinRequest(botId, req.chat.id, req.from.id);
      await this.recordMember(ch.id, subscriber.id, 'member');
      await this.subs.logEvent(access.subscriptionId, 'approved', 'system', {
        channelId: ch.id,
      });
      this.logger.log(`APPROVED user ${req.from.id} → channel ${ch.id}`);
    } else {
      await this.tg.declineJoinRequest(botId, req.chat.id, req.from.id);
      // join request даёт боту право написать пользователю первым — зовём к оплате.
      await this.tg.sendMessage(
        botId,
        req.from.id,
        `Чтобы попасть в «${ch.title}», нужна активная подписка. Оформите её командой /start.`,
      );
      this.logger.log(`DECLINED user ${req.from.id} → channel ${ch.id} (no active sub)`);
    }
  }

  /**
   * Обработка chat_member: фиксируем фактические входы/выходы.
   * Ловим «зайцев» — вход без активной подписки (например, админ добавил вручную).
   */
  async onMemberChange(botId: string, u: ChatMemberUpdated): Promise<void> {
    const ch = await this.findChannel(botId, u.chat.id);
    if (!ch) return;

    const status = u.new_chat_member.status;
    const user = u.new_chat_member.user;
    if (user.is_bot) return;

    const joined = status === 'member' || status === 'administrator' || status === 'creator';
    const left = status === 'left' || status === 'kicked';

    const subscriber = await this.subscribers.upsert({
      tgUserId: user.id,
      username: user.username,
      firstName: user.first_name,
    });

    if (joined) {
      const access = await this.subs.findAccessForChannel(subscriber.id, ch.id);
      await this.recordMember(ch.id, subscriber.id, access ? 'member' : 'unauthorized');
      if (!access) {
        this.logger.warn(
          `UNAUTHORIZED join: user ${user.id} in channel ${ch.id} without active sub`,
        );
        // TODO(phase1+): по политике клиента — авто-кик или пометка для ревью.
      }
    } else if (left) {
      await this.recordMember(ch.id, subscriber.id, status === 'kicked' ? 'kicked' : 'left');
    }
  }

  /**
   * Отзыв доступа: кикаем из каждого канала, где подписчик сейчас `member`,
   * но подходящей активной подписки (trial/active/grace) уже нет. Идемпотентно.
   */
  async revokeAllForSubscriber(subscriberId: string, tgUserId: number): Promise<void> {
    const members = await this.db
      .select({ channelId: channelMembers.channelId })
      .from(channelMembers)
      .where(
        and(
          eq(channelMembers.subscriberId, subscriberId),
          eq(channelMembers.status, 'member'),
        ),
      );

    for (const m of members) {
      // Если хоть одна активная подписка ещё открывает этот канал — не трогаем.
      const stillAllowed = await this.subs.findAccessForChannel(subscriberId, m.channelId);
      if (stillAllowed) continue;

      const [ch] = await this.db
        .select()
        .from(channels)
        .where(eq(channels.id, m.channelId))
        .limit(1);
      if (!ch || ch.kickPolicy !== 'kick' || ch.botStatus !== 'ok') continue;
      try {
        await this.tg.kick(ch.botId, Number(ch.tgChatId), tgUserId);
        await this.recordMember(ch.id, subscriberId, 'kicked');
        this.logger.log(`KICKED user ${tgUserId} from channel ${ch.id}`);
      } catch (e) {
        this.logger.error(`kick failed user ${tgUserId} ch ${ch.id}: ${String(e)}`);
      }
    }
  }

  private async recordMember(
    channelId: string,
    subscriberId: string,
    status: string,
  ): Promise<void> {
    const now = new Date();
    const joined = status === 'member';
    await this.db
      .insert(channelMembers)
      .values({
        channelId,
        subscriberId,
        status,
        joinedAt: joined ? now : null,
        leftAt: joined ? null : now,
      })
      .onConflictDoUpdate({
        target: [channelMembers.channelId, channelMembers.subscriberId],
        set: {
          status,
          ...(joined ? { joinedAt: now, leftAt: null } : { leftAt: now }),
        },
      });
  }
}
