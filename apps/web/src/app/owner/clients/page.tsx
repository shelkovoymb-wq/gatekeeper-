'use client'

import { useEffect, useState } from 'react'
import { formatMoney, formatNumber, formatDate } from '@/lib/format'

interface ClientRow {
  id: string
  name: string
  planCode: string
  planName: string
  planStatus: string
  commissionPct: number
  priceMonth: number
  channels: number
  activeSubscriptions: number
  turnover: number
  commission: number
  paymentsCount: number
  createdAt: string
}

const planBadge: Record<string, string> = {
  free: 'bg-ledger-ink/10 text-ledger-ink/60',
  start: 'bg-ledger-stamp/10 text-ledger-stamp',
  pro: 'bg-ledger-brass/15 text-ledger-brass',
}

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700',
  trialing: 'bg-amber-500/10 text-amber-700',
  past_due: 'bg-danger/10 text-red-700',
  canceled: 'bg-ledger-ink/10 text-ledger-ink/50',
}

export default function OwnerClientsPage() {
  const [rows, setRows] = useState<ClientRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/platform/clients')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setRows(res.data)
        else setError(res.error || 'Ошибка загрузки')
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Клиенты</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Владельцы каналов на платформе: тариф, оборот и комиссия
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-sm bg-ledger-page/10" />
      ) : rows.length === 0 ? (
        <p className="text-ledger-page/45">Пока нет клиентов</p>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-ledger-page/15">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-page/15 bg-ledger-cover font-ledger-mono text-xs uppercase tracking-wide text-ledger-brass">
                <th className="px-5 py-3 font-medium">Клиент</th>
                <th className="px-5 py-3 font-medium">Тариф</th>
                <th className="px-5 py-3 font-medium">Статус</th>
                <th className="px-5 py-3 text-right font-medium">Каналов</th>
                <th className="px-5 py-3 text-right font-medium">Подписок</th>
                <th className="px-5 py-3 text-right font-medium">Оборот</th>
                <th className="px-5 py-3 text-right font-medium">Комиссия</th>
                <th className="px-5 py-3 font-medium">С</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-ink/10 bg-ledger-page">
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors hover:bg-ledger-ink/5"
                >
                  <td className="px-5 py-3 font-bold text-ledger-ink">{c.name}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${
                        planBadge[c.planCode] ?? 'bg-ledger-ink/10 text-ledger-ink/60'
                      }`}
                    >
                      {c.planName}
                      {c.commissionPct > 0 && (
                        <span className="opacity-70">· {c.commissionPct}%</span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-sm px-2 py-1 font-ledger-mono text-xs font-medium ${
                        statusBadge[c.planStatus] ?? 'bg-ledger-ink/10 text-ledger-ink/60'
                      }`}
                    >
                      {c.planStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-ledger-ink/60">{formatNumber(c.channels)}</td>
                  <td className="px-5 py-3 text-right text-ledger-ink/60">
                    {formatNumber(c.activeSubscriptions)}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-ledger-ink">
                    {formatMoney(c.turnover)}
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-emerald-700">
                    {formatMoney(c.commission)}
                  </td>
                  <td className="px-5 py-3 text-ledger-ink/55">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
