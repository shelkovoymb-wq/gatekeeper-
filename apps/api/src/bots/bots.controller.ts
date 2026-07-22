import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { BotsService } from './bots.service.js';

interface RegisterBotDto {
  token: string;
  clientId?: string;
  isPlatformBot?: boolean;
}

@Controller('v1/bots')
@UseGuards(ServiceTokenGuard)
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Post()
  async register(@Body() dto: RegisterBotDto) {
    return this.bots.register({
      token: dto.token,
      clientId: dto.clientId,
      isPlatformBot: dto.isPlatformBot,
    });
  }
}
