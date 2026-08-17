import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CabinetService } from './cabinet.service.js';

function clientIdOf(auth: AuthContext): string {
  if (!auth.clientId) {
    throw new BadRequestException('этот аккаунт не привязан к проекту (владелец платформы)');
  }
  return auth.clientId;
}

interface ConnectBotDto {
  token: string;
}
interface CreatePlanDto {
  name: string;
  price: number;
  currency?: string;
  starsPrice?: number;
  periodDays: number;
  trialDays?: number;
  graceDays?: number;
  channelIds?: string[];
}
interface RefundDto {
  amount?: number;
  reason?: string;
}
interface SetPaymentDto {
  credentials?: Record<string, unknown> | null;
  isActive?: boolean;
}

@Controller('v1/cabinet')
@UseGuards(JwtAuthGuard)
export class CabinetController {
  constructor(private readonly cabinet: CabinetService) {}

  @Get('overview')
  overview(@Auth() auth: AuthContext) {
    return this.cabinet.overview(clientIdOf(auth));
  }

  @Get('bots')
  listBots(@Auth() auth: AuthContext) {
    return this.cabinet.listBots(clientIdOf(auth));
  }

  @Post('bots')
  connectBot(@Auth() auth: AuthContext, @Body() dto: ConnectBotDto) {
    if (!dto?.token) throw new BadRequestException('токен обязателен');
    return this.cabinet.connectBot(clientIdOf(auth), dto.token);
  }

  @Get('channels')
  listChannels(@Auth() auth: AuthContext) {
    return this.cabinet.listChannels(clientIdOf(auth));
  }

  @Post('channels/:id/invite-link')
  inviteLink(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: { planId?: string },
  ) {
    return this.cabinet.createInviteLink(clientIdOf(auth), id, dto?.planId);
  }

  @Get('subscribers')
  listSubscribers(@Auth() auth: AuthContext) {
    return this.cabinet.listSubscribers(clientIdOf(auth));
  }

  @Get('transactions')
  listTransactions(@Auth() auth: AuthContext) {
    return this.cabinet.listPaymentTransactions(clientIdOf(auth));
  }

  @Post('transactions/:paymentId/refund')
  refund(
    @Auth() auth: AuthContext,
    @Param('paymentId') paymentId: string,
    @Body() dto: RefundDto,
  ) {
    return this.cabinet.refundPayment(clientIdOf(auth), paymentId, dto?.amount, dto?.reason);
  }

  @Get('payment-accounts')
  listPaymentAccounts(@Auth() auth: AuthContext) {
    return this.cabinet.listPaymentAccounts(clientIdOf(auth));
  }

  @Post('payment-accounts')
  addPaymentAccount(@Auth() auth: AuthContext, @Body() dto: Record<string, unknown>) {
    return this.cabinet.addPaymentAccount(clientIdOf(auth), dto ?? {});
  }

  @Delete('payment-accounts/:id')
  deactivatePaymentAccount(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.cabinet.deactivatePaymentAccount(clientIdOf(auth), id);
  }

  @Get('plans')
  listPlans(@Auth() auth: AuthContext) {
    return this.cabinet.listPlans(clientIdOf(auth));
  }

  @Post('plans')
  createPlan(@Auth() auth: AuthContext, @Body() dto: CreatePlanDto) {
    if (!dto?.name || dto.price == null || dto.periodDays == null) {
      throw new BadRequestException('нужны name, price, periodDays');
    }
    return this.cabinet.createPlan(clientIdOf(auth), dto);
  }

  @Delete('plans/:id')
  deletePlan(@Auth() auth: AuthContext, @Param('id') id: string) {
    return this.cabinet.deletePlan(clientIdOf(auth), id);
  }

  @Get('payments')
  listPayments(@Auth() auth: AuthContext) {
    return this.cabinet.listPayments(clientIdOf(auth));
  }

  @Put('payments/:provider')
  setPayment(
    @Auth() auth: AuthContext,
    @Param('provider') provider: string,
    @Body() dto: SetPaymentDto,
  ) {
    return this.cabinet.setPayment(
      clientIdOf(auth),
      provider,
      dto?.credentials ?? null,
      dto?.isActive ?? true,
    );
  }

  // ─── Биллинг клиента ──────────────────────────────────────────────────────

  @Get('billing')
  billing(@Auth() auth: AuthContext) {
    return this.cabinet.myBilling(clientIdOf(auth));
  }

  @Get('billing/plans')
  billingPlans(@Auth() auth: AuthContext) {
    clientIdOf(auth);
    return this.cabinet.availablePlatformPlans();
  }

  @Put('billing/plan')
  changePlan(@Auth() auth: AuthContext, @Body() dto: { code: string }) {
    if (!dto?.code) throw new BadRequestException('нужен code тарифа');
    return this.cabinet.changePlan(clientIdOf(auth), dto.code);
  }
}
