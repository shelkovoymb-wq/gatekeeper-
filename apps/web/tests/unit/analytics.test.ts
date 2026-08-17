import { describe, it, expect } from 'vitest'
import {
  analyticsQueryString,
  channelsSheet,
  clientsSheet,
  isoDay,
  ledgerSheet,
  payerLabel,
  providerLabel,
  reportWorkbook,
  statusLabel,
  summarySheet,
  type AnalyticsReport,
  type LedgerRow,
} from '@/lib/analytics'
import { buildWorkbookXml } from '@/lib/xls'

const ledgerRow: LedgerRow = {
  id: 'p1',
  createdAt: '2026-08-14T09:00:00Z',
  amount: 1500,
  currency: 'RUB',
  status: 'succeeded',
  kind: 'purchase',
  provider: 'yookassa',
  providerPaymentId: 'yk-1',
  clientId: 'c1',
  clientName: 'Клуб инвесторов',
  commissionPct: 10,
  commission: 150,
  clientNet: 1350,
  payerTgId: '778899',
  payerUsername: 'ivan',
  payerName: 'Иван',
  planName: 'Месяц',
  planPeriodDays: 30,
  channels: ['VIP-сигналы', 'Разборы'],
}

const report: AnalyticsReport = {
  period: { from: '2026-08-01', to: '2026-08-16', granularity: 'day', days: 16 },
  filters: { clientId: null },
  totals: {
    turnover: 10000,
    commission: 1000,
    clientNet: 9000,
    paymentsCount: 4,
    payers: 3,
    payingClients: 2,
    avgCheck: 2500,
    refunded: 0,
    refundsCount: 0,
    failedCount: 1,
    effectiveCommissionPct: 10,
    invoicedToClients: 4500,
    paidByClients: 3000,
    dueFromClients: 1500,
  },
  trend: [
    { bucket: '2026-08-01', label: '01.08', turnover: 1000, commission: 100, paymentsCount: 1, payers: 1, refunded: 0 },
  ],
  clients: [
    {
      id: 'c1',
      name: 'Клуб инвесторов',
      planCode: 'pro',
      planName: 'Pro',
      planStatus: 'active',
      commissionPct: 10,
      priceMonth: 2990,
      channels: 2,
      plans: 3,
      activeSubscriptions: 120,
      turnover: 10000,
      commission: 1000,
      clientNet: 9000,
      paymentsCount: 4,
      payers: 3,
      avgCheck: 2500,
      refunded: 0,
      lastPaymentAt: '2026-08-14T09:00:00Z',
      createdAt: '2026-01-10T00:00:00Z',
    },
  ],
  channels: [
    {
      id: 'ch1',
      title: 'VIP-сигналы',
      type: 'channel',
      botStatus: 'ok',
      tgChatId: '-1001',
      clientId: 'c1',
      clientName: 'Клуб инвесторов',
      plans: 2,
      activeSubscriptions: 80,
      turnover: 6000,
      commission: 600,
      clientNet: 5400,
      grossTurnover: 12000,
      paymentsCount: 3,
      payers: 3,
      avgCheck: 2000,
      lastPaymentAt: '2026-08-14T09:00:00Z',
      createdAt: '2026-02-01T00:00:00Z',
    },
  ],
  providers: [
    { provider: 'yookassa', turnover: 7500, paymentsCount: 3, refundsCount: 0, failedCount: 1, sharePct: 75 },
    { provider: 'stars', turnover: 2500, paymentsCount: 1, refundsCount: 0, failedCount: 0, sharePct: 25 },
  ],
  ledger: { rows: [ledgerRow], limit: 500, truncated: false },
  settlements: [
    {
      id: 'i1',
      clientId: 'c1',
      clientName: 'Клуб инвесторов',
      periodStart: '2026-08-01',
      periodEnd: '2026-09-01',
      amount: 3990,
      status: 'paid',
      subscriptionAmount: 2990,
      commissionAmount: 1000,
      turnoverBase: 10000,
      paidAt: '2026-09-02T10:00:00Z',
      createdAt: '2026-09-01T00:00:00Z',
    },
  ],
  methodology: {
    turnover: 'Сумма платежей в статусе succeeded',
    commission: 'Оборот × commission_pct',
    clientNet: 'Оборот минус комиссия',
    channelTurnover: 'Платёж делится поровну между каналами тарифа',
    channelGross: 'Полные суммы платежей по тарифам канала',
    settlements: 'Счета платформы клиентам',
  },
}

