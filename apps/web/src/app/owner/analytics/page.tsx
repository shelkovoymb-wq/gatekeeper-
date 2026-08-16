'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { StatsTile } from '@/components/StatsTile'
import { DataTable, type DataColumn } from '@/components/DataTable'
import { StackedColumns, ChartLegend, type ColumnSeries } from '@/components/charts/StackedColumns'
import { BarList } from '@/components/charts/BarList'
import { ShareBar } from '@/components/charts/ShareBar'
import { SERIES } from '@/components/charts/chart-kit'
import { formatCompact, formatDate, formatDay, formatMoney, formatNumber } from '@/lib/format'
import { downloadWorkbook, workbookFileName, type Sheet } from '@/lib/xls'
import {
  GRANULARITY_LABELS,
  PERIOD_PRESETS,
  analyticsQueryString,
  channelsSheet,
  clientsSheet,
  isoDay,
  ledgerSheet,
  payerLabel,
  providerLabel,
  providersSheet,
  reportWorkbook,
  settlementsSheet,
  statusLabel,
  type AnalyticsReport,
  type ChannelRow,
  type ClientRow,
  type LedgerRow,
  type SettlementRow,
} from '@/lib/analytics'

type TabKey = 'clients' | 'channels' | 'ledger' | 'settlements'

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'clients', label: 'Клиенты', icon: '🏢' },
  { key: 'channels', label: 'Каналы', icon: '📺' },
  { key: 'ledger', label: 'Кто кому заплатил', icon: '🧾' },
  { key: 'settlements', label: 'Расчёты с платформой', icon: '💰' },
]

const LEDGER_STATUSES = [
  { value: 'all', label: 'Все' },
  { value: 'succeeded', label: 'Проведённые' },
  { value: 'refunded', label: 'Возвраты' },
  { value: 'pending', label: 'В ожидании' },
  { value: 'failed', label: 'Ошибки' },
]

/** Сколько строк реестра тянем с бэкенда — хватает и на экран, и на выгрузку. */
const LEDGER_LIMIT = 5000

const statusChip: Record<string, string> = {
  succeeded: 'bg-emerald-500/10 text-emerald-700',
  paid: 'bg-emerald-500/10 text-emerald-700',
  active: 'bg-emerald-500/10 text-emerald-700',
  pending: 'bg-amber-500/10 text-amber-700',
  trialing: 'bg-amber-500/10 text-amber-700',
  failed: 'bg-red-500/10 text-red-700',
  overdue: 'bg-red-500/10 text-red-700',
  past_due: 'bg-red-500/10 text-red-700',
  refunded: 'bg-ledger-stamp/10 text-ledger-stamp',
}

function Chip({ status }: { status: string | null }) {
  if (!status) return <span className="text-ledger-ink/40">—</span>
  return (
    <span
      className={`inline-block rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${
        statusChip[status] ?? 'bg-ledger-ink/10 text-ledger-ink/60'
      }`}
    >
      {statusLabel(status)}
    </span>
  )
}

