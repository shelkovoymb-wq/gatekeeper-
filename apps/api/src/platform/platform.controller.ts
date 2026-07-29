import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { PlatformService } from './platform.service.js';

/** Доступ только владельцу платформы (role=owner, без привязки к клиенту). */
function assertOwner(auth: AuthContext): void {
  if (auth.role !== 'owner' || auth.clientId) {
    throw new ForbiddenException('доступ только для владельца платформы');
  }
}

@Controller('v1/platform')
@UseGuards(JwtAuthGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  overview(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.platform.overview();
  }

  @Get('clients')
  clients(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.platform.listClients();
  }

  @Get('plans')
  plans(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.platform.listPlatformPlans();
  }
}
