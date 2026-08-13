import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OwnerPayoutsService, ACCOUNT_TYPES } from './owner-payouts.service.js';
import { createFakeDb, type FakeDb } from './fake-db.js';

describe('OwnerPayoutsService', () => {
  let service: OwnerPayoutsService;
  let fake: FakeDb;

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    service = new OwnerPayoutsService(created.db);
  });

  describe('addPaymentAccount', () => {
    it('отвергает пустой accountType', async () => {
      await expect(service.addPaymentAccount({} as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('отвергает незнакомый accountType', async () => {
      await expect(
        service.addPaymentAccount({ accountType: 'monopoly_money' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each(ACCOUNT_TYPES)('принимает тип %s', async (accountType) => {
      fake.queue([{ id: 'acc_1', accountType, accountNumber: null }]);
      const account = await service.addPaymentAccount({ accountType });
      expect(account.accountType).toBe(accountType);
    });

    it('создаёт счёт со статусом pending и активным флагом', async () => {
      fake.queue([{ id: 'acc_1', accountType: 'sbp', accountNumber: null }]);
      await service.addPaymentAccount({ accountType: 'sbp', phoneSbp: '+79991234567' });

      const [values] = fake.argsOf('values') as [Record<string, unknown>];
      expect(values.verificationStatus).toBe('pending');
      expect(values.isActive).toBe(true);
      expect(values.phoneSbp).toBe('+79991234567');
    });

    it('маскирует номер счёта и не отдаёт шифрованные реквизиты', async () => {
      fake.queue([
        {
          id: 'acc_1',
          accountType: 'bank_account',
          accountNumber: '40817810638050123456',
          credentialsEnc: 'secret-blob',
        },
      ]);

      const account = await service.addPaymentAccount({ accountType: 'bank_account' });

      expect(account.accountNumber).toBe('****3456');
      expect(account).not.toHaveProperty('credentialsEnc');
    });
  });

  describe('listPaymentAccounts', () => {
    it('маскирует каждый счёт в списке', async () => {
      fake.queue([
        { id: 'a', accountNumber: '40817810638050123456', credentialsEnc: 'x' },
        { id: 'b', accountNumber: null, credentialsEnc: 'y' },
      ]);

      const accounts = await service.listPaymentAccounts();

      expect(accounts).toHaveLength(2);
      expect(accounts[0].accountNumber).toBe('****3456');
      expect(accounts[1].accountNumber).toBeNull();
      expect(accounts.every((a) => !('credentialsEnc' in a))).toBe(true);
    });
  });

  describe('getPaymentAccount', () => {
    it('возвращает счёт по id', async () => {
      fake.queue([{ id: 'acc_1', accountNumber: null }]);
      await expect(service.getPaymentAccount('acc_1')).resolves.toMatchObject({
        id: 'acc_1',
      });
    });

    it('бросает NotFound, когда счёта нет', async () => {
      fake.queue([]);
      await expect(service.getPaymentAccount('нет-такого')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('verifyAccount', () => {
    it('проставляет verified и время верификации', async () => {
      fake.queue([
        { id: 'acc_1', verificationStatus: 'verified', accountNumber: null },
      ]);

      const account = await service.verifyAccount('acc_1');

      expect(account.verificationStatus).toBe('verified');
      const [patch] = fake.argsOf('set') as [Record<string, unknown>];
      expect(patch.verificationStatus).toBe('verified');
      expect(patch.verifiedAt).toBeInstanceOf(Date);
    });

    it('бросает NotFound на несуществующем счёте', async () => {
      fake.queue([]);
      await expect(service.verifyAccount('нет')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deactivateAccount', () => {
    it('снимает флаг активности', async () => {
      fake.queue([{ id: 'acc_1', isActive: false, accountNumber: null }]);

      const account = await service.deactivateAccount('acc_1');

      expect(account.isActive).toBe(false);
      const [patch] = fake.argsOf('set') as [Record<string, unknown>];
      expect(patch.isActive).toBe(false);
    });
  });

  describe('createPayout', () => {
    it('бросает NotFound, если активного счёта нет', async () => {
      fake.queue([]);
      await expect(service.createPayout('acc_1', ['inv_1'], 100)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('запрещает выплату на неверифицированный счёт', async () => {
      fake.queue([[{ id: 'acc_1', verificationStatus: 'pending', isActive: true }]][0]);
      await expect(service.createPayout('acc_1', ['inv_1'], 100)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('пишет invoiceIds JSON-строкой — колонка invoice_ids имеет тип text', async () => {
      fake.queue(
        [{ id: 'acc_1', verificationStatus: 'verified', isActive: true }],
        [{ id: 'payout_1', status: 'pending' }],
        [],
      );

      const payout = await service.createPayout('acc_1', ['inv_1', 'inv_2'], 50000);

      expect(payout.status).toBe('pending');
      const [values] = fake.argsOf('values') as [Record<string, unknown>];
      expect(typeof values.invoiceIds).toBe('string');
      expect(JSON.parse(values.invoiceIds as string)).toEqual(['inv_1', 'inv_2']);
      expect(values.amount).toBe('50000');
      expect(values.status).toBe('pending');
    });

    it('заводит событие initiated в журнале выплат', async () => {
      fake.queue(
        [{ id: 'acc_1', verificationStatus: 'verified', isActive: true }],
        [{ id: 'payout_1', status: 'pending' }],
        [],
      );

      await service.createPayout('acc_1', ['inv_1'], 100);

      const event = fake.argsOf('values', 1) as [Record<string, unknown>];
      expect(event[0].event).toBe('initiated');
      expect(event[0].payoutId).toBe('payout_1');
    });
  });

  describe('listPayouts', () => {
    it('разбирает invoiceIds и приводит сумму к числу', async () => {
      fake.queue([
        { id: 'p1', invoiceIds: JSON.stringify(['inv_1', 'inv_2']), amount: '50000' },
      ]);

      const payouts = await service.listPayouts();

      expect(payouts[0].invoiceIds).toEqual(['inv_1', 'inv_2']);
      expect(payouts[0].amount).toBe(50000);
    });

    it('фильтрует по статусу до сортировки', async () => {
      fake.queue([]);
      await service.listPayouts('completed');

      const methods = fake.calls.map((c) => c.method);
      expect(methods.indexOf('where')).toBeGreaterThan(-1);
      expect(methods.indexOf('where')).toBeLessThan(methods.indexOf('orderBy'));
    });
  });

  describe('getPayout', () => {
    it('возвращает выплату с разобранными полями', async () => {
      fake.queue([{ id: 'p1', invoiceIds: JSON.stringify(['inv_1']), amount: '1500.50' }]);

      const payout = await service.getPayout('p1');

      expect(payout.invoiceIds).toEqual(['inv_1']);
      expect(payout.amount).toBe(1500.5);
    });

    it('бросает NotFound на несуществующей выплате', async () => {
      fake.queue([]);
      await expect(service.getPayout('нет')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updatePayoutStatus', () => {
    it('проставляет completedAt для завершающих статусов', async () => {
      fake.queue([{ id: 'p1', status: 'completed' }], []);

      await service.updatePayoutStatus('p1', 'completed');

      const [patch] = fake.argsOf('set') as [Record<string, unknown>];
      expect(patch.completedAt).toBeInstanceOf(Date);
    });

    it('не ставит completedAt для промежуточного processing', async () => {
      fake.queue([{ id: 'p1', status: 'processing' }], []);

      await service.updatePayoutStatus('p1', 'processing');

      const [patch] = fake.argsOf('set') as [Record<string, unknown>];
      expect(patch.completedAt).toBeUndefined();
    });

    it('сохраняет текст ошибки при failed', async () => {
      fake.queue([{ id: 'p1', status: 'failed', errorMessage: 'нет средств' }], []);

      const payout = await service.updatePayoutStatus('p1', 'failed', 'нет средств');

      expect(payout.errorMessage).toBe('нет средств');
    });

    it('бросает NotFound на несуществующей выплате', async () => {
      fake.queue([]);
      await expect(service.updatePayoutStatus('нет', 'completed')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getPayoutStats', () => {
    it('приводит счётчики Postgres (bigint приходит строкой) к числам', async () => {
      fake.queue([
        {
          pendingCount: '2',
          processingCount: '1',
          completedCount: '15',
          failedCount: '0',
          totalAmount: '1250000.00',
        },
      ]);

      const stats = await service.getPayoutStats();

      expect(stats).toEqual({
        pending: 2,
        processing: 1,
        completed: 15,
        failed: 0,
        totalAmount: 1250000,
      });
    });

    it('отдаёт нули на пустой таблице', async () => {
      fake.queue([]);
      await expect(service.getPayoutStats()).resolves.toEqual({
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalAmount: 0,
      });
    });
  });
});
