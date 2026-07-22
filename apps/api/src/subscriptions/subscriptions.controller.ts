import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { SubscribersService } from '../subscribers/subscribers.service.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Controller('v1/subscriptions')
@UseGuards(ServiceTokenGuard)
export class SubscriptionsController {
  constructor(
    private readonly subs: SubscriptionsService,
    private readonly subscribers: SubscribersService,
  ) {}

  /**
   * Ручная выдача подписки (тест/поддержка). Принимает tgUserId ИЛИ subscriberId.
   * body: { tgUserId?, subscriberId?, planId, isGift? }
   */
  @Post('grant')
  async grant(
    @Body()
    dto: {
      tgUserId?: number;
      username?: string;
      subscriberId?: string;
      planId: string;
      isGift?: boolean;
    },
  ) {
    let subscriberId = dto.subscriberId;
    if (!subscriberId && dto.tgUserId) {
      const s = await this.subscribers.upsert({
        tgUserId: dto.tgUserId,
        username: dto.username,
      });
      subscriberId = s.id;
    }
    if (!subscriberId) {
      return { error: 'tgUserId or subscriberId required' };
    }
    return this.subs.grant({
      subscriberId,
      planId: dto.planId,
      isGift: dto.isGift,
      actor: 'owner',
    });
  }
}
