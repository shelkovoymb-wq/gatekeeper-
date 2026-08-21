import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ServiceTokenGuard } from '../common/service-token.guard.js';
import { DB, type Database } from '../db/db.module.js';
import { directPaymentAccounts } from '../db/schema.js';

interface CreateAccountInput {
  clientId: string;
  accountType: 'card' | 'bank_account' | 'sbp' | 'paypal';
  // Для карт
  cardNumberMasked?: string; // **** **** **** 1234
  cardHolder?: string;
  // Для банковских счётов
  bankName?: string;
  accountNumber?: string;
  bic?: string;
  inn?: string;
  // Универсальные
  phoneNumber?: string;
  email?: string;
  // СБП
  phoneForSbp?: string;
}

interface UpdateAccountInput {
  cardNumberMasked?: string;
  cardHolder?: string;
  bankName?: string;
  accountNumber?: string;
  bic?: string;
  inn?: string;
  phoneNumber?: string;
  email?: string;
  phoneForSbp?: string;
  isActive?: boolean;
}

/**
 * В колонке card_number_masked должен лежать только хвост номера — так её
 * читает и кабинет, и UI. Эта ручка исторически писала туда что прислали:
 * `cardNumberMasked: "4242424242424242"` оседал полным PAN, а наружу всё
 * равно отдавался как `•••• 4242`, то есть по интерфейсу утечку было не видно.
 * Обрезаем на записи, а не отвергаем: формат присланного (`**** 1234`,
 * `4242 4242 4242 1234`) у вызывающих её воркфлоу разный.
 */
function keepLast4(masked: string | undefined): string | undefined {
  if (masked === undefined) return undefined;
  const digits = masked.replace(/\D/g, '');
  return digits.length >= 4 ? `****${digits.slice(-4)}` : masked;
}

