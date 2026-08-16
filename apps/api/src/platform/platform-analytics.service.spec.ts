import { describe, it, expect, beforeEach } from 'vitest';
import { PlatformAnalyticsService } from './platform-analytics.service.js';
import { createFakeDb, type FakeDb } from '../owner/fake-db.js';

/**
 * Сервис аналитики гоняем на мини-дубле drizzle: проверяем не SQL, а то, как
 * сырые строки Postgres превращаются в цифры отчёта — где комиссия, где остаток
 * клиента и что попадает в реестр «кто кому заплатил».
 */
describe('PlatformAnalyticsService', () => {
  let service: PlatformAnalyticsService;
  let fake: FakeDb;

  const totalsRow = {
    turnover: '10000.00',
    commission: '1000.00',
    payments_count: '4',
    payers: '3',
    refunded: '500.00',
    refunds_count: '1',
    failed_count: '2',
    paying_clients: '2',
  };

  /** Кладём ответы в том порядке, в каком сервис ходит в БД. */
  function queueReport(over: Partial<Record<string, unknown[]>> = {}) {
    fake.queue(
      over.totals ?? [totalsRow],
      over.trend ?? [],
      over.clients ?? [],
      over.channels ?? [],
      over.providers ?? [],
      over.ledger ?? [],
      over.settlements ?? [],
    );
  }

  beforeEach(() => {
    const created = createFakeDb();
    fake = created.fake;
    service = new PlatformAnalyticsService(created.db);
  });

  describe('итоги', () => {
    it('считает остаток клиентов, средний чек и эффективную ставку', async () => {
      queueReport();
      const report = await service.report({ from: '2026-08-01', to: '2026-08-31' });

      expect(report.totals).toMatchObject({
        turnover: 10000,
        commission: 1000,
        clientNet: 9000,
        paymentsCount: 4,
        payers: 3,
        avgCheck: 2500,
        refunded: 500,
        effectiveCommissionPct: 10,
      });
    });

    it('не делит на ноль на пустом периоде', async () => {
      queueReport({
        totals: [
          {
            turnover: '0',
            commission: '0',
            payments_count: '0',
            payers: '0',
            refunded: '0',
            refunds_count: '0',
            failed_count: '0',
            paying_clients: '0',
          },
        ],
      });
      const report = await service.report({});
      expect(report.totals.avgCheck).toBe(0);
      expect(report.totals.effectiveCommissionPct).toBe(0);
    });

    it('добавляет к итогам расчёты клиентов с платформой', async () => {
      queueReport({
        settlements: [
          { id: 'i1', client_id: 'c1', client_name: 'Клуб', period_start: '2026-08-01', period_end: '2026-09-01', amount: '3000.00', status: 'paid', details: { subscriptionAmount: 1000, commissionAmount: 2000, turnoverBase: 20000, paidAt: '2026-09-02T10:00:00Z' } },
          { id: 'i2', client_id: 'c2', client_name: 'Школа', period_start: '2026-08-01', period_end: '2026-09-01', amount: '1500.00', status: 'overdue', details: {} },
        ],
      });
      const report = await service.report({ from: '2026-08-01', to: '2026-08-31' });

      expect(report.totals.invoicedToClients).toBe(4500);
      expect(report.totals.paidByClients).toBe(3000);
      expect(report.totals.dueFromClients).toBe(1500);
      expect(report.settlements[0]).toMatchObject({
        clientName: 'Клуб',
        subscriptionAmount: 1000,
        commissionAmount: 2000,
        turnoverBase: 20000,
        paidAt: '2026-09-02T10:00:00Z',
      });
    });
  });

  describe('динамика', () => {
    it('достраивает дни без платежей нулями', async () => {
      queueReport({
        trend: [
          { bucket: '2026-08-02', turnover: '1000.00', commission: '100.00', payments_count: '2', payers: '2', refunded: '0' },
        ],
      });
      const report = await service.report({ from: '2026-08-01', to: '2026-08-03' });

      expect(report.trend).toHaveLength(3);
      expect(report.trend.map((p) => p.turnover)).toEqual([0, 1000, 0]);
      expect(report.trend[1].label).toBe('02.08');
    });
  });

  describe('разрез по клиентам', () => {
    it('считает комиссию по ставке тарифа клиента', async () => {
      queueReport({
        clients: [
          {
            id: 'c1',
            name: 'Клуб инвесторов',
            plan_status: 'active',
            created_at: '2026-01-10T00:00:00Z',
            plan_code: 'pro',
            plan_name: 'Pro',
            commission_pct: '5.00',
            price_month: '2990.00',
            channels: '3',
            plans: '2',
            active_subs: '120',
            turnover: '50000.00',
            payments_count: '25',
            payers: '20',
            refunded: '0',
            last_payment_at: '2026-08-15T12:00:00Z',
          },
        ],
      });
      const report = await service.report({});

      expect(report.clients[0]).toMatchObject({
        name: 'Клуб инвесторов',
        planName: 'Pro',
        commissionPct: 5,
        turnover: 50000,
        commission: 2500,
        clientNet: 47500,
        avgCheck: 2000,
        channels: 3,
        activeSubscriptions: 120,
      });
    });
  });

  describe('разрез по каналам', () => {
    it('отдаёт название канала, его клиента и долю оборота', async () => {
      queueReport({
        channels: [
          {
            id: 'ch1',
            title: 'VIP-сигналы',
            type: 'channel',
            bot_status: 'ok',
            tg_chat_id: '-1001',
            client_id: 'c1',
            client_name: 'Клуб инвесторов',
            created_at: '2026-02-01T00:00:00Z',
            plans: '2',
            active_subs: '80',
            turnover: '12000.00',
            commission: '600.00',
            gross_turnover: '24000.00',
            payments_count: '8',
            payers: '7',
            last_payment_at: '2026-08-14T09:00:00Z',
          },
        ],
      });
      const report = await service.report({});

      expect(report.channels[0]).toMatchObject({
        title: 'VIP-сигналы',
        clientName: 'Клуб инвесторов',
        turnover: 12000,
        commission: 600,
        clientNet: 11400,
        grossTurnover: 24000,
        avgCheck: 1500,
        activeSubscriptions: 80,
      });
    });
  });

  describe('реестр платежей', () => {
    it('показывает кто, кому и сколько заплатил', async () => {
      queueReport({
        ledger: [
          {
            id: 'p1',
            created_at: '2026-08-14T09:00:00Z',
            amount: '1500.00',
            currency: 'RUB',
            status: 'succeeded',
            kind: 'purchase',
            provider: 'yookassa',
            provider_payment_id: 'yk-1',
            client_id: 'c1',
            client_name: 'Клуб инвесторов',
            commission_pct: '10.00',
            payer_tg_id: '778899',
            payer_username: 'ivan',
            payer_name: 'Иван',
            plan_name: 'Месяц',
            plan_period_days: '30',
            channel_titles: ['VIP-сигналы', 'Разборы'],
          },
        ],
      });
      const report = await service.report({});

      expect(report.ledger.rows[0]).toMatchObject({
        payerUsername: 'ivan',
        payerName: 'Иван',
        clientName: 'Клуб инвесторов',
        planName: 'Месяц',
        channels: ['VIP-сигналы', 'Разборы'],
        amount: 1500,
        commission: 150,
        clientNet: 1350,
      });
    });

    it('не начисляет комиссию на неуспешный платёж', async () => {
      queueReport({
        ledger: [
          {
            id: 'p2',
            created_at: '2026-08-14T09:00:00Z',
            amount: '1500.00',
            currency: 'RUB',
            status: 'refunded',
            kind: 'refund',
            provider: 'yookassa',
            provider_payment_id: 'yk-2',
            client_id: 'c1',
            client_name: 'Клуб инвесторов',
            commission_pct: '10.00',
            channel_titles: null,
          },
        ],
      });
      const report = await service.report({});

      expect(report.ledger.rows[0]).toMatchObject({ commission: 0, clientNet: 0, channels: [] });
    });
  });

  describe('провайдеры', () => {
    it('считает долю каждого провайдера в обороте', async () => {
      queueReport({
        providers: [
          { provider: 'yookassa', turnover: '7500.00', payments_count: '3', refunds_count: '0', failed_count: '1' },
          { provider: 'stars', turnover: '2500.00', payments_count: '1', refunds_count: '0', failed_count: '0' },
        ],
      });
      const report = await service.report({});

      expect(report.providers.map((p) => p.sharePct)).toEqual([75, 25]);
    });
  });

  describe('фильтры', () => {
    it('игнорирует clientId, который не является UUID', async () => {
      queueReport();
      const report = await service.report({ clientId: "'; drop table payments; --" });
      expect(report.filters.clientId).toBeNull();
    });

    it('принимает корректный clientId', async () => {
      queueReport();
      const id = '11111111-2222-3333-4444-555555555555';
      const report = await service.report({ clientId: id });
      expect(report.filters.clientId).toBe(id);
    });

    it('ограничивает размер реестра', async () => {
      queueReport();
      const report = await service.report({ limit: '999999' });
      expect(report.ledger.limit).toBe(20_000);
    });

    it('возвращает описание методики расчёта', async () => {
      queueReport();
      const report = await service.report({});
      expect(report.methodology.commission).toContain('commission_pct');
    });
  });
});
