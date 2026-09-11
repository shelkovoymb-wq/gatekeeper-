import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { DirectMembersService } from './direct-members.service.js';

function clientIdOf(auth: AuthContext): string {
  if (!auth.clientId) {
    throw new BadRequestException('этот аккаунт не привязан к проекту (владелец платформы)');
  }
  return auth.clientId;
}

interface DeclareDto {
  planId?: string | null;
  amount?: number | null;
  note?: string | null;
}

/** Участники, которых клиент завёл в канал сам. Кабинет клиента. */
@Controller('v1/cabinet/direct-members')
@UseGuards(JwtAuthGuard)
export class DirectMembersController {
  constructor(private readonly direct: DirectMembersService) {}

  @Get()
  list(@Auth() auth: AuthContext) {
    return this.direct.list(clientIdOf(auth));
  }

  @Post(':id/declare')
  declare(@Auth() auth: AuthContext, @Param('id') id: string, @Body() dto: DeclareDto) {
    return this.direct.declare(clientIdOf(auth), id, dto ?? {});
  }

  @Post(':id/dismiss')
  dismiss(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: { reason?: string },
  ) {
    return this.direct.dismiss(clientIdOf(auth), id, dto?.reason ?? '');
  }
}

/** То же глазами владельца платформы: контроль по всем клиентам. */
@Controller('v1/platform/direct-members')
@UseGuards(JwtAuthGuard)
export class DirectMembersOwnerController {
  constructor(private readonly direct: DirectMembersService) {}

  @Get()
  listAll(@Auth() auth: AuthContext, @Query('limit') limit = '200') {
    if (auth.role !== 'owner' || auth.clientId) {
      throw new ForbiddenException('доступ только для владельца платформы');
    }
    return this.direct.listAll(Math.min(Number(limit) || 200, 500));
  }
}
