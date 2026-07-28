import { Injectable, Logger } from '@nestjs/common';
import type { Update } from 'grammy/types';
import { AccessService } from '../access/access.service.js';
import { ChannelsService } from '../channels/channels.service.js';
import { StorefrontService } from '../storefront/storefront.service.js';

/**
 * Роутер входящих Telegram-обновлений в доменные модули.
 *
 * Доступ: join-request flow, учёт участников/статуса бота.
 * Продажи: /start (витрина), callback_query (выбор/оплата), pre_checkout_query,
 * successful_payment (Telegram Stars) → выдача подписки и доступа.
 */
@Injectable()
export class TelegramUpdateHandler {
  private readonly logger = new Logger(TelegramUpdateHandler.name);

  constructor(
    private readonly access: AccessService,
    private readonly channels: ChannelsService,
    private readonly storefront: StorefrontService,
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
    if (update.pre_checkout_query) {
      await this.storefront.onPreCheckout(botId, update.pre_checkout_query);
      return;
    }
    if (update.callback_query) {
      await this.storefront.onCallback(botId, update.callback_query);
      return;
    }
    if (update.message) {
      const msg = update.message;
      if (msg.successful_payment) {
        await this.storefront.onSuccessfulPayment(botId, msg);
        return;
      }
      if (typeof msg.text === 'string' && msg.text.startsWith('/start')) {
        await this.storefront.onStart(botId, msg);
        return;
      }
      this.logger.debug(`bot=${botId} message update ${update.update_id} (ignored)`);
      return;
    }
  }
}