function Card({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-sm bg-ledger-page p-5 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] md:p-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-ledger-ink">{title}</h2>
          {hint && <p className="mt-1 text-xs text-ledger-ink/55">{hint}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

export default function OwnerAnalyticsPage() {
  const [from, setFrom] = useState(() => isoDay(29))
  const [to, setTo] = useState(() => isoDay(0))
  const [preset, setPreset] = useState('30d')
  const [granularity, setGranularity] = useState('auto')
  const [clientId, setClientId] = useState('')

  const [report, setReport] = useState<AnalyticsReport | null>(null)
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tab, setTab] = useState<TabKey>('clients')
  const [search, setSearch] = useState('')
  const [ledgerStatus, setLedgerStatus] = useState('all')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const qs = analyticsQueryString({ from, to, granularity, clientId, limit: LEDGER_LIMIT })
    fetch(`/api/platform/analytics?${qs}`)
      .then((r) => r.json())
      .then((res) => {
        if (!res.success) throw new Error(res.error || 'Ошибка загрузки')
        const data = res.data as AnalyticsReport
        setReport(data)
        // Полный список клиентов запоминаем на нефильтрованном ответе,
        // иначе после выбора клиента в селекте останется он один.
        if (!data.filters.clientId) {
          setClientOptions(data.clients.map((c) => ({ id: c.id, name: c.name })))
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [from, to, granularity, clientId])

  useEffect(() => {
    load()
  }, [load])

  const applyPreset = (code: string) => {
    const p = PERIOD_PRESETS.find((x) => x.code === code)
    if (!p) return
    setPreset(code)
    setFrom(p.from())
    setTo(isoDay(0))
  }

  const totals = report?.totals
  const period = report?.period

  const trendSeries: ColumnSeries[] = [
    { key: 'commission', label: 'Комиссия платформы', color: SERIES[0] },
    { key: 'net', label: 'Остаётся клиентам', color: SERIES[1] },
  ]
  const trendPoints = useMemo(
    () =>
      (report?.trend ?? []).map((p) => ({
        label: p.label,
        hint: p.label,
        values: [p.commission, Math.max(0, p.turnover - p.commission)],
      })),
    [report],
  )
  const paymentsPoints = useMemo(
    () =>
      (report?.trend ?? []).map((p) => ({
        label: p.label,
        hint: p.label,
        values: [p.paymentsCount],
      })),
    [report],
  )

  const topClients = useMemo(
    () =>
      (report?.clients ?? [])
        .filter((c) => c.turnover > 0)
        .sort((a, b) => b.turnover - a.turnover)
        .slice(0, 8)
        .map((c) => ({
          id: c.id,
          label: c.name,
          sublabel: `${c.planName ?? 'без тарифа'} · ${formatNumber(c.paymentsCount)} платежей`,
          value: c.turnover,
          extra: `комиссия ${formatMoney(c.commission)}`,
        })),
    [report],
  )

  const topChannels = useMemo(
    () =>
      (report?.channels ?? [])
        .filter((c) => c.turnover > 0)
        .sort((a, b) => b.turnover - a.turnover)
        .slice(0, 8)
        .map((c) => ({
          id: c.id,
          label: c.title,
          sublabel: `${c.clientName} · ${formatNumber(c.activeSubscriptions)} подписок`,
          value: c.turnover,
          extra: `${formatNumber(c.paymentsCount)} платежей`,
        })),
    [report],
  )

  const providerItems = useMemo(
    () =>
      (report?.providers ?? []).map((p) => ({
        key: p.provider,
        label: providerLabel(p.provider),
        value: p.turnover,
        sharePct: p.sharePct,
        note: `${formatNumber(p.paymentsCount)} шт.`,
      })),
    [report],
  )

  // ─── Фильтрация таблиц на клиенте ──────────────────────────────────────────

  const needle = search.trim().toLowerCase()

  const channelRows = useMemo(() => {
    const rows = report?.channels ?? []
    if (!needle) return rows
    return rows.filter(
      (c) =>
        c.title.toLowerCase().includes(needle) || c.clientName.toLowerCase().includes(needle),
    )
  }, [report, needle])

  const ledgerRows = useMemo(() => {
    let rows = report?.ledger.rows ?? []
    if (ledgerStatus !== 'all') rows = rows.filter((r) => r.status === ledgerStatus)
    if (!needle) return rows
    return rows.filter((r) =>
      [
        payerLabel(r),
        r.payerTgId ?? '',
        r.clientName,
        r.planName ?? '',
        r.channels.join(' '),
        providerLabel(r.provider),
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [report, needle, ledgerStatus])

  const clientRows = useMemo(() => {
    const rows = report?.clients ?? []
    if (!needle) return rows
    return rows.filter((c) => c.name.toLowerCase().includes(needle))
  }, [report, needle])

  const settlementRows = useMemo(() => {
    const rows = report?.settlements ?? []
    if (!needle) return rows
    return rows.filter((s) => s.clientName.toLowerCase().includes(needle))
  }, [report, needle])

  // ─── Выгрузка ──────────────────────────────────────────────────────────────

  const exportAll = () => {
    if (!report) return
    downloadWorkbook(
      workbookFileName('gatekeeper-статистика', report.period.from, report.period.to),
      reportWorkbook(report),
    )
  }

  const exportTab = () => {
    if (!report) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byTab: Record<TabKey, () => Sheet<any>> = {
      clients: () => ({ ...clientsSheet(report), rows: clientRows }),
      channels: () => ({ ...channelsSheet(report), rows: channelRows }),
      ledger: () => ({ ...ledgerSheet(report), rows: ledgerRows }),
      settlements: () => ({ ...settlementsSheet(report), rows: settlementRows }),
    }
    const sheet = byTab[tab]()
    const name = TABS.find((t) => t.key === tab)?.label ?? 'отчёт'
    downloadWorkbook(
      workbookFileName(`gatekeeper-${name.toLowerCase()}`, report.period.from, report.period.to),
      [sheet, providersSheet(report)],
    )
  }

  // ─── Колонки таблиц ────────────────────────────────────────────────────────

  const clientColumns: DataColumn<ClientRow>[] = [
    {
      key: 'name',
      header: 'Клиент',
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <p className="font-bold text-ledger-ink">{r.name}</p>
          <p className="text-xs text-ledger-ink/50">
            {r.planName ?? 'без тарифа'} · ставка {r.commissionPct}%
          </p>
        </div>
      ),
    },
    { key: 'planStatus', header: 'Статус', sortValue: (r) => r.planStatus, render: (r) => <Chip status={r.planStatus} /> },
    { key: 'channels', header: 'Каналов', align: 'right', sortValue: (r) => r.channels, render: (r) => formatNumber(r.channels) },
    {
      key: 'subs',
      header: 'Подписок',
      align: 'right',
      sortValue: (r) => r.activeSubscriptions,
      render: (r) => formatNumber(r.activeSubscriptions),
    },
    {
      key: 'turnover',
      header: 'Оборот',
      align: 'right',
      sortValue: (r) => r.turnover,
      hint: 'Сумма успешных платежей подписчиков за период',
      render: (r) => <span className="font-bold">{formatMoney(r.turnover)}</span>,
    },
    {
      key: 'commission',
      header: 'Комиссия',
      align: 'right',
      sortValue: (r) => r.commission,
      hint: 'Оборот × ставка тарифа платформы',
      render: (r) => <span className="font-bold text-emerald-700">{formatMoney(r.commission)}</span>,
    },
    {
      key: 'net',
      header: 'Клиенту',
      align: 'right',
      sortValue: (r) => r.clientNet,
      hint: 'Оборот минус комиссия платформы',
      render: (r) => formatMoney(r.clientNet),
    },
    {
      key: 'payments',
      header: 'Платежей',
      align: 'right',
      sortValue: (r) => r.paymentsCount,
      render: (r) => (
        <span>
          {formatNumber(r.paymentsCount)}
          <span className="ml-1 text-xs text-ledger-ink/45">/ {formatNumber(r.payers)} чел.</span>
        </span>
      ),
    },
    { key: 'avg', header: 'Средний чек', align: 'right', sortValue: (r) => r.avgCheck, render: (r) => formatMoney(r.avgCheck) },
    {
      key: 'last',
      header: 'Последний платёж',
      sortValue: (r) => r.lastPaymentAt,
      render: (r) => <span className="text-ledger-ink/60">{formatDate(r.lastPaymentAt ?? undefined)}</span>,
    },
  ]

  const channelColumns: DataColumn<ChannelRow>[] = [
    {
      key: 'title',
      header: 'Канал',
      sortValue: (r) => r.title,
      render: (r) => (
        <div>
          <p className="font-bold text-ledger-ink">{r.title}</p>
          <p className="text-xs text-ledger-ink/50">
            {r.type === 'group' ? 'Группа' : 'Канал'} · {r.plans} тариф(ов)
          </p>
        </div>
      ),
    },
    { key: 'client', header: 'Клиент', sortValue: (r) => r.clientName, render: (r) => r.clientName },
    {
      key: 'subs',
      header: 'Подписок',
      align: 'right',
      sortValue: (r) => r.activeSubscriptions,
      render: (r) => formatNumber(r.activeSubscriptions),
    },
    {
      key: 'turnover',
      header: 'Оборот канала',
      align: 'right',
      sortValue: (r) => r.turnover,
      hint: 'Платёж делится поровну между каналами тарифа — сумма по каналам равна обороту клиента',
      render: (r) => <span className="font-bold">{formatMoney(r.turnover)}</span>,
    },
    {
      key: 'commission',
      header: 'Комиссия',
      align: 'right',
      sortValue: (r) => r.commission,
      render: (r) => <span className="font-bold text-emerald-700">{formatMoney(r.commission)}</span>,
    },
    {
      key: 'gross',
      header: 'Оборот тарифов',
      align: 'right',
      sortValue: (r) => r.grossTurnover,
      hint: 'Полные суммы платежей по тарифам с этим каналом. Пересекается между каналами одного тарифа — складывать нельзя',
      render: (r) => <span className="text-ledger-ink/60">{formatMoney(r.grossTurnover)}</span>,
    },
    {
      key: 'payments',
      header: 'Платежей',
      align: 'right',
      sortValue: (r) => r.paymentsCount,
      render: (r) => formatNumber(r.paymentsCount),
    },
    {
      key: 'last',
      header: 'Последний платёж',
      sortValue: (r) => r.lastPaymentAt,
      render: (r) => <span className="text-ledger-ink/60">{formatDate(r.lastPaymentAt ?? undefined)}</span>,
    },
  ]

  const ledgerColumns: DataColumn<LedgerRow>[] = [
    {
      key: 'date',
      header: 'Когда',
      sortValue: (r) => r.createdAt,
      render: (r) => <span className="font-ledger-mono text-xs">{formatDate(r.createdAt ?? undefined)}</span>,
    },
    {
      key: 'payer',
      header: 'Кто заплатил',
      sortValue: (r) => payerLabel(r),
      render: (r) => (
        <div>
          <p className="font-bold text-ledger-ink">{payerLabel(r)}</p>
          {r.payerTgId && <p className="font-ledger-mono text-xs text-ledger-ink/45">ID {r.payerTgId}</p>}
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Кому',
      sortValue: (r) => r.clientName,
      render: (r) => (
        <div>
          <p className="font-bold text-ledger-ink">{r.clientName}</p>
          <p className="text-xs text-ledger-ink/50">{r.planName ?? 'тариф не указан'}</p>
        </div>
      ),
    },
    {
      key: 'channels',
      header: 'За доступ в каналы',
      render: (r) =>
        r.channels.length ? (
          <span className="flex flex-wrap gap-1">
            {r.channels.map((ch) => (
              <span key={ch} className="rounded-sm bg-ledger-ink/8 px-2 py-0.5 text-xs">
                {ch}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-ledger-ink/40">—</span>
        ),
    },
    {
      key: 'amount',
      header: 'Сумма',
      align: 'right',
      sortValue: (r) => r.amount,
      render: (r) => <span className="font-bold">{formatMoney(r.amount, r.currency)}</span>,
    },
    {
      key: 'commission',
      header: 'Комиссия',
      align: 'right',
      sortValue: (r) => r.commission,
      hint: 'Доля платформы с этого платежа',
      render: (r) =>
        r.commission ? (
          <span className="font-bold text-emerald-700">{formatMoney(r.commission, r.currency)}</span>
        ) : (
          <span className="text-ledger-ink/40">—</span>
        ),
    },
    { key: 'status', header: 'Статус', sortValue: (r) => r.status, render: (r) => <Chip status={r.status} /> },
    {
      key: 'provider',
      header: 'Провайдер',
      sortValue: (r) => r.provider,
      render: (r) => <span className="text-ledger-ink/60">{providerLabel(r.provider)}</span>,
    },
  ]

  const settlementColumns: DataColumn<SettlementRow>[] = [
    { key: 'client', header: 'Клиент', sortValue: (r) => r.clientName, render: (r) => <span className="font-bold">{r.clientName}</span> },
    {
      key: 'period',
      header: 'Период',
      sortValue: (r) => r.periodStart,
      render: (r) => (
        <span className="font-ledger-mono text-xs">
          {formatDay(r.periodStart)} — {formatDay(r.periodEnd)}
        </span>
      ),
    },
    {
      key: 'subscription',
      header: 'Абонплата',
      align: 'right',
      sortValue: (r) => r.subscriptionAmount,
      render: (r) => formatMoney(r.subscriptionAmount),
    },
    {
      key: 'commission',
      header: 'Комиссия',
      align: 'right',
      sortValue: (r) => r.commissionAmount,
      hint: 'Начислена с оборота в основе счёта',
      render: (r) => formatMoney(r.commissionAmount),
    },
    {
      key: 'base',
      header: 'Оборот в основе',
      align: 'right',
      sortValue: (r) => r.turnoverBase,
      render: (r) => <span className="text-ledger-ink/60">{formatMoney(r.turnoverBase)}</span>,
    },
    {
      key: 'amount',
      header: 'Итого',
      align: 'right',
      sortValue: (r) => r.amount,
      render: (r) => <span className="font-bold">{formatMoney(r.amount)}</span>,
    },
    { key: 'status', header: 'Статус', sortValue: (r) => r.status, render: (r) => <Chip status={r.status} /> },
  ]

  const tabCounts: Record<TabKey, number> = {
    clients: clientRows.length,
    channels: channelRows.length,
    ledger: ledgerRows.length,
    settlements: settlementRows.length,
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Детальная статистика</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Кто из клиентов сколько заработал, какие каналы это принесли и кто конкретно кому заплатил
        </p>
      </header>

      {/* ─── Фильтры ─────────────────────────────────────────────────────── */}
      <div className="mb-6 rounded-sm border border-ledger-page/15 bg-ledger-coverLight p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="mb-2 font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/50">
              Период
            </p>
            <div className="flex flex-wrap gap-2">
              {PERIOD_PRESETS.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => applyPreset(p.code)}
                  className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                    preset === p.code
                      ? 'bg-ledger-stamp font-bold text-ledger-page hover:brightness-110'
                      : 'border border-ledger-page/20 text-ledger-page hover:bg-ledger-page/5'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <label className="text-sm text-ledger-page/70">
            <span className="mb-2 block font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/50">
              С даты
            </span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value)
                setPreset('custom')
              }}
              className="rounded-sm border border-ledger-page/20 bg-ledger-cover px-3 py-1.5 text-ledger-page"
            />
          </label>

          <label className="text-sm text-ledger-page/70">
            <span className="mb-2 block font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/50">
              По дату
            </span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value)
                setPreset('custom')
              }}
              className="rounded-sm border border-ledger-page/20 bg-ledger-cover px-3 py-1.5 text-ledger-page"
            />
          </label>

          <label className="text-sm text-ledger-page/70">
            <span className="mb-2 block font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/50">
              Детализация
            </span>
            <select
              value={granularity}
              onChange={(e) => setGranularity(e.target.value)}
              className="rounded-sm border border-ledger-page/20 bg-ledger-cover px-3 py-1.5 text-ledger-page"
            >
              <option value="auto">Автоматически</option>
              <option value="day">По дням</option>
              <option value="week">По неделям</option>
              <option value="month">По месяцам</option>
            </select>
          </label>

          <label className="text-sm text-ledger-page/70">
            <span className="mb-2 block font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/50">
              Клиент
            </span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="max-w-[220px] rounded-sm border border-ledger-page/20 bg-ledger-cover px-3 py-1.5 text-ledger-page"
            >
              <option value="">Все клиенты</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              className="rounded-sm border border-ledger-page/20 px-4 py-2 text-sm font-bold text-ledger-page transition-colors hover:bg-ledger-page/5"
            >
              ↻ Обновить
            </button>
            <button
              type="button"
              onClick={exportAll}
              disabled={!report}
              className="rounded-sm bg-ledger-brass px-4 py-2 text-sm font-bold text-ledger-cover transition hover:brightness-110 disabled:opacity-40"
            >
              ⤓ Экспорт всего отчёта в XLS
            </button>
          </div>
        </div>

        {period && (
          <p className="mt-3 font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/45">
            {formatDay(period.from)} — {formatDay(period.to)} · {period.days} дн. ·{' '}
            {GRANULARITY_LABELS[period.granularity]}
            {report?.filters.clientId && ' · фильтр по клиенту'}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-sm bg-ledger-page/10" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-sm bg-ledger-page/10" />
        </div>
      ) : report && totals ? (
        <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* ─── Показатели ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatsTile
              label="Оборот клиентов"
              value={formatMoney(totals.turnover)}
              icon="💳"
              accent="primary"
              hint={`${formatNumber(totals.paymentsCount)} платежей от ${formatNumber(totals.payers)} чел.`}
            />
            <StatsTile
              label="Комиссия платформы"
              value={formatMoney(totals.commission)}
              icon="📈"
              accent="success"
              hint={`Эффективная ставка ${totals.effectiveCommissionPct.toLocaleString('ru-RU')}%`}
            />
            <StatsTile
              label="Остаётся клиентам"
              value={formatMoney(totals.clientNet)}
              icon="🏢"
              accent="secondary"
              hint={`${formatNumber(totals.payingClients)} клиентов с оборотом`}
            />
            <StatsTile
              label="Средний чек"
              value={formatMoney(totals.avgCheck)}
              icon="🧮"
              accent="accent"
              hint={
                totals.refundsCount
                  ? `Возвраты: ${formatMoney(totals.refunded)} (${formatNumber(totals.refundsCount)})`
                  : 'Возвратов за период нет'
              }
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {[
              { label: 'Выставлено счетов платформы', value: formatMoney(totals.invoicedToClients) },
              { label: 'Оплачено клиентами', value: formatMoney(totals.paidByClients) },
              { label: 'Долг клиентов платформе', value: formatMoney(totals.dueFromClients) },
            ].map((item) => (
              <div key={item.label} className="rounded-sm border border-ledger-page/15 px-5 py-4">
                <p className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-page/50">
                  {item.label}
                </p>
                <p className="mt-2 font-display text-xl text-ledger-page">{item.value}</p>
              </div>
            ))}
          </div>

          {/* ─── Графики ──────────────────────────────────────────────── */}
          <div className="mt-6 space-y-5">
            <Card
              title="Динамика оборота"
              hint="Высота столбца — оборот периода. Нижний сегмент — комиссия платформы, верхний — то, что остаётся клиенту"
            >
              <StackedColumns
                points={trendPoints}
                series={trendSeries}
                formatValue={(n) => formatMoney(n)}
                formatAxis={formatCompact}
              />
              <ChartLegend series={trendSeries} />
            </Card>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title="Платежи по периодам" hint="Количество успешных платежей">
                <StackedColumns
                  points={paymentsPoints}
                  series={[{ key: 'payments', label: 'Платежей', color: SERIES[2] }]}
                  formatValue={(n) => `${formatNumber(n)} шт.`}
                  formatAxis={(n) => formatNumber(Math.round(n))}
                  height={220}
                />
              </Card>

              <Card title="Платёжные провайдеры" hint="Доля в обороте за период">
                <ShareBar items={providerItems} formatValue={(n) => formatMoney(n)} />
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title="Топ клиентов по обороту" hint="Нажмите, чтобы отфильтровать отчёт по клиенту">
                <BarList
                  items={topClients}
                  formatValue={(n) => formatMoney(n)}
                  onSelect={(id) => setClientId(id)}
                />
              </Card>

              <Card title="Топ каналов по обороту" hint="Доля тарифов, приходящаяся на канал">
                <BarList items={topChannels} formatValue={(n) => formatMoney(n)} color={SERIES[1]} />
              </Card>
            </div>
          </div>

          {/* ─── Таблицы ──────────────────────────────────────────────── */}
          <div className="mt-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`rounded-sm px-4 py-2 text-sm font-bold transition-colors ${
                    tab === t.key
                      ? 'bg-ledger-page text-ledger-ink'
                      : 'border border-ledger-page/20 text-ledger-page/75 hover:bg-ledger-page/5'
                  }`}
                >
                  <span className="mr-1.5">{t.icon}</span>
                  {t.label}
                  <span className="ml-2 font-ledger-mono text-xs opacity-60">
                    {formatNumber(tabCounts[t.key])}
                  </span>
                </button>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по названию клиента, канала или плательщику…"
                className="min-w-[260px] flex-1 rounded-sm border border-ledger-page/20 bg-ledger-coverLight px-4 py-2 text-sm text-ledger-page placeholder:text-ledger-page/35"
              />
              {tab === 'ledger' &&
                LEDGER_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setLedgerStatus(s.value)}
                    className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                      ledgerStatus === s.value
                        ? 'bg-ledger-stamp font-bold text-ledger-page'
                        : 'border border-ledger-page/20 text-ledger-page/75 hover:bg-ledger-page/5'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              <button
                type="button"
                onClick={exportTab}
                className="rounded-sm border border-ledger-brass/60 px-4 py-2 text-sm font-bold text-ledger-brass transition-colors hover:bg-ledger-brass/10"
              >
                ⤓ Выгрузить эту таблицу
              </button>
            </div>

            {tab === 'clients' && (
              <DataTable
                columns={clientColumns}
                rows={clientRows}
                rowKey={(r) => r.id}
                initialSort={{ key: 'turnover', dir: 'desc' }}
                empty="Клиентов с такими параметрами нет"
                minWidth={1100}
                pageSize={25}
              />
            )}

            {tab === 'channels' && (
              <DataTable
                columns={channelColumns}
                rows={channelRows}
                rowKey={(r) => r.id}
                initialSort={{ key: 'turnover', dir: 'desc' }}
                empty="Каналов с такими параметрами нет"
                minWidth={1100}
                pageSize={25}
              />
            )}

            {tab === 'ledger' && (
              <>
                <DataTable
                  columns={ledgerColumns}
                  rows={ledgerRows}
                  rowKey={(r) => r.id}
                  initialSort={{ key: 'date', dir: 'desc' }}
                  empty="Платежей за период нет"
                  minWidth={1200}
                  pageSize={50}
                />
                {report.ledger.truncated && (
                  <p className="mt-3 text-xs text-ledger-page/50">
                    Показаны последние {formatNumber(report.ledger.limit)} платежей за период —
                    сузьте период или выберите клиента, чтобы увидеть остальные.
                  </p>
                )}
              </>
            )}

            {tab === 'settlements' && (
              <DataTable
                columns={settlementColumns}
                rows={settlementRows}
                rowKey={(r) => r.id}
                initialSort={{ key: 'period', dir: 'desc' }}
                empty="Счетов платформы за этот период нет"
                minWidth={950}
                pageSize={25}
              />
            )}
          </div>

          {/* ─── Методика ─────────────────────────────────────────────── */}
          <details className="mt-8 rounded-sm border border-ledger-page/15 bg-ledger-coverLight p-5">
            <summary className="cursor-pointer font-display text-lg text-ledger-page">
              Как считаются цифры
            </summary>
            <dl className="mt-4 space-y-3 text-sm">
              {Object.entries(report.methodology).map(([key, text]) => (
                <div key={key}>
                  <dt className="font-ledger-mono text-[11px] uppercase tracking-wide text-ledger-brass">
                    {
                      {
                        turnover: 'Оборот',
                        commission: 'Комиссия платформы',
                        clientNet: 'Остаётся клиенту',
                        channelTurnover: 'Оборот канала',
                        channelGross: 'Оборот тарифов канала',
                        settlements: 'Расчёты с платформой',
                      }[key] ?? key
                    }
                  </dt>
                  <dd className="mt-1 text-ledger-page/70">{text}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      ) : (
        <p className="text-ledger-page/45">Нет данных</p>
      )}
    </div>
  )
}
