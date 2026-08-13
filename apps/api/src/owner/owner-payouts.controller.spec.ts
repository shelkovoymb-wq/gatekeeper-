import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OwnerPayoutsController } from './owner-payouts.controller';
import { OwnerPayoutsService } from './owner-payouts.service';
import type { AuthContext } from '../auth/auth.types';

describe('OwnerPayoutsController', () => {
  let controller: OwnerPayoutsController;
  let service: OwnerPayoutsService;
  let ownerAuth: AuthContext;
  let clientAuth: AuthContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OwnerPayoutsController],
      providers: [
        {
          provide: OwnerPayoutsService,
          useValue: {
            addPaymentAccount: jest.fn(),
            listPaymentAccounts: jest.fn(),
            getPaymentAccount: jest.fn(),
            verifyAccount: jest.fn(),
            deactivateAccount: jest.fn(),
            createPayout: jest.fn(),
            listPayouts: jest.fn(),
            getPayout: jest.fn(),
            updatePayoutStatus: jest.fn(),
            getPayoutStats: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OwnerPayoutsController>(OwnerPayoutsController);
    service = module.get<OwnerPayoutsService>(OwnerPayoutsService);

    ownerAuth = { role: 'owner', clientId: null, userId: 'user_1' } as AuthContext;
    clientAuth = { role: 'client_admin', clientId: 'client_1', userId: 'user_2' } as AuthContext;
  });

  it('controller should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Payment Accounts', () => {
    describe('addPaymentAccount', () => {
      it('should add payment account as owner', async () => {
        const input = {
          accountType: 'bank_account',
          bankName: 'Sberbank',
          accountNumber: '40817810638050123456',
        };

        jest.spyOn(service, 'addPaymentAccount').mockResolvedValue({
          id: 'acc_123',
          ...input,
          isActive: true,
          verificationStatus: 'pending',
        });

        const result = await controller.addPaymentAccount(ownerAuth, input);

        expect(result).toBeDefined();
        expect(service.addPaymentAccount).toHaveBeenCalledWith(input);
      });

      it('should throw error if not owner', async () => {
        const input = {
          accountType: 'bank_account',
          bankName: 'Sberbank',
        };

        await expect(controller.addPaymentAccount(clientAuth, input)).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('listPaymentAccounts', () => {
      it('should list payment accounts as owner', async () => {
        const mockAccounts = [
          { id: 'acc_1', accountType: 'bank_account', isActive: true },
          { id: 'acc_2', accountType: 'card', isActive: true },
        ];

        jest.spyOn(service, 'listPaymentAccounts').mockResolvedValue(mockAccounts);

        const result = await controller.listPaymentAccounts(ownerAuth);

        expect(result).toHaveLength(2);
        expect(service.listPaymentAccounts).toHaveBeenCalled();
      });

      it('should throw error if not owner', async () => {
        await expect(controller.listPaymentAccounts(clientAuth)).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('getPaymentAccount', () => {
      it('should get payment account details as owner', async () => {
        const mockAccount = {
          id: 'acc_123',
          accountType: 'bank_account',
          isActive: true,
          verificationStatus: 'verified',
        };

        jest.spyOn(service, 'getPaymentAccount').mockResolvedValue(mockAccount);

        const result = await controller.getPaymentAccount(ownerAuth, 'acc_123');

        expect(result).toBeDefined();
        expect(result.id).toBe('acc_123');
      });

      it('should throw error if not owner', async () => {
        await expect(
          controller.getPaymentAccount(clientAuth, 'acc_123'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('verifyAccount', () => {
      it('should verify account as owner', async () => {
        const mockAccount = {
          id: 'acc_123',
          verificationStatus: 'verified',
          verifiedAt: new Date(),
        };

        jest.spyOn(service, 'verifyAccount').mockResolvedValue(mockAccount);

        const result = await controller.verifyAccount(ownerAuth, 'acc_123');

        expect(result.verificationStatus).toBe('verified');
        expect(service.verifyAccount).toHaveBeenCalledWith('acc_123');
      });

      it('should throw error if not owner', async () => {
        await expect(controller.verifyAccount(clientAuth, 'acc_123')).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('deactivateAccount', () => {
      it('should deactivate account as owner', async () => {
        const mockAccount = {
          id: 'acc_123',
          isActive: false,
        };

        jest.spyOn(service, 'deactivateAccount').mockResolvedValue(mockAccount);

        const result = await controller.deactivateAccount(ownerAuth, 'acc_123');

        expect(result.isActive).toBe(false);
      });

      it('should throw error if not owner', async () => {
        await expect(
          controller.deactivateAccount(clientAuth, 'acc_123'),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('Payouts', () => {
    describe('createPayout', () => {
      it('should create payout as owner', async () => {
        const input = {
          accountId: 'acc_123',
          invoiceIds: ['inv_1', 'inv_2'],
          amount: 50000,
        };

        const mockPayout = {
          id: 'payout_123',
          ...input,
          status: 'pending',
        };

        jest.spyOn(service, 'createPayout').mockResolvedValue(mockPayout);

        const result = await controller.createPayout(ownerAuth, input);

        expect(result).toBeDefined();
        expect(result.status).toBe('pending');
        expect(service.createPayout).toHaveBeenCalledWith(
          'acc_123',
          ['inv_1', 'inv_2'],
          50000,
        );
      });

      it('should throw error if not owner', async () => {
        const input = {
          accountId: 'acc_123',
          invoiceIds: ['inv_1'],
          amount: 50000,
        };

        await expect(controller.createPayout(clientAuth, input)).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('listPayouts', () => {
      it('should list payouts as owner', async () => {
        const mockPayouts = [
          { id: 'payout_1', status: 'completed', amount: 50000 },
          { id: 'payout_2', status: 'pending', amount: 75000 },
        ];

        jest.spyOn(service, 'listPayouts').mockResolvedValue(mockPayouts);

        const result = await controller.listPayouts(ownerAuth);

        expect(result).toHaveLength(2);
        expect(service.listPayouts).toHaveBeenCalled();
      });

      it('should throw error if not owner', async () => {
        await expect(controller.listPayouts(clientAuth)).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe('getPayout', () => {
      it('should get payout details as owner', async () => {
        const mockPayout = {
          id: 'payout_123',
          status: 'completed',
          amount: 50000,
        };

        jest.spyOn(service, 'getPayout').mockResolvedValue(mockPayout);

        const result = await controller.getPayout(ownerAuth, 'payout_123');

        expect(result).toBeDefined();
        expect(result.id).toBe('payout_123');
      });

      it('should throw error if not owner', async () => {
        await expect(
          controller.getPayout(clientAuth, 'payout_123'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('getPayoutStats', () => {
      it('should get payout stats as owner', async () => {
        const mockStats = {
          pending: 2,
          processing: 1,
          completed: 15,
          failed: 0,
          totalAmount: 1250000,
        };

        jest.spyOn(service, 'getPayoutStats').mockResolvedValue(mockStats);

        const result = await controller.getPayoutStats(ownerAuth);

        expect(result.pending).toBe(2);
        expect(result.completed).toBe(15);
      });

      it('should throw error if not owner', async () => {
        await expect(controller.getPayoutStats(clientAuth)).rejects.toThrow(
          BadRequestException,
        );
      });
    });
  });

  describe('Authorization', () => {
    it('should verify owner role on all endpoints', async () => {
      const endpoints = [
        () => controller.listPaymentAccounts(clientAuth),
        () => controller.listPayouts(clientAuth),
        () => controller.getPayoutStats(clientAuth),
      ];

      for (const endpoint of endpoints) {
        await expect(endpoint()).rejects.toThrow(BadRequestException);
      }
    });

    it('should allow owner to access all endpoints', async () => {
      jest.spyOn(service, 'listPaymentAccounts').mockResolvedValue([]);
      jest.spyOn(service, 'listPayouts').mockResolvedValue([]);
      jest.spyOn(service, 'getPayoutStats').mockResolvedValue({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalAmount: 0,
      });

      await expect(controller.listPaymentAccounts(ownerAuth)).resolves.toBeDefined();
      await expect(controller.listPayouts(ownerAuth)).resolves.toBeDefined();
      await expect(controller.getPayoutStats(ownerAuth)).resolves.toBeDefined();
    });
  });
});
