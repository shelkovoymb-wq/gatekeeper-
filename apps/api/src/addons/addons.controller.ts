import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AddonsService } from './addons.service.js';

function clientIdOf(auth: AuthContext): string {
  if (!auth.clientId) {
    throw new BadRequestException('этот аккаунт не привязан к проекту (владелец платформы)');
  }
  return auth.clientId;
}

/** Платные опции глазами клиента: что есть, что подключено, куда платить. */
@Controller('v1/cabinet/addons')
@UseGuards(JwtAuthGuard)
export class AddonsController {
  constructor(private readonly addons: AddonsService) {}

  @Get()
  catalogue() {
    return this.addons.catalogue();
  }

  @Get(':code')
  status(@Auth() auth: AuthContext, @Param('code') code: string) {
    return this.addons.statusFor(clientIdOf(auth), code);
  }
}
