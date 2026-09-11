import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFakeDb } from '../owner/fake-db.js';
import { PlatformService } from './platform.service.js';
import type { DirectMembersService } from '../direct-members/direct-members.service.js';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const INVOICE = '99999999-9999-9999-9999-999999999999';

const emptyDirect = {
  total: 0,
  declared: 0,
  pending: 0,
  dismissed: 0,
  base: 0,
  baseSelfReported: 0,
  baseFromTariff: 0,
  commission: 0,
  ids: [] as string[],
};

function build(direct: Partial<typeof emptyDirect> = {}) {
  const { db, fake } = createFakeDb();
  const directMembers = {
    summaryForPeriod: vi.fn().mockResolvedValue({ ...emptyDirect, ...direct }),
    stampBilled: vi.fn().mockResolvedValue(undefined),
  } as unknown as DirectMembersService;
  return { service: new PlatformService(db, directMembers), fake, directMembers };
}

/** Один клиент на тарифе с комиссией 10% и абонплатой 1000 ₽. */
function queueOneClient(fake: ReturnType<typeof build>['fake'], turnover: string, selfReported = '0') {
  fake.queue(
    [
      {
        id: CLIENT,
        planCode: 'pro',
        planName: 'Pro',
        priceMonth: '1000',
        commissionPct: '10',
        currency: 'RUB',
      },
    ],
    [{ turnover, selfReported }],
    [{ id: INVOICE, createdAt: new Date() }],
  );
}

describe('Счёт клиента с прямыми добавлениями', () => {
  let ctx: ReturnType<typeof build>;

  describe('без прямых добавлений', () => {
    beforeEach(() => {
      ctx = build();
    });

    it('счёт прежний: абонплата + комиссия с оборота', async () => {
      queueOneClient(ctx.fake, '5000');
      await ctx.service.generateInvoices({ start: '2026-09-01', end: '2026-10-01' });

      const values = ctx.fake.argsOf('values', 0)?.[0] as Record<string, unknown>;
      expect(values.amount).toBe('1500'); // 1000 абонплата + 500 комиссия
    });

    it('строки помечать нечем — в базу за этим не ходим', async () => {
      queueOneClient(ctx.fake, '5000');
      await ctx.service.generateInvoices({ start: '2026-09-01', end: '2026-10-01' });
      expect(ctx.directMembers.stampBilled).toHaveBeenCalledWith([], INVOICE);
    });
  });

  describe('с прямыми добавлениями', () => {
    beforeEach(() => {
      ctx = build({
        total: 3,
        declared: 2,
        pending: 1,
        base: 2990,
        baseSelfReported: 2000,
        baseFromTariff: 990,
        commission: 299,
        ids: ['a', 'b', 'c'],
      });
    });

    it('комиссия с них попадает в сумму счёта', async () => {
      queueOneClient(ctx.fake, '5000');
      await ctx.service.generateInvoices({ start: '2026-09-01', end: '2026-10-01' });

      const values = ctx.fake.argsOf('values', 0)?.[0] as Record<string, unknown>;
      // 1000 абонплата + 500 комиссия с оборота + 299 с прямых добавлений.
      expect(values.amount).toBe('1799');
    });

    it('в деталях видно, сколько человек и на чьём слове держится база', async () => {
      queueOneClient(ctx.fake, '5000');
      await ctx.service.generateInvoices({ start: '2026-09-01', end: '2026-10-01' });

      const values = ctx.fake.argsOf('values', 0)?.[0] as Record<string, unknown>;
      expect(values.details).toMatchObject({
        directMembers: 3,
        directMembersDeclared: 2,
        directMembersPending: 1,
        directBase: 2990,
        directBaseSelfReported: 2000,
        directBaseFromTariff: 990,
        directCommissionAmount: 299,
      });
    });

    it('вошедшие в счёт строки помечаются его номером', async () => {
      queueOneClient(ctx.fake, '5000');
      await ctx.service.generateInvoices({ start: '2026-09-01', end: '2026-10-01' });
      expect(ctx.directMembers.stampBilled).toHaveBeenCalledWith(['a', 'b', 'c'], INVOICE);
    });

    it('оборота нет вовсе — счёт всё равно выставляется за прямые добавления', async () => {
      queueOneClient(ctx.fake, '0');
      await ctx.service.generateInvoices({ start: '2026-09-01', end: '2026-10-01' });

      const values = ctx.fake.argsOf('values', 0)?.[0] as Record<string, unknown>;
      expect(values.amount).toBe('1299'); // 1000 + 0 + 299
    });
  });

  describe('оплаченный счёт', () => {
    it('состав задним числом не переписывается', async () => {
      // Конфликт по (клиент, период) обновляет счёт только пока он не оплачен;
      // если строк не вернулось — помечать нечего.
      ctx = build({ total: 1, base: 990, commission: 99, ids: ['a'] });
      ctx.fake.queue(
        [
          {
            id: CLIENT,
            planCode: 'pro',
            planName: 'Pro',
            priceMonth: '1000',
            commissionPct: '10',
            currency: 'RUB',
          },
        ],
        [{ turnover: '0', selfReported: '0' }],
        [], // оплаченный счёт: onConflictDoUpdate ... setWhere не вернул строк
      );
      await ctx.service.generateInvoices({ start: '2026-09-01', end: '2026-10-01' });
      expect(ctx.directMembers.stampBilled).not.toHaveBeenCalled();
    });
  });
});
