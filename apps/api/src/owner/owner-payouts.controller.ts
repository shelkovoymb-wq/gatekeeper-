import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { Auth, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthContext } from '../auth/auth.types.js';
import { OwnerPayoutsService } from './owner-payouts.service.js';

function requireOwner(auth: AuthContext): void {
  if (auth.role !== 'owner') {
    throw new BadRequestException('Only platform owner can access this');
  }
}

@Controller('owner')
@UseGuards(JwtAuthGuard)
export class OwnerPayoutsController {
  constructor(private readonly payouts: OwnerPayoutsService) {}

  // ─── ПЛАТЕЖНЫЕ СЧЕТА ─────────────────────────────────────────────────────

  @Post('payment-accounts')
  async addPaymentAccount(
    @Auth() auth: AuthContext,
    @Body()
    input: {
      accountType: string;
      provider?: string;
      bankName?: string;
      accountNumber?: string;
      bic?: string;
      inn?: string;
      phoneSbp?: string;
      paypalEmail?: string;
      cryptoAddress?: string;
      cryptoType?: string;
      cardLast4?: string;
      cardHolder?: string;
    },
  ) {
    requireOwner(auth);
    return this.payouts.addPaymentAccount(input);
  }

  @Get('payment-accounts')
  async listPaymentAccounts(@Auth() auth: AuthContext) {
    requireOwner(auth);
    return this.payouts.listPaymentAccounts();
  }

  @Get('payment-accounts/:id')
  async getPaymentAccount(@Auth() auth: AuthContext, @Param('id') accountId: string) {
    requireOwner(auth);
    return this.payouts.getPaymentAccount(accountId);
  }

  @Post('payment-accounts/:id/verify')
  @HttpCode(200)
  async verifyAccount(@Auth() auth: AuthContext, @Param('id') accountId: string) {
    requireOwner(auth);
    return this.payouts.verifyAccount(accountId);
  }

  @Delete('payment-accounts/:id')
  async deactivateAccount(@Auth() auth: AuthContext, @Param('id') accountId: string) {
    requireOwner(auth);
    return this.payouts.deactivateAccount(accountId);
  }

  // ─── ВЫПЛАТЫ ─────────────────────────────────────────────────────────────

  @Post('payouts')
  async createPayout(
    @Auth() auth: AuthContext,
    @Body() input: { accountId: string; invoiceIds: string[]; amount: number },
  ) {
    requireOwner(auth);
    return this.payouts.createPayout(input.accountId, input.invoiceIds, input.amount);
  }

  @Get('payouts')
  async listPayouts(
    @Auth() auth: AuthContext,
  ) {
    requireOwner(auth);
    return this.payouts.listPayouts();
  }

  @Get('payouts/:id')
  async getPayout(@Auth() auth: AuthContext, @Param('id') payoutId: string) {
    requireOwner(auth);
    return this.payouts.getPayout(payoutId);
  }

  @Get('payouts-stats')
  async getPayoutStats(@Auth() auth: AuthContext) {
    requireOwner(auth);
    return this.payouts.getPayoutStats();
  }
}
