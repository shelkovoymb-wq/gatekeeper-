/**
 * Типы отчёта платформы и сборка книги Excel из него.
 *
 * Логика выгрузки живёт здесь, а не в компоненте: так её можно проверить
 * тестами и переиспользовать для выгрузки отдельной таблицы.
 */
import type { Sheet } from './xls'

export interface AnalyticsPeriod {
  from: string
  to: string
  granularity: 'day' | 'week' | 'month'
  days: number
}

export interface AnalyticsTotals {
  turnover: number
  commission: number
  clientNet: number
  paymentsCount: number
  payers: number
  payingClients: number
  avgCheck: number
  refunded: number
  refundsCount: number
  failedCount: number
  effectiveCommissionPct: number
  invoicedToClients: number
  paidByClients: number
  dueFromClients: number
}

export interface TrendPoint {
  bucket: string
  label: string
  turnover: number
  commission: number
  paymentsCount: number
  payers: number
  refunded: number
}

export interface ClientRow {
  id: string
  name: string
  planCode: string | null
  planName: string | null
  planStatus: string | null
  commissionPct: number
  priceMonth: number
  channels: number
  plans: number
  activeSubscriptions: number
  turnover: number
  commission: number
  clientNet: number
  paymentsCount: number
  payers: number
  avgCheck: number
  refunded: number
  lastPaymentAt: string | null
  createdAt: string | null
}

export interface ChannelRow {
  id: string
  title: string
  type: string
  botStatus: string | null
  tgChatId: string | null
  clientId: string
  clientName: string
  plans: number
  activeSubscriptions: number
  turnover: number
  commission: number
  clientNet: number
  grossTurnover: number
  paymentsCount: number
  payers: number
  avgCheck: number
  lastPaymentAt: string | null
  createdAt: string | null
}

export interface ProviderRow {
  provider: string
  turnover: number
  paymentsCount: number
  refundsCount: number
  failedCount: number
  sharePct: number
}

export interface LedgerRow {
  id: string
  createdAt: string | null
  amount: number
  currency: string
  status: string
  kind: string
  provider: string
  providerPaymentId: string | null
  clientId: string
  clientName: string
  commissionPct: number
  commission: number
  clientNet: number
  payerTgId: string | null
  payerUsername: string | null
  payerName: string | null
  planName: string | null
  planPeriodDays: number | null
  channels: string[]
}

export interface SettlementRow {
  id: string
  clientId: string
  clientName: string
  periodStart: string
  periodEnd: string
  amount: number
  status: string
  subscriptionAmount: number
  commissionAmount: number
  turnoverBase: number
  paidAt: string | null
  createdAt: string | null
}

export interface AnalyticsReport {
  period: AnalyticsPeriod
  filters: { clientId: string | null }
  totals: AnalyticsTotals
  trend: TrendPoint[]
  clients: ClientRow[]
  channels: ChannelRow[]
  providers: ProviderRow[]
  ledger: { rows: LedgerRow[]; limit: number; truncated: boolean }
  settlements: SettlementRow[]
  methodology: Record<string, string>
}

export const PROVIDER_LABELS: Record<string, string> = {
  yookassa: 'ЮKassa',
  cloudpayments: 'CloudPayments',
  robokassa: 'Robokassa',
  prodamus: 'Prodamus',
  stars: 'Telegram Stars',
  cryptobot: 'CryptoBot',
  direct: 'Прямой перевод',
  manual: 'Вручную',
  unknown: 'Не указан',
}

export const STATUS_LABELS: Record<string, string> = {
  // платежи
  succeeded: 'Проведён',
  pending: 'В ожидании',
  failed: 'Ошибка',
  refunded: 'Возврат',
  cancelled: 'Отменён',
  // счета платформы
  paid: 'Оплачен',
  overdue: 'Просрочен',
  void: 'Аннулирован',
  // тарифы клиентов
  active: 'Активен',
  trialing: 'Пробный период',
  past_due: 'Просрочен',
  canceled: 'Отменён',
}

export const GRANULARITY_LABELS: Record<AnalyticsPeriod['granularity'], string> = {
  day: 'по дням',
  week: 'по неделям',
  month: 'по месяцам',
}

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

