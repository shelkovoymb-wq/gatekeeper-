import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { AdminService } from './admin.service.js';

/**
 * Read-only админ-API поверх реальных данных. Защищён сервисным токеном;
 * вызывается сервер-сайд из BFF-роутов Next.js (apps/web), не из браузера.
 */
@Controller('v1/admin')
@UseGuards(ServiceTokenGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.getStats();
  }

  @Get('channels')
  channels() {
    return this.admin.listChannels();
  }

  @Get('subscribers')
  subscribers() {
    return this.admin.listSubscribers();
  }

  @Get('payments')
  payments(@Query('limit') limit = '100') {
    return this.admin.listPayments(parseInt(limit, 10));
  }
}
