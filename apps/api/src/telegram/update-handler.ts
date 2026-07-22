import { Injectable, Logger } from '@nestjs/common';
import type { Update } from 'grammy/types';
import { AccessService } from '../access/access.service.js';
import { ChannelsService } from '../channels/channels.service.js';

/**
 * Роутер входящих Telegram-обновлений в доменные модули.
 *
 * Фаза 1 (текущий срез): join-request flow и учёт участников/статуса бота.
 * Ещё не подключено (Фаза 1+/2): message /start (витрина, оплата), callback_query,
 * pre_checkout_query/successful_payment (Stars / TG Payments).
 */
@Injectable()
export class TelegramUpdateHandler {
  private readonly logger = new Logger(TelegramUpdateHandler.name);

  constructor(
    private readonly access: AccessService,
    private readonly channels: ChannelsService,
  ) {}

  async handle(botId: string, update: Update): Promise<void> {
    if (update.chat_join_request) {
      await this.access.onJoinRequest(botId, update.chat_join_request);
      return;
    }
    if (update.chat_member) {
      await this.access.onMemberChange(botId, update.chat_member);
      return;
    }
    if (update.my_chat_member) {
      await this.channels.onBotStatusChange(botId, update.my_chat_member);
      return;
    }
    if (update.message) {
      // TODO(phase1+): SubscriptionsModule.onMessage — /start plan_<id>, витрина, оплата
      this.logger.debug(`bot=${botId} message update ${update.update_id} (not handled yet)`);
      return;
    }
    if (update.callback_query || update.pre_checkout_query) {
      this.logger.debug(`bot=${botId} interactive update ${update.update_id} (not handled yet)`);
      return;
    }
  }
}
