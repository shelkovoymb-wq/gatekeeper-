import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import {
  OwnerPayoutsService,
  type CreatePaymentAccountInput,
} from './owner-payouts.service.js';

/**
 * Реквизиты владельца платформы и выплаты на них.
 *
 * Префикс — v1/platform, как у остальных владельческих эндпоинтов: наружу через
 * nginx проброшены только /healthz, /tg/ и /payments/webhook/, а всё владельческое
 * ходит через BFF Next.js по внутренней сети (см. deploy/pve3/gatekeeper-proxy).
 * Собственный префикс вроде /owner был бы недостижим из браузера.
 */
function assertOwner(auth: AuthContext): void {
  if (auth.role !== 'owner' || auth.clientId) {
    throw new ForbiddenException('доступ только для владельца платформы');
  }
}

@Controller('v1/platform')
@UseGuards(JwtAuthGuard)
export class OwnerPayoutsController {
  constructor(private readonly payouts: OwnerPayoutsService) {}

  // ─── Платёжные счета ──────────────────────────────────────────────────────

  @Post('payment-accounts')
  addPaymentAccount(@Auth() auth: AuthContext, @Body() input: CreatePaymentAccountInput) {
    assertOwner(auth);
    return this.payouts.addPaymentAccount(input);
  }

  @Get('payment-accounts')
  listPaymentAccounts(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.payouts.listPaymentAccounts();
  }

  @Get('payment-accounts/:id')
  getPaymentAccount(@Auth() auth: AuthContext, @Param('id') accountId: string) {
    assertOwner(auth);
    return this.payouts.getPaymentAccount(accountId);
  }

  @Post('payment-accounts/:id/verify')
  @HttpCode(200)
  verifyAccount(@Auth() auth: AuthContext, @Param('id') accountId: string) {
    assertOwner(auth);
    return this.payouts.verifyAccount(accountId);
  }

  @Delete('payment-accounts/:id')
  deactivateAccount(@Auth() auth: AuthContext, @Param('id') accountId: string) {
    assertOwner(auth);
    return this.payouts.deactivateAccount(accountId);
  }

  // ─── Выплаты ──────────────────────────────────────────────────────────────

  @Post('payouts')
  createPayout(
    @Auth() auth: AuthContext,
    @Body() input: { accountId: string; invoiceIds: string[]; amount: number },
  ) {
    assertOwner(auth);
    return this.payouts.createPayout(input.accountId, input.invoiceIds, input.amount);
  }

  @Get('payouts-stats')
  getPayoutStats(@Auth() auth: AuthContext) {
    assertOwner(auth);
    return this.payouts.getPayoutStats();
  }

  @Get('payouts')
  listPayouts(@Auth() auth: AuthContext, @Query('status') status?: string) {
    assertOwner(auth);
    return this.payouts.listPayouts(status);
  }

  @Get('payouts/:id')
  getPayout(@Auth() auth: AuthContext, @Param('id') payoutId: string) {
    assertOwner(auth);
    return this.payouts.getPayout(payoutId);
  }
}
