import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module.js';
import {
  ownerPaymentAccounts,
  ownerPayouts,
  ownerPayoutEvents,
  platformInvoices,
} from '../db/schema.js';

export interface CreatePaymentAccountInput {
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
  bankCode?: string;
  sortCode?: string;
  swiftCode?: string;
}

@Injectable()
export class OwnerPayoutsService {
  private readonly logger = new Logger(OwnerPayoutsService.name);

  constructor(@Inject(DB) private readonly db: Database) {}

  async addPaymentAccount(input: CreatePaymentAccountInput) {
    const { accountType, ...rest } = input;

    if (!accountType) {
      throw new BadRequestException('accountType is required');
    }

    const [account] = await this.db
      .insert(ownerPaymentAccounts)
      .values({
        accountType,
        ...rest,
        verificationStatus: 'pending',
        isActive: true,
      })
      .returning();

    this.logger.log(`Payment account created: ${account.id} (${accountType})`);
    return this.maskAccount(account);
  }

  async listPaymentAccounts() {
    const accounts = await this.db.select().from(ownerPaymentAccounts).orderBy(sql`${ownerPaymentAccounts.createdAt} desc`);
    return accounts.map((a) => this.maskAccount(a));
  }

  async getPaymentAccount(accountId: string) {
    const [account] = await this.db
      .select()
      .from(ownerPaymentAccounts)
      .where(eq(ownerPaymentAccounts.id, accountId))
      .limit(1);

    if (!account) throw new NotFoundException('Payment account not found');
    return this.maskAccount(account);
  }

  async verifyAccount(accountId: string) {
    const [account] = await this.db
      .update(ownerPaymentAccounts)
      .set({
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ownerPaymentAccounts.id, accountId))
      .returning();

    if (!account) throw new NotFoundException('Payment account not found');
    this.logger.log(`Account verified: ${accountId}`);
    return this.maskAccount(account);
  }

  async deactivateAccount(accountId: string) {
    const [account] = await this.db
      .update(ownerPaymentAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(ownerPaymentAccounts.id, accountId))
      .returning();

    if (!account) throw new NotFoundException('Payment account not found');
    this.logger.log(`Account deactivated: ${accountId}`);
    return this.maskAccount(account);
  }

  async createPayout(accountId: string, invoiceIds: string[], amount: number) {
    const [account] = await this.db
      .select()
      .from(ownerPaymentAccounts)
      .where(
        and(eq(ownerPaymentAccounts.id, accountId), eq(ownerPaymentAccounts.isActive, true)),
      )
      .limit(1);

    if (!account) throw new NotFoundException('Active payment account not found');
    if (account.verificationStatus !== 'verified') {
      throw new BadRequestException('Payment account is not verified');
    }

    const [payout] = await this.db
      .insert(ownerPayouts)
      .values({
        accountId,
        invoiceIds: JSON.stringify(invoiceIds),
        amount: String(amount),
        currency: 'RUB',
        status: 'pending',
      })
      .returning();

    await this.db
      .insert(ownerPayoutEvents)
      .values({
        payoutId: payout.id,
        event: 'initiated',
        details: { invoiceIds, amount },
      });

    this.logger.log(`Payout initiated: ${payout.id} to account ${accountId}, amount: ${amount}`);
    return payout;
  }

  async listPayouts(status?: string) {
    const query = this.db
      .select()
      .from(ownerPayouts)
      .orderBy(sql`${ownerPayouts.createdAt} desc`);

    const payouts = status ? await query.where(eq(ownerPayouts.status, status)) : await query;

    return payouts.map((p) => ({
      ...p,
      invoiceIds: JSON.parse(p.invoiceIds as string),
      amount: Number(p.amount),
    }));
  }

  async getPayout(payoutId: string) {
    const [payout] = await this.db
      .select()
      .from(ownerPayouts)
      .where(eq(ownerPayouts.id, payoutId))
      .limit(1);

    if (!payout) throw new NotFoundException('Payout not found');

    return {
      ...payout,
      invoiceIds: JSON.parse(payout.invoiceIds as string),
      amount: Number(payout.amount),
    };
  }

  async updatePayoutStatus(payoutId: string, newStatus: string, errorMessage?: string) {
    const [payout] = await this.db
      .update(ownerPayouts)
      .set({
        status: newStatus,
        errorMessage,
        completedAt:
          newStatus === 'completed' || newStatus === 'failed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(ownerPayouts.id, payoutId))
      .returning();

    if (!payout) throw new NotFoundException('Payout not found');

    await this.db
      .insert(ownerPayoutEvents)
      .values({
        payoutId,
        event: newStatus,
        details: { errorMessage },
      });

    this.logger.log(`Payout status updated: ${payoutId} -> ${newStatus}`);
    return payout;
  }

  async getPayoutStats() {
    const [stats] = await this.db
      .select({
        pendingCount: sql<number>`count(*) filter (where ${ownerPayouts.status} = 'pending')`,
        processingCount: sql<number>`count(*) filter (where ${ownerPayouts.status} = 'processing')`,
        completedCount: sql<number>`count(*) filter (where ${ownerPayouts.status} = 'completed')`,
        failedCount: sql<number>`count(*) filter (where ${ownerPayouts.status} = 'failed')`,
        totalAmount: sql<string>`coalesce(sum(${ownerPayouts.amount}), 0)`,
      })
      .from(ownerPayouts);

    return {
      pending: Number(stats?.pendingCount ?? 0),
      processing: Number(stats?.processingCount ?? 0),
      completed: Number(stats?.completedCount ?? 0),
      failed: Number(stats?.failedCount ?? 0),
      totalAmount: Number(stats?.totalAmount ?? 0),
    };
  }

  private maskAccount(account: any) {
    return {
      ...account,
      accountNumber: account.accountNumber
        ? `****${account.accountNumber.slice(-4)}`
        : null,
      credentialsEnc: undefined, // Never expose encrypted credentials
    };
  }
}
