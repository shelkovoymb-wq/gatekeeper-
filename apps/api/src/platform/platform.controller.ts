import {
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

  // ─── Биллинг ──────────────────────────────────────────────────────────────

  @Get('billing-summary')
  billingSummary(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.platform.billingSummary();
  }

  @Get('invoices')
  invoices(@Auth() auth: AuthContext, @Query('status') status?: string) {
    assertOwner(auth);
    return this.platform.listInvoices(status);
  }

  @Post('invoices/generate')
  generate(@Auth() auth: AuthContext, @Body() dto: { start?: string; end?: string }) {
    assertOwner(auth);
    return this.platform.generateInvoices(dto ?? {});
  }

  @Post('invoices/:id/paid')
  markPaid(@Auth() auth: AuthContext, @Param('id') id: string) {
    assertOwner(auth);
    return this.platform.markInvoicePaid(id);
  }

  @Post('invoices/:id/void')
  voidInvoice(@Auth() auth: AuthContext, @Param('id') id: string) {
    assertOwner(auth);
    return this.platform.voidInvoice(id);
  }
}
