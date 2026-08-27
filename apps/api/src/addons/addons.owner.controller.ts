import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AddonsService } from './addons.service.js';

/**
 * Платные опции глазами владельца платформы: цена, кому подключено, журнал
 * событий шлюза. Префикс v1/platform — как у остального владельческого,
 * ходит через BFF Next.js (наружу проброшены только вебхуки и /healthz).
 */
function assertOwner(auth: AuthContext): void {
  if (auth.role !== 'owner' || auth.clientId) {
    throw new ForbiddenException('доступ только для владельца платформы');
  }
}

@Controller('v1/platform/addons')
@UseGuards(JwtAuthGuard)
export class AddonsOwnerController {
  constructor(private readonly addons: AddonsService) {}

  @Get()
  catalogue(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.addons.catalogue();
  }

  @Get('subscriptions')
  subscriptions(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.addons.listSubscriptions();
  }

  /** Журнал событий шлюза — им разбирается жалоба «я оплатил, доступа нет». */
  @Get('events')
  events(@Auth() auth: AuthContext, @Query('limit') limit = '100') {
    assertOwner(auth);
    return this.addons.recentEvents(Math.min(Number(limit) || 100, 500));
  }

  @Put(':code')
  configure(
    @Auth() auth: AuthContext,
    @Param('code') code: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      priceMonth?: number;
      currency?: string;
      periodDays?: number;
      paymentUrl?: string | null;
      isActive?: boolean;
    },
  ) {
    assertOwner(auth);
    return this.addons.configure(code, body ?? {});
  }

  /** Выдать бесплатно: подарок, бартер, свои. */
  @Post(':code/grant')
  grant(@Auth() auth: AuthContext, @Param('code') code: string, @Body() body: { clientId: string }) {
    assertOwner(auth);
    return this.addons.grantFree(body.clientId, code);
  }

  @Post(':code/revoke')
  revoke(
    @Auth() auth: AuthContext,
    @Param('code') code: string,
    @Body() body: { clientId: string },
  ) {
    assertOwner(auth);
    return this.addons.revoke(body.clientId, code);
  }
}
