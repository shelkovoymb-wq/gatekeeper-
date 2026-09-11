import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createFakeDb } from '../owner/fake-db.js';
import { DirectMembersService } from './direct-members.service.js';

const CLIENT = '11111111-1111-1111-1111-111111111111';
const CHANNEL = '22222222-2222-2222-2222-222222222222';
const SUB = '33333333-3333-3333-3333-333333333333';
const ROW = '44444444-4444-4444-4444-444444444444';
const PLAN = '55555555-5555-5555-5555-555555555555';

function build() {
  const { db, fake } = createFakeDb();
  return { service: new DirectMembersService(db), fake };
}

describe('DirectMembersService', () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  describe('фиксация входа', () => {
    it('строка заводится на месяц обнаружения', async () => {
      await ctx.service.record({
        clientId: CLIENT,
        channelId: CHANNEL,
        subscriberId: SUB,
        now: new Date('2026-09-11T22:00:00Z'),
      });
      const values = ctx.fake.argsOf('values', 0)?.[0] as Record<string, unknown>;
      expect(values).toMatchObject({
        clientId: CLIENT,
        channelId: CHANNEL,
        subscriberId: SUB,
        periodMonth: '2026-09-01',
        status: 'pending',
      });
    });

    it('повтор в том же месяце счёт не задваивает', async () => {
      // Замок — UNIQUE (channel, subscriber, period) + onConflictDoNothing:
      // человека могли удалить и вернуть в тот же месяц, продажа одна.
      await ctx.service.record({ clientId: CLIENT, channelId: CHANNEL, subscriberId: SUB });
      const conflict = ctx.fake.argsOf('onConflictDoNothing', 0)?.[0] as {
        target?: unknown[];
      };
      expect(conflict?.target).toHaveLength(3);
    });
  });

  describe('оформление клиентом', () => {
    it('чужая запись не находится', async () => {
      ctx.fake.queue([]);
      await expect(ctx.service.declare(CLIENT, ROW, { amount: 1000 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('после выставленного счёта править нельзя', async () => {
      // Иначе состав счёта менялся бы задним числом молча.
      ctx.fake.queue([{ id: ROW, clientId: CLIENT, billedAt: new Date() }]);
      await expect(ctx.service.declare(CLIENT, ROW, { amount: 1000 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('чужой тариф не принимается', async () => {
      ctx.fake.queue([{ id: ROW, clientId: CLIENT, billedAt: null }], []);
      await expect(ctx.service.declare(CLIENT, ROW, { planId: PLAN })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('отрицательная сумма не принимается', async () => {
      ctx.fake.queue([{ id: ROW, clientId: CLIENT, billedAt: null }]);
      await expect(ctx.service.declare(CLIENT, ROW, { amount: -5 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('сумма и тариф сохраняются, отказ снимается', async () => {
      ctx.fake.queue(
        [{ id: ROW, clientId: CLIENT, billedAt: null, planId: null, note: null }],
        [{ id: PLAN }],
      );
      const res = await ctx.service.declare(CLIENT, ROW, { planId: PLAN, amount: 1500 });
      expect(res).toEqual({ id: ROW, status: 'declared' });

      const set = ctx.fake.argsOf('set', 0)?.[0] as Record<string, unknown>;
      expect(set).toMatchObject({
        status: 'declared',
        planId: PLAN,
        declaredAmount: '1500',
        dismissReason: null,
      });
    });

    it('нулевая сумма сохраняется как ноль, а не как «не указано»', async () => {
      // Клиент мог пустить человека бесплатно — это его право, и это не то же
      // самое, что промолчать.
      ctx.fake.queue([{ id: ROW, clientId: CLIENT, billedAt: null, declaredAmount: null }]);
      await ctx.service.declare(CLIENT, ROW, { amount: 0 });
      const set = ctx.fake.argsOf('set', 0)?.[0] as Record<string, unknown>;
      expect(set.declaredAmount).toBe('0');
    });
  });

  describe('отказ «это не продажа»', () => {
    it('без причины нельзя', async () => {
      ctx.fake.queue([{ id: ROW, clientId: CLIENT, billedAt: null }]);
      await expect(ctx.service.dismiss(CLIENT, ROW, '   ')).rejects.toThrow(BadRequestException);
    });

    it('причина сохраняется', async () => {
      ctx.fake.queue([{ id: ROW, clientId: CLIENT, billedAt: null }]);
      const res = await ctx.service.dismiss(CLIENT, ROW, 'это мой редактор');
      expect(res).toEqual({ id: ROW, status: 'dismissed' });
      const set = ctx.fake.argsOf('set', 0)?.[0] as Record<string, unknown>;
      expect(set).toMatchObject({ status: 'dismissed', dismissReason: 'это мой редактор' });
    });

    it('после выставленного счёта отказать нельзя', async () => {
      ctx.fake.queue([{ id: ROW, clientId: CLIENT, billedAt: new Date() }]);
      await expect(ctx.service.dismiss(CLIENT, ROW, 'сотрудник')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('итог для счёта', () => {
    it('неоформленный считается по цене тарифа, отклонённый не считается', async () => {
      ctx.fake.queue([
        { id: 'a', status: 'declared', declaredAmount: '2000', fallbackPrice: '990' },
        { id: 'b', status: 'pending', declaredAmount: null, fallbackPrice: '990' },
        { id: 'c', status: 'dismissed', declaredAmount: null, fallbackPrice: '990' },
      ]);
      const s = await ctx.service.summaryForPeriod(CLIENT, '2026-09-01', '2026-10-01', 10);
      expect(s.base).toBe(2990);
      expect(s.commission).toBe(299);
      expect(s.pending).toBe(1);
      expect(s.dismissed).toBe(1);
      expect(s.ids).toEqual(['a', 'b', 'c']);
    });
  });

  describe('пометка «вошло в счёт»', () => {
    it('без строк не ходит в базу', async () => {
      await ctx.service.stampBilled([], 'inv-1');
      expect(ctx.fake.calls).toHaveLength(0);
    });

    it('проставляет счёт и базу начисления', async () => {
      await ctx.service.stampBilled(['a', 'b'], 'inv-1');
      const set = ctx.fake.argsOf('set', 0)?.[0] as Record<string, unknown>;
      expect(set.billedInvoiceId).toBe('inv-1');
      expect(set.billedAt).toBeInstanceOf(Date);
    });
  });
});