@Controller('payment-accounts')
export class PaymentAccountsController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Post()
  @UseGuards(ServiceTokenGuard)
  async create(@Body() input: CreateAccountInput) {
    if (!input.clientId || !input.accountType) {
      throw new BadRequestException('clientId and accountType are required');
    }

    // Валидируем, что требуемые поля заполнены в зависимости от типа счёта
    switch (input.accountType) {
      case 'card':
        if (!input.cardNumberMasked || !input.cardHolder) {
          throw new BadRequestException('cardNumberMasked and cardHolder required for card');
        }
        break;
      case 'bank_account':
        if (!input.accountNumber || !input.bankName) {
          throw new BadRequestException('accountNumber and bankName required for bank_account');
        }
        break;
      case 'sbp':
        if (!input.phoneForSbp) {
          throw new BadRequestException('phoneForSbp required for sbp');
        }
        break;
      case 'paypal':
        if (!input.email) {
          throw new BadRequestException('email required for paypal');
        }
        break;
    }

    // Деактивируем существующий счёт этого типа (одновременно может быть только один активный)
    await this.db
      .update(directPaymentAccounts)
      .set({ isActive: false })
      .where(
        and(
          eq(directPaymentAccounts.clientId, input.clientId),
          eq(directPaymentAccounts.accountType, input.accountType),
        ),
      );

    // Создаём новый счёт
    const [account] = await this.db
      .insert(directPaymentAccounts)
      .values({
        clientId: input.clientId,
        accountType: input.accountType,
        cardNumberMasked: keepLast4(input.cardNumberMasked),
        cardHolder: input.cardHolder,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
        bic: input.bic,
        inn: input.inn,
        phoneNumber: input.phoneNumber,
        email: input.email,
        phoneForSbp: input.phoneForSbp,
        isActive: true,
        verificationStatus: 'pending', // Требует верификации администратором
      })
      .returning();

    return {
      id: account.id,
      accountType: account.accountType,
      verificationStatus: account.verificationStatus,
      createdAt: account.createdAt,
      message: 'Account created. Awaiting admin verification.',
    };
  }

  @Get(':accountId')
  @UseGuards(ServiceTokenGuard)
  async get(@Param('accountId') accountId: string) {
    const [account] = await this.db
      .select()
      .from(directPaymentAccounts)
      .where(eq(directPaymentAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    return {
      id: account.id,
      accountType: account.accountType,
      verificationStatus: account.verificationStatus,
      isActive: account.isActive,
      createdAt: account.createdAt,
      verifiedAt: account.verifiedAt,
      // Скрываем чувствительные данные в ответе
      cardHolder: account.cardHolder,
      cardNumberMasked: account.cardNumberMasked,
      email: account.email,
      phoneNumber: account.phoneNumber,
    };
  }

  @Get('client/:clientId')
  @UseGuards(ServiceTokenGuard)
  async getByClient(@Param('clientId') clientId: string) {
    const accounts = await this.db
      .select()
      .from(directPaymentAccounts)
      .where(eq(directPaymentAccounts.clientId, clientId));

    return accounts.map((acc) => ({
      id: acc.id,
      accountType: acc.accountType,
      verificationStatus: acc.verificationStatus,
      isActive: acc.isActive,
      cardNumberMasked: acc.cardNumberMasked,
      email: acc.email,
      phoneNumber: acc.phoneNumber,
      createdAt: acc.createdAt,
      verifiedAt: acc.verifiedAt,
    }));
  }

  @Put(':accountId')
  @UseGuards(ServiceTokenGuard)
  async update(@Param('accountId') accountId: string, @Body() input: UpdateAccountInput) {
    const [account] = await this.db
      .select()
      .from(directPaymentAccounts)
      .where(eq(directPaymentAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Если изменили данные, требуем повторной верификации
    const needsReverification =
      (input.cardNumberMasked && input.cardNumberMasked !== account.cardNumberMasked) ||
      (input.accountNumber && input.accountNumber !== account.accountNumber) ||
      (input.email && input.email !== account.email) ||
      (input.phoneForSbp && input.phoneForSbp !== account.phoneForSbp);

    const [updated] = await this.db
      .update(directPaymentAccounts)
      .set({
        cardNumberMasked: keepLast4(input.cardNumberMasked) ?? account.cardNumberMasked,
        cardHolder: input.cardHolder ?? account.cardHolder,
        bankName: input.bankName ?? account.bankName,
        accountNumber: input.accountNumber ?? account.accountNumber,
        bic: input.bic ?? account.bic,
        inn: input.inn ?? account.inn,
        phoneNumber: input.phoneNumber ?? account.phoneNumber,
        email: input.email ?? account.email,
        phoneForSbp: input.phoneForSbp ?? account.phoneForSbp,
        isActive: input.isActive ?? account.isActive,
        verificationStatus: needsReverification ? 'pending' : account.verificationStatus,
        updatedAt: new Date(),
      })
      .where(eq(directPaymentAccounts.id, accountId))
      .returning();

    return {
      id: updated.id,
      verificationStatus: updated.verificationStatus,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
      message: needsReverification
        ? 'Account updated. Awaiting admin verification.'
        : 'Account updated.',
    };
  }

  @Delete(':accountId')
  @UseGuards(ServiceTokenGuard)
  async delete(@Param('accountId') accountId: string) {
    const [account] = await this.db
      .select()
      .from(directPaymentAccounts)
      .where(eq(directPaymentAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    // Мягкое удаление - просто деактивируем
    await this.db
      .update(directPaymentAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(directPaymentAccounts.id, accountId));

    return { message: 'Account deactivated' };
  }

  // Admin endpoint для верификации счёта
  @Post(':accountId/verify')
  @UseGuards(ServiceTokenGuard)
  async verifyAccount(
    @Param('accountId') accountId: string,
    @Body() input: { status: 'verified' | 'rejected'; reason?: string },
  ) {
    if (!['verified', 'rejected'].includes(input.status)) {
      throw new BadRequestException('Invalid status');
    }

    const [account] = await this.db
      .select()
      .from(directPaymentAccounts)
      .where(eq(directPaymentAccounts.id, accountId))
      .limit(1);

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const [updated] = await this.db
      .update(directPaymentAccounts)
      .set({
        verificationStatus: input.status,
        verifiedAt: input.status === 'verified' ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(directPaymentAccounts.id, accountId))
      .returning();

    return {
      id: updated.id,
      verificationStatus: updated.verificationStatus,
      verifiedAt: updated.verifiedAt,
      message: `Account ${input.status}${input.reason ? `: ${input.reason}` : ''}`,
    };
  }
}