describe('reportWorkbook', () => {
  const sheets = reportWorkbook(report)

  it('раскладывает отчёт по листам', () => {
    expect(sheets.map((s) => s.name)).toEqual([
      'Сводка',
      'Динамика',
      'Клиенты',
      'Каналы',
      'Платежи',
      'Провайдеры',
      'Расчёты с платформой',
    ])
  })

  it('собирается в валидную книгу Excel', () => {
    const xml = buildWorkbookXml(sheets)
    expect(xml.match(/<Worksheet /g)).toHaveLength(7)
    expect(xml).toContain('Клуб инвесторов')
    expect(xml).toContain('VIP-сигналы')
  })

  it('в сводке видно, как посчитана каждая цифра', () => {
    const summary = summarySheet(report)
    const notes = summary.rows.map((r) => r.note).join(' ')
    expect(notes).toContain('commission_pct')
    expect(summary.rows.find((r) => r.metric === 'Комиссия платформы')?.value).toBe(1000)
  })

  it('в преамбуле стоит период и фильтр', () => {
    const summary = summarySheet(report)
    const preamble = Object.fromEntries(summary.preamble ?? [])
    expect(preamble['Период']).toBe('2026-08-01 — 2026-08-16')
    expect(preamble['Фильтр по клиенту']).toBe('Все клиенты')
  })

  it('лист платежей отвечает на вопрос «кто кому сколько»', () => {
    const sheet = ledgerSheet(report)
    const headers = sheet.columns.map((c) => c.header)
    expect(headers).toContain('Кто заплатил')
    expect(headers).toContain('Кому — клиент')
    expect(headers).toContain('Каналы доступа')

    const byHeader = (h: string) => sheet.columns.find((c) => c.header === h)!.value(ledgerRow)
    expect(byHeader('Кто заплатил')).toBe('@ivan')
    expect(byHeader('Кому — клиент')).toBe('Клуб инвесторов')
    expect(byHeader('Каналы доступа')).toBe('VIP-сигналы, Разборы')
    expect(byHeader('Комиссия платформы')).toBe(150)
  })

  it('предупреждает в файле, если реестр обрезан лимитом', () => {
    const truncated = { ...report, ledger: { ...report.ledger, truncated: true } }
    expect(Object.fromEntries(ledgerSheet(truncated).preamble ?? [])['Внимание']).toContain('500')
  })

  it('в листе каналов есть и доля, и полный оборот тарифов', () => {
    const headers = channelsSheet(report).columns.map((c) => c.header)
    expect(headers).toContain('Оборот (доля тарифов)')
    expect(headers).toContain('Оборот тарифов целиком')
  })

  it('переводит статусы клиентов на русский', () => {
    const sheet = clientsSheet(report)
    const status = sheet.columns.find((c) => c.header === 'Статус тарифа')!.value(report.clients[0])
    expect(status).toBe('Активен')
  })

  it('переживает пустой отчёт', () => {
    const empty: AnalyticsReport = {
      ...report,
      trend: [],
      clients: [],
      channels: [],
      providers: [],
      ledger: { rows: [], limit: 500, truncated: false },
      settlements: [],
    }
    expect(() => buildWorkbookXml(reportWorkbook(empty))).not.toThrow()
  })
})

describe('подписи', () => {
  it('плательщик — это @username, имя или telegram id', () => {
    expect(payerLabel(ledgerRow)).toBe('@ivan')
    expect(payerLabel({ ...ledgerRow, payerUsername: null })).toBe('Иван')
    expect(payerLabel({ ...ledgerRow, payerUsername: null, payerName: null })).toBe('ID 778899')
    expect(
      payerLabel({ ...ledgerRow, payerUsername: null, payerName: null, payerTgId: null }),
    ).toBe('Аноним')
  })

  it('провайдеры и статусы переводятся, незнакомые остаются как есть', () => {
    expect(providerLabel('yookassa')).toBe('ЮKassa')
    expect(providerLabel('невиданный')).toBe('невиданный')
    expect(statusLabel('succeeded')).toBe('Проведён')
    expect(statusLabel('нечто')).toBe('нечто')
  })
})

describe('параметры запроса', () => {
  it('автоматическую детализацию на бэкенд не шлём', () => {
    const qs = analyticsQueryString({ from: '2026-08-01', to: '2026-08-16', granularity: 'auto', clientId: '' })
    expect(qs).toBe('from=2026-08-01&to=2026-08-16')
  })

  it('передаёт фильтры и лимит', () => {
    const qs = analyticsQueryString({
      from: '2026-08-01',
      to: '2026-08-16',
      granularity: 'week',
      clientId: 'c1',
      limit: 5000,
    })
    expect(qs).toContain('granularity=week')
    expect(qs).toContain('clientId=c1')
    expect(qs).toContain('limit=5000')
  })
})

describe('isoDay', () => {
  it('отсчитывает дни назад в локальной зоне', () => {
    const now = new Date(2026, 7, 16, 12, 0, 0)
    expect(isoDay(0, now)).toBe('2026-08-16')
    expect(isoDay(29, now)).toBe('2026-07-18')
  })
})
