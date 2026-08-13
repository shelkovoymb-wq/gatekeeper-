import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { OwnerPayoutsController } from './owner-payouts.controller.js';
import type { OwnerPayoutsService } from './owner-payouts.service.js';
import type { AuthContext } from '../auth/auth.types.js';

/** Владелец платформы: role=owner и без привязки к клиенту. */
const owner = { role: 'owner', clientId: null } as unknown as AuthContext;
/** Админ клиента — к владельческим реквизитам доступа быть не должно. */
const clientAdmin = { role: 'client_admin', clientId: 'client_1' } as unknown as AuthContext;
/** Owner-токен с clientId: имперсонация клиента, к кассе платформы не пускаем. */
const ownerScopedToClient = { role: 'owner', clientId: 'client_1' } as unknown as AuthContext;

describe('OwnerPayoutsController', () => {
  let controller: OwnerPayoutsController;
  let service: OwnerPayoutsService;

  beforeEach(() => {
    service = {
      addPaymentAccount: vi.fn().mockResolvedValue({ id: 'acc_1' }),
      listPaymentAccounts: vi.fn().mockResolvedValue([]),
      getPaymentAccount: vi.fn().mockResolvedValue({ id: 'acc_1' }),
      verifyAccount: vi.fn().mockResolvedValue({ id: 'acc_1' }),
      deactivateAccount: vi.fn().mockResolvedValue({ id: 'acc_1' }),
      createPayout: vi.fn().mockResolvedValue({ id: 'payout_1' }),
      listPayouts: vi.fn().mockResolvedValue([]),
      getPayout: vi.fn().mockResolvedValue({ id: 'payout_1' }),
      getPayoutStats: vi.fn().mockResolvedValue({ pending: 0 }),
    } as unknown as OwnerPayoutsService;

    controller = new OwnerPayoutsController(service);
  });

  /** Каждый эндпоинт: как его дёрнуть от имени произвольного вызывающего. */
  const endpoints: [string, (auth: AuthContext) => unknown][] = [
    ['addPaymentAccount', (a) => controller.addPaymentAccount(a, { accountType: 'card' })],
    ['listPaymentAccounts', (a) => controller.listPaymentAccounts(a)],
    ['getPaymentAccount', (a) => controller.getPaymentAccount(a, 'acc_1')],
    ['verifyAccount', (a) => controller.verifyAccount(a, 'acc_1')],
    ['deactivateAccount', (a) => controller.deactivateAccount(a, 'acc_1')],
    [
      'createPayout',
      (a) => controller.createPayout(a, { accountId: 'acc_1', invoiceIds: ['i'], amount: 1 }),
    ],
    ['listPayouts', (a) => controller.listPayouts(a)],
    ['getPayout', (a) => controller.getPayout(a, 'payout_1')],
    ['getPayoutStats', (a) => controller.getPayoutStats(a)],
  ];

  describe('доступ', () => {
    it.each(endpoints)('%s закрыт для админа клиента', (_name, call) => {
      expect(() => call(clientAdmin)).toThrow(ForbiddenException);
    });

    it.each(endpoints)('%s закрыт для owner-токена с clientId', (_name, call) => {
      expect(() => call(ownerScopedToClient)).toThrow(ForbiddenException);
    });

    it.each(endpoints)('%s открыт владельцу платформы', async (_name, call) => {
      await expect(call(owner)).resolves.toBeDefined();
    });
  });

  describe('проброс аргументов', () => {
    it('createPayout разворачивает тело в позиционные аргументы сервиса', async () => {
      await controller.createPayout(owner, {
        accountId: 'acc_1',
        invoiceIds: ['inv_1', 'inv_2'],
        amount: 50000,
      });

      expect(service.createPayout).toHaveBeenCalledWith('acc_1', ['inv_1', 'inv_2'], 50000);
    });

    it('listPayouts передаёт фильтр статуса', async () => {
      await controller.listPayouts(owner, 'completed');
      expect(service.listPayouts).toHaveBeenCalledWith('completed');
    });

    it('verifyAccount передаёт id счёта', async () => {
      await controller.verifyAccount(owner, 'acc_42');
      expect(service.verifyAccount).toHaveBeenCalledWith('acc_42');
    });
  });
});
