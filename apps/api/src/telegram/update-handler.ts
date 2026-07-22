import { Injectable, Logger } from '@nestjs/common';
import type { Update } from 'grammy/types';

/**
 * Роутер входящих Telegram-обновлений в доменные модули.
 *
 * Фаза 0: только распознаём тип апдейта и логируем. На Фазе 1 сюда подключаются:
 *   - chat_join_request  → AccessModule.onJoinRequest (approve/decline по подписке)
 *   - chat_member        → AccessModule.onMemberChange (факт входов/выходов, reconciliation)
 *   - my_chat_member     → ChannelsModule.onBotStatusChange (бота добавили/сняли админом)
 *   - message /start …   → SubscriptionsModule (deep-link plan_<id>, витрина, оплата)
 *   - callback_query     → интерактивные кнопки
 *   - pre_checkout_query / successful_payment → PaymentsModule (Stars / TG Payments)
 */
@Injectable()
export class TelegramUpdateHandler {
  private readonly logger = new Logger(TelegramUpdateHandler.name);

  async handle(botId: string, update: Update): Promise<void> {
    const kind = this.classify(update);
    this.logger.log(`bot=${botId} update=${update.update_id} kind=${kind}`);

    switch (kind) {
      case 'chat_join_request':
        // TODO(phase1): AccessModule.onJoinRequest(botId, update.chat_join_request!)
        break;
      case 'chat_member':
        // TODO(phase1): AccessModule.onMemberChange(botId, update.chat_member!)
        break;
      case 'my_chat_member':
        // TODO(phase1): ChannelsModule.onBotStatusChange(botId, update.my_chat_member!)
        break;
      case 'message':
        // TODO(phase1): SubscriptionsModule.onMessage(botId, update.message!)
        break;
      case 'callback_query':
        // TODO(phase1): callback router
        break;
      case 'pre_checkout_query':
      case 'successful_payment':
        // TODO(phase1): PaymentsModule (Stars / TG Payments)
        break;
      default:
        break;
    }
  }

  private classify(u: Update): string {
    if (u.chat_join_request) return 'chat_join_request';
    if (u.chat_member) return 'chat_member';
    if (u.my_chat_member) return 'my_chat_member';
    if (u.callback_query) return 'callback_query';
    if (u.pre_checkout_query) return 'pre_checkout_query';
    if (u.message?.successful_payment) return 'successful_payment';
    if (u.message) return 'message';
    return 'other';
  }
}
