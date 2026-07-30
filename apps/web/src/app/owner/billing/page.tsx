'use client'

import { useCallback, useEffect, useState } from 'react'
import { StatsTile } from '@/components/StatsTile'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'

interface Summary {
  invoicesCount: number
  issuedTotal: number
  paidTotal: number
  dueTotal: number
}
interface Invoice {
  id: string
  clientName: string
  periodStart: string
  periodEnd: string
  amount: number
  status: string
  details: Record<string, unknown>
  createdAt: string
}

const statusBadge: Record<string, string> = {
  paid: 'bg-emerald-600/20 text-emerald-300',
  pending: 'bg-amber-600/20 text-amber-300',
  overdue: 'bg-danger/20 text-red-300',
  void: 'bg-slate-700/60 text-slate-400',
}

export default function OwnerBillingPage() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [s, inv] = await Promise.all([
        fetch('/api/platform/billing-summary').then((r) => r.json()),
        fetch('/api/platform/invoices').then((r) => r.json()),
      ])
      if (s.success) setSummary(s.data)
      if (inv.success) setInvoices(inv.data)
      if (!s.success) setError(s.error || 'Ошибка загрузки')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const generate = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await fetch('/api/platform/invoices/generate', { method: 'POST' }).then((x) => x.json())
      if (!r.success) setError(r.error || 'Не удалось сгенерировать')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const act = async (id: string, action: 'paid' | 'void') => {
    setBusy(true)
    try {
      await fetch(`/api/platform/invoices/${id}/${action}`, { method: 'POST' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">Биллинг платформы</h1>
          <p className="mt-1 text-sm text-slate-400">
            Счета клиентам: абонплата тарифа + комиссия с оборота
          </p>
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="rounded-xl bg-gradient-to-r from-primary-600 to-secondary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-600/25 transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Обработка…' : 'Сгенерировать за текущий месяц'}
        </button>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {summary && (
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatsTile label="Счетов" value={formatNumber(summary.invoicesCount)} icon="🧾" accent="primary" />
          <StatsTile label="Выставлено" value={formatMoney(summary.issuedTotal)} icon="Σ" accent="secondary" />
          <StatsTile label="Оплачено" value={formatMoney(summary.paidTotal)} icon="✅" accent="success" />
          <StatsTile label="К оплате" value={formatMoney(summary.dueTotal)} icon="⏳" accent="accent" />
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
      ) : invoices.length === 0 ? (
        <p className="text-slate-500">Счетов пока нет — сгенерируй за период.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Клиент</th>
                <th className="px-5 py-3 font-medium">Период</th>
                <th className="px-5 py-3 text-right font-medium">Абонплата</th>
                <th className="px-5 py-3 text-right font-medium">Комиссия</th>
                <th className="px-5 py-3 text-right font-medium">Итого</th>
                <th className="px-5 py-3 font-medium">Статус</th>
                <th className="px-5 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const d = inv.details as {
                  subscriptionAmount?: number
                  commissionAmount?: number
                  commissionPct?: number
                }
                return (
                  <tr key={inv.id} className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30">
                    <td className="px-5 py-3 font-medium text-white">{inv.clientName}</td>
                    <td className="px-5 py-3 text-slate-300">
                      {inv.periodStart} — {inv.periodEnd}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">
                      {formatMoney(Number(d?.subscriptionAmount ?? 0))}
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300">
                      {formatMoney(Number(d?.commissionAmount ?? 0))}
                      {d?.commissionPct ? <span className="text-slate-500"> · {d.commissionPct}%</span> : null}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-white">{formatMoney(inv.amount)}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-lg px-2 py-1 text-xs font-medium ${statusBadge[inv.status] ?? 'bg-slate-700/60 text-slate-300'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {inv.status === 'pending' || inv.status === 'overdue' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => act(inv.id, 'paid')}
                            disabled={busy}
                            className="rounded-lg bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
                          >
                            Оплачен
                          </button>
                          <button
                            onClick={() => act(inv.id, 'void')}
                            disabled={busy}
                            className="rounded-lg bg-slate-700/60 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                          >
                            Аннулировать
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