/** Подпись плательщика: @username, имя или telegram id — что есть. */
export function payerLabel(row: LedgerRow): string {
  if (row.payerUsername) return `@${row.payerUsername}`
  if (row.payerName) return row.payerName
  if (row.payerTgId) return `ID ${row.payerTgId}`
  return 'Аноним'
}

const dayMs = 86_400_000

/** Локальная дата в формате YYYY-MM-DD со сдвигом на N дней назад. */
export function isoDay(offsetDays = 0, now: Date = new Date()): string {
  const d = new Date(now.getTime() - offsetDays * dayMs)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface PeriodPreset {
  code: string
  label: string
  from: (now?: Date) => string
}

/** Быстрые периоды в фильтре. «Всё время» намеренно берёт дату заведомо раньше запуска. */
export const PERIOD_PRESETS: PeriodPreset[] = [
  { code: '7d', label: '7 дней', from: (now) => isoDay(6, now) },
  { code: '30d', label: '30 дней', from: (now) => isoDay(29, now) },
  { code: '90d', label: '90 дней', from: (now) => isoDay(89, now) },
  { code: '365d', label: 'Год', from: (now) => isoDay(364, now) },
  { code: 'all', label: 'Всё время', from: () => '2015-01-01' },
]

export interface AnalyticsQuery {
  from: string
  to: string
  granularity: string
  clientId: string
  limit?: number
}

export function analyticsQueryString(q: AnalyticsQuery): string {
  const params = new URLSearchParams({ from: q.from, to: q.to })
  if (q.granularity && q.granularity !== 'auto') params.set('granularity', q.granularity)
  if (q.clientId) params.set('clientId', q.clientId)
  if (q.limit) params.set('limit', String(q.limit))
  return params.toString()
}

// ─── Выгрузка в Excel ────────────────────────────────────────────────────────

const dash = (v: string | null | undefined) => v ?? '—'

function periodPreamble(report: AnalyticsReport): Array<[string, string | number]> {
  const client = report.filters.clientId
    ? report.clients.find((c) => c.id === report.filters.clientId)?.name ?? report.filters.clientId
    : 'Все клиенты'
  return [
    ['Отчёт', 'Gatekeeper — статистика платформы'],
    ['Период', `${report.period.from} — ${report.period.to}`],
    ['Детализация', GRANULARITY_LABELS[report.period.granularity]],
    ['Фильтр по клиенту', client],
    ['Выгружено', new Date().toLocaleString('ru-RU')],
  ]
}

export function summarySheet(report: AnalyticsReport): Sheet<{ metric: string; value: number | string; note: string }> {
  const t = report.totals
  const rows: Array<{ metric: string; value: number | string; note: string }> = [
    { metric: 'Оборот клиентов', value: t.turnover, note: report.methodology.turnover ?? '' },
    { metric: 'Комиссия платформы', value: t.commission, note: report.methodology.commission ?? '' },
    { metric: 'Остаётся клиентам', value: t.clientNet, note: report.methodology.clientNet ?? '' },
    { metric: 'Эффективная ставка комиссии, %', value: t.effectiveCommissionPct, note: 'Комиссия ÷ оборот' },
    { metric: 'Успешных платежей', value: t.paymentsCount, note: '' },
    { metric: 'Плательщиков', value: t.payers, note: 'Уникальные подписчики' },
    { metric: 'Клиентов с оборотом', value: t.payingClients, note: '' },
    { metric: 'Средний чек', value: t.avgCheck, note: 'Оборот ÷ число платежей' },
    { metric: 'Возвраты', value: t.refunded, note: `${t.refundsCount} шт.` },
    { metric: 'Неуспешные платежи', value: t.failedCount, note: '' },
    { metric: 'Выставлено счетов платформы', value: t.invoicedToClients, note: report.methodology.settlements ?? '' },
    { metric: 'Оплачено клиентами', value: t.paidByClients, note: '' },
    { metric: 'Долг клиентов платформе', value: t.dueFromClients, note: '' },
  ]
  return {
    name: 'Сводка',
    preamble: periodPreamble(report),
    columns: [
      { header: 'Показатель', value: (r) => r.metric, width: 240 },
      { header: 'Значение', value: (r) => r.value, type: 'money', width: 130 },
      { header: 'Как считается', value: (r) => r.note, width: 460 },
    ],
    rows,
  }
}

export function trendSheet(report: AnalyticsReport): Sheet<TrendPoint> {
  return {
    name: 'Динамика',
    columns: [
      { header: 'Период', value: (r) => r.bucket, width: 110 },
      { header: 'Подпись', value: (r) => r.label, width: 100 },
      { header: 'Оборот', value: (r) => r.turnover, type: 'money' },
      { header: 'Комиссия платформы', value: (r) => r.commission, type: 'money', width: 160 },
      { header: 'Остаётся клиентам', value: (r) => r.turnover - r.commission, type: 'money', width: 160 },
      { header: 'Платежей', value: (r) => r.paymentsCount, type: 'number', width: 100 },
      { header: 'Плательщиков', value: (r) => r.payers, type: 'number', width: 120 },
      { header: 'Возвраты', value: (r) => r.refunded, type: 'money' },
    ],
    rows: report.trend,
  }
}

export function clientsSheet(report: AnalyticsReport): Sheet<ClientRow> {
  return {
    name: 'Клиенты',
    columns: [
      { header: 'Клиент', value: (r) => r.name, width: 220 },
      { header: 'Тариф платформы', value: (r) => dash(r.planName), width: 150 },
      { header: 'Статус тарифа', value: (r) => statusLabel(r.planStatus ?? ''), width: 130 },
      { header: 'Ставка комиссии, %', value: (r) => r.commissionPct, type: 'percent', width: 150 },
      { header: 'Абонплата в месяц', value: (r) => r.priceMonth, type: 'money', width: 150 },
      { header: 'Каналов', value: (r) => r.channels, type: 'number', width: 90 },
      { header: 'Тарифов', value: (r) => r.plans, type: 'number', width: 90 },
      { header: 'Активных подписок', value: (r) => r.activeSubscriptions, type: 'number', width: 150 },
      { header: 'Оборот', value: (r) => r.turnover, type: 'money' },
      { header: 'Комиссия платформы', value: (r) => r.commission, type: 'money', width: 160 },
      { header: 'Остаётся клиенту', value: (r) => r.clientNet, type: 'money', width: 150 },
      { header: 'Платежей', value: (r) => r.paymentsCount, type: 'number', width: 100 },
      { header: 'Плательщиков', value: (r) => r.payers, type: 'number', width: 120 },
      { header: 'Средний чек', value: (r) => r.avgCheck, type: 'money', width: 120 },
      { header: 'Возвраты', value: (r) => r.refunded, type: 'money' },
      { header: 'Последний платёж', value: (r) => r.lastPaymentAt, type: 'date', width: 150 },
      { header: 'Клиент с', value: (r) => r.createdAt, type: 'date', width: 150 },
    ],
    rows: report.clients,
  }
}

export function channelsSheet(report: AnalyticsReport): Sheet<ChannelRow> {
  return {
    name: 'Каналы',
    columns: [
      { header: 'Канал', value: (r) => r.title, width: 220 },
      { header: 'Клиент', value: (r) => r.clientName, width: 200 },
      { header: 'Тип', value: (r) => (r.type === 'group' ? 'Группа' : 'Канал'), width: 90 },
      { header: 'Telegram ID', value: (r) => dash(r.tgChatId), width: 140 },
      { header: 'Тарифов с каналом', value: (r) => r.plans, type: 'number', width: 150 },
      { header: 'Активных подписок', value: (r) => r.activeSubscriptions, type: 'number', width: 150 },
      { header: 'Оборот (доля тарифов)', value: (r) => r.turnover, type: 'money', width: 180 },
      { header: 'Комиссия платформы', value: (r) => r.commission, type: 'money', width: 160 },
      { header: 'Остаётся клиенту', value: (r) => r.clientNet, type: 'money', width: 150 },
      { header: 'Оборот тарифов целиком', value: (r) => r.grossTurnover, type: 'money', width: 190 },
      { header: 'Платежей', value: (r) => r.paymentsCount, type: 'number', width: 100 },
      { header: 'Плательщиков', value: (r) => r.payers, type: 'number', width: 120 },
      { header: 'Средний чек', value: (r) => r.avgCheck, type: 'money', width: 120 },
      { header: 'Последний платёж', value: (r) => r.lastPaymentAt, type: 'date', width: 150 },
    ],
    rows: report.channels,
    preamble: [['Как считается', report.methodology.channelTurnover ?? '']],
  }
}

export function ledgerSheet(report: AnalyticsReport): Sheet<LedgerRow> {
  return {
    name: 'Платежи',
    columns: [
      { header: 'Дата', value: (r) => r.createdAt, type: 'date', width: 150 },
      { header: 'Кто заплатил', value: (r) => payerLabel(r), width: 170 },
      { header: 'Telegram ID', value: (r) => dash(r.payerTgId), width: 130 },
      { header: 'Кому — клиент', value: (r) => r.clientName, width: 200 },
      { header: 'Каналы доступа', value: (r) => (r.channels.length ? r.channels.join(', ') : '—'), width: 260 },
      { header: 'Тариф', value: (r) => dash(r.planName), width: 150 },
      { header: 'Сумма', value: (r) => r.amount, type: 'money' },
      { header: 'Валюта', value: (r) => r.currency, width: 80 },
      { header: 'Комиссия платформы', value: (r) => r.commission, type: 'money', width: 160 },
      { header: 'Остаётся клиенту', value: (r) => r.clientNet, type: 'money', width: 150 },
      { header: 'Статус', value: (r) => statusLabel(r.status), width: 110 },
      { header: 'Провайдер', value: (r) => providerLabel(r.provider), width: 130 },
      { header: 'ID платежа у провайдера', value: (r) => dash(r.providerPaymentId), width: 220 },
    ],
    rows: report.ledger.rows,
    preamble: report.ledger.truncated
      ? [['Внимание', `Показаны последние ${report.ledger.limit} платежей за период`]]
      : undefined,
  }
}

export function providersSheet(report: AnalyticsReport): Sheet<ProviderRow> {
  return {
    name: 'Провайдеры',
    columns: [
      { header: 'Провайдер', value: (r) => providerLabel(r.provider), width: 180 },
      { header: 'Оборот', value: (r) => r.turnover, type: 'money' },
      { header: 'Доля, %', value: (r) => r.sharePct, type: 'percent', width: 100 },
      { header: 'Платежей', value: (r) => r.paymentsCount, type: 'number', width: 100 },
      { header: 'Возвратов', value: (r) => r.refundsCount, type: 'number', width: 110 },
      { header: 'Ошибок', value: (r) => r.failedCount, type: 'number', width: 100 },
    ],
    rows: report.providers,
  }
}

export function settlementsSheet(report: AnalyticsReport): Sheet<SettlementRow> {
  return {
    name: 'Расчёты с платформой',
    columns: [
      { header: 'Клиент', value: (r) => r.clientName, width: 220 },
      { header: 'Период с', value: (r) => r.periodStart, width: 110 },
      { header: 'Период по', value: (r) => r.periodEnd, width: 110 },
      { header: 'Абонплата', value: (r) => r.subscriptionAmount, type: 'money', width: 120 },
      { header: 'Комиссия', value: (r) => r.commissionAmount, type: 'money', width: 120 },
      { header: 'Оборот в основе', value: (r) => r.turnoverBase, type: 'money', width: 150 },
      { header: 'Итого к оплате', value: (r) => r.amount, type: 'money', width: 140 },
      { header: 'Статус', value: (r) => statusLabel(r.status), width: 120 },
      { header: 'Оплачен', value: (r) => r.paidAt, type: 'date', width: 150 },
    ],
    rows: report.settlements,
  }
}

/** Полная книга: каждый разрез — на своём листе. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function reportWorkbook(report: AnalyticsReport): Sheet<any>[] {
  return [
    summarySheet(report),
    trendSheet(report),
    clientsSheet(report),
    channelsSheet(report),
    ledgerSheet(report),
    providersSheet(report),
    settlementsSheet(report),
  ]
}
