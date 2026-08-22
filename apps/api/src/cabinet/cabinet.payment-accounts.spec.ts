import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CabinetService } from './cabinet.service.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    clientId: CLIENT_A,
    accountType: 'bank_account',
    cardNumberMasked: null,
    cardHolder: null,
    bankName: 'Сбербанк',
    accountNumber: '40817810638050123456',
    bic: '044525225',
    inn: '7707083893',
    phoneNumber: null,
    email: null,
    phoneForSbp: null,
    cryptoAddress: null,
    cryptoType: null,
    isActive: true,
    verificationStatus: 'not_required',
    verifiedAt: null,
    createdAt: new Date('2026-08-17T00:00:00Z'),
    updatedAt: new Date('2026-08-17T00:00:00Z'),
    ...over,
  };
}

/**
 * Реквизиты клиента: тот же набор типов, что у владельца платформы, но заводит
 * их клиент сам и только в своём тенанте.
 */
describe('CabinetService — реквизиты клиента', () => {
  let service: CabinetService;
  let fake: FakeDb;

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    service = new CabinetService(
      created.db,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe('addPaymentAccount', () => {
    it.each(['bank_account', 'card', 'sbp', 'paypal', 'crypto'])(
      'принимает тип %s',
      async (accountType) => {
        const input: Record<string, string> = {
          accountType,
          bankName: 'Сбербанк',
          accountNumber: '40817810638050123456',
          cardLast4: '4242',
          phoneSbp: '+79991234567',
          paypalEmail: 'client@example.com',
          cryptoAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
          cryptoType: 'btc',
        };
        fake.queue([], [row({ accountType })]);

        await expect(service.addPaymentAccount(CLIENT_A, input)).resolves.toMatchObject({
          accountType,
        });
      },
    );

    it('отвергает неизвестный тип', async () => {
      await expect(
        service.addPaymentAccount(CLIENT_A, { accountType: 'чемодан-денег' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('не даёт задать статус проверки через тело запроса', async () => {
      fake.queue([], [row()]);

      await service.addPaymentAccount(CLIENT_A, {
        accountType: 'bank_account',
        bankName: 'Сбербанк',
        accountNumber: '40817810638050123456',
        verificationStatus: 'verified', // статус из тела игнорируется
        isActive: true,
      });

      const [values] = fake.argsOf('values') as [Record<string, unknown>];
      // Предварительного одобрения больше нет: реквизиты работают сразу, а
      // выключить их может владелец через is_active. Поле из тела не влияет.
      expect(values.verificationStatus).toBe('not_required');
      expect(values.isActive).toBe(true);
    });

    it('привязывает счёт к clientId из токена, а не из тела', async () => {
      fake.queue([], [row()]);

      await service.addPaymentAccount(CLIENT_A, {
        accountType: 'sbp',
        phoneSbp: '+79991234567',
        clientId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      });

      const [values] = fake.argsOf('values') as [Record<string, unknown>];
      expect(values.clientId).toBe(CLIENT_A);
    });

    it('не принимает полный номер карты', async () => {
      await expect(
        service.addPaymentAccount(CLIENT_A, {
          accountType: 'card',
          cardLast4: '4242424242424242',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('хранит карту как ****1234, полного номера в базе нет', async () => {
      fake.queue([], [row({ accountType: 'card', cardNumberMasked: '****4242' })]);

      await service.addPaymentAccount(CLIENT_A, {
        accountType: 'card',
        cardLast4: '4242',
        cardHolder: 'IVAN PETROV',
      });

      const [values] = fake.argsOf('values') as [Record<string, unknown>];
      expect(values.cardNumberMasked).toBe('****4242');
    });

    it.each([
      ['bank_account', {}],
      ['sbp', {}],
      ['paypal', {}],
      ['crypto', {}],
    ])('требует обязательные поля для %s', async (accountType) => {
      await expect(
        service.addPaymentAccount(CLIENT_A, { accountType }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('отвергает неизвестную криптосеть', async () => {
      await expect(
        service.addPaymentAccount(CLIENT_A, {
          accountType: 'crypto',
          cryptoAddress: 'bc1q…',
          cryptoType: 'доджикоин',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('деактивирует прежний счёт того же типа перед вставкой', async () => {
      fake.queue([], [row({ accountType: 'sbp' })]);

      await service.addPaymentAccount(CLIENT_A, {
        accountType: 'sbp',
        phoneSbp: '+79991234567',
      });

      const [patch] = fake.argsOf('set') as [Record<string, unknown>];
      expect(patch.isActive).toBe(false);
      const methods = fake.calls.map((c) => c.method);
      expect(methods.indexOf('update')).toBeGreaterThanOrEqual(0);
      expect(methods.indexOf('insert')).toBeGreaterThan(methods.indexOf('update'));
    });
  });

  describe('listPaymentAccounts', () => {
    it('маскирует номер счёта и не отдаёт лишних колонок', async () => {
      fake.queue([row()]);

      const [a] = await service.listPaymentAccounts(CLIENT_A);

      expect(a.accountNumber).toBe('****3456');
      expect(a).not.toHaveProperty('clientId');
      expect(a).not.toHaveProperty('phoneNumber');
    });

    it('отдаёт поля под теми же именами, что владельческая ручка', async () => {
      fake.queue([
        row({
          accountType: 'paypal',
          email: 'client@example.com',
          phoneForSbp: '+79991234567',
          cardNumberMasked: '****4242',
        }),
      ]);

      const [a] = await service.listPaymentAccounts(CLIENT_A);

      expect(a.paypalEmail).toBe('client@example.com');
      expect(a.phoneSbp).toBe('+79991234567');
      expect(a.cardLast4).toBe('4242');
    });
  });

  describe('deactivatePaymentAccount', () => {
    it('отключает свой счёт', async () => {
      fake.queue([row({ isActive: false })]);

      await expect(service.deactivatePaymentAccount(CLIENT_A, 'acc-1')).resolves.toMatchObject({
        isActive: false,
      });
    });

    it('не трогает чужой счёт', async () => {
      // Запрос идёт с фильтром по clientId, поэтому чужая строка не обновится
      // и вернётся пусто — наружу это 404.
      fake.queue([]);

      await expect(
        service.deactivatePaymentAccount(CLIENT_A, 'чужой-счёт'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
