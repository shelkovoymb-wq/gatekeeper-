import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OwnerPayoutsService } from './owner-payouts.service';
import { DB } from '../db/db.module';
import { ownerPaymentAccounts, ownerPayouts, ownerPayoutEvents } from '../db/schema';

describe('OwnerPayoutsService', () => {
  let service: OwnerPayoutsService;
  let mockDb: any;

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerPayoutsService,
        {
          provide: DB,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<OwnerPayoutsService>(OwnerPayoutsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addPaymentAccount', () => {
    it('should create payment account with valid data', async () => {
      const accountData = {
        accountType: 'bank_account',
        bankName: 'Sberbank',
        accountNumber: '40817810638050123456',
        bic: '044525225',
        inn: '7707083893',
      };

      mockDb.returning.mockResolvedValue([
        {
          id: 'acc_123',
          ...accountData,
          isActive: true,
          verificationStatus: 'pending',
        },
      ]);

      const result = await service.addPaymentAccount(accountData);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.accountType).toBe('bank_account');
    });

    it('should throw BadRequestException if accountType missing', async () => {
      const invalidData = {
        bankName: 'Sberbank',
      };

      await expect(service.addPaymentAccount(invalidData as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create card payment account', async () => {
      const accountData = {
        accountType: 'card',
        cardLast4: '4242',
        cardHolder: 'Ivan Petrov',
      };

      mockDb.returning.mockResolvedValue([
        {
          id: 'acc_card_123',
          ...accountData,
          isActive: true,
          verificationStatus: 'pending',
        },
      ]);

      const result = await service.addPaymentAccount(accountData);

      expect(result.accountType).toBe('card');
      expect(result.cardLast4).toBe('4242');
    });

    it('should create SBP payment account', async () => {
      const accountData = {
        accountType: 'sbp',
        phoneSbp: '+79991234567',
      };

      mockDb.returning.mockResolvedValue([
        {
          id: 'acc_sbp_123',
          ...accountData,
          isActive: true,
          verificationStatus: 'pending',
        },
      ]);

      const result = await service.addPaymentAccount(accountData);

      expect(result.accountType).toBe('sbp');
      expect(result.phoneSbp).toBe('+79991234567');
    });
  });

  describe('listPaymentAccounts', () => {
    it('should return list of payment accounts', async () => {
      const mockAccounts = [
        {
          id: 'acc_1',
          accountType: 'bank_account',
          isActive: true,
          verificationStatus: 'verified',
          accountNumber: '40817810638050123456',
        },
        {
          id: 'acc_2',
          accountType: 'card',
          isActive: true,
          verificationStatus: 'pending',
          cardLast4: '4242',
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockAccounts);

      const result = await service.listPaymentAccounts();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should mask sensitive account data', async () => {
      const mockAccounts = [
        {
          id: 'acc_1',
          accountType: 'bank_account',
          accountNumber: '40817810638050123456',
          credentialsEnc: 'encrypted_data_here',
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockAccounts);

      const result = await service.listPaymentAccounts();

      expect(result[0].accountNumber).toContain('****');
      expect(result[0].credentialsEnc).toBeUndefined();
    });
  });

  describe('getPaymentAccount', () => {
    it('should return payment account by id', async () => {
      const mockAccount = {
        id: 'acc_123',
        accountType: 'bank_account',
        isActive: true,
        verificationStatus: 'verified',
      };

      mockDb.limit.mockResolvedValue([mockAccount]);

      const result = await service.getPaymentAccount('acc_123');

      expect(result).toBeDefined();
      expect(result.id).toBe('acc_123');
    });

    it('should throw NotFoundException if account not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.getPaymentAccount('invalid_id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verifyAccount', () => {
    it('should verify payment account', async () => {
      const verifiedAccount = {
        id: 'acc_123',
        verificationStatus: 'verified',
        verifiedAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([verifiedAccount]);

      const result = await service.verifyAccount('acc_123');

      expect(result.verificationStatus).toBe('verified');
      expect(result.verifiedAt).toBeDefined();
    });
  });

  describe('deactivateAccount', () => {
    it('should deactivate payment account', async () => {
      const deactivatedAccount = {
        id: 'acc_123',
        isActive: false,
      };

      mockDb.returning.mockResolvedValue([deactivatedAccount]);

      const result = await service.deactivateAccount('acc_123');

      expect(result.isActive).toBe(false);
    });
  });

  describe('createPayout', () => {
    it('should create payout for verified account', async () => {
      mockDb.limit.mockResolvedValue([
        {
          id: 'acc_123',
          verificationStatus: 'verified',
          isActive: true,
        },
      ]);

      const payoutData = {
        id: 'payout_123',
        accountId: 'acc_123',
        invoiceIds: JSON.stringify(['inv_1', 'inv_2']),
        amount: '50000',
        status: 'pending',
      };

      mockDb.returning.mockResolvedValue([payoutData]);

      const result = await service.createPayout('acc_123', ['inv_1', 'inv_2'], 50000);

      expect(result).toBeDefined();
      expect(result.status).toBe('pending');
    });

    it('should throw error if account not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(
        service.createPayout('invalid_acc', ['inv_1'], 50000),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if account not verified', async () => {
      mockDb.limit.mockResolvedValue([
        {
          id: 'acc_123',
          verificationStatus: 'pending',
          isActive: true,
        },
      ]);

      await expect(
        service.createPayout('acc_123', ['inv_1'], 50000),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listPayouts', () => {
    it('should return list of payouts', async () => {
      const mockPayouts = [
        {
          id: 'payout_1',
          invoiceIds: JSON.stringify(['inv_1']),
          amount: '50000',
          status: 'completed',
        },
        {
          id: 'payout_2',
          invoiceIds: JSON.stringify(['inv_2', 'inv_3']),
          amount: '75000',
          status: 'pending',
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockPayouts);

      const result = await service.listPayouts();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });

    it('should parse invoice IDs from JSON', async () => {
      const mockPayouts = [
        {
          id: 'payout_1',
          invoiceIds: JSON.stringify(['inv_1', 'inv_2']),
          amount: '50000',
          status: 'completed',
        },
      ];

      mockDb.orderBy.mockResolvedValue(mockPayouts);

      const result = await service.listPayouts();

      expect(Array.isArray(result[0].invoiceIds)).toBe(true);
      expect(result[0].invoiceIds).toContain('inv_1');
    });
  });

  describe('getPayout', () => {
    it('should return payout by id', async () => {
      const mockPayout = {
        id: 'payout_123',
        invoiceIds: JSON.stringify(['inv_1']),
        amount: '50000',
        status: 'completed',
      };

      mockDb.limit.mockResolvedValue([mockPayout]);

      const result = await service.getPayout('payout_123');

      expect(result.id).toBe('payout_123');
      expect(result.amount).toBe(50000);
    });

    it('should throw NotFoundException if payout not found', async () => {
      mockDb.limit.mockResolvedValue([]);

      await expect(service.getPayout('invalid_id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePayoutStatus', () => {
    it('should update payout status', async () => {
      const updatedPayout = {
        id: 'payout_123',
        status: 'completed',
        completedAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([updatedPayout]);

      const result = await service.updatePayoutStatus('payout_123', 'completed');

      expect(result.status).toBe('completed');
    });

    it('should record error message on failed status', async () => {
      const failedPayout = {
        id: 'payout_123',
        status: 'failed',
        errorMessage: 'Insufficient funds',
        completedAt: new Date(),
      };

      mockDb.returning.mockResolvedValue([failedPayout]);

      const result = await service.updatePayoutStatus(
        'payout_123',
        'failed',
        'Insufficient funds',
      );

      expect(result.errorMessage).toBe('Insufficient funds');
    });
  });

  describe('getPayoutStats', () => {
    it('should return payout statistics', async () => {
      mockDb.select.mockResolvedValue([
        {
          pendingCount: 2,
          processingCount: 1,
          completedCount: 15,
          failedCount: 0,
          totalAmount: '1250000',
        },
      ]);

      const result = await service.getPayoutStats();

      expect(result.pending).toBe(2);
      expect(result.processing).toBe(1);
      expect(result.completed).toBe(15);
      expect(result.failed).toBe(0);
      expect(result.totalAmount).toBe(1250000);
    });
  });
});
