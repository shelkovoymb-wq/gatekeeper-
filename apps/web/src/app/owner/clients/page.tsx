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
  free: 'bg-slate-700/60 text-slate-300',
  start: 'bg-primary-600/25 text-primary-200',
  pro: 'bg-accent-600/25 text-accent-200',
}

const statusBadge: Record<string, string> = {
  active: 'bg-emerald-600/20 text-emerald-300',
  trialing: 'bg-amber-600/20 text-amber-300',
  past_due: 'bg-danger/20 text-red-300',
  canceled: 'bg-slate-700/60 text-slate-400',
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
        <h1 className="text-2xl font-bold text-white md:text-3xl">Клиенты</h1>
        <p className="mt-1 text-sm text-slate-400">
          Владельцы каналов на платформе: тариф, оборот и комиссия
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
      ) : rows.length === 0 ? (
        <p className="text-slate-500">Пока нет клиентов</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
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
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30"
                >
                  <td className="px-5 py-3 font-medium text-white">{c.name}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${
                        planBadge[c.planCode] ?? 'bg-slate-700/60 text-slate-300'
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
                      className={`rounded-lg px-2 py-1 text-xs font-medium ${
                        statusBadge[c.planStatus] ?? 'bg-slate-700/60 text-slate-300'
                      }`}
                    >
                      {c.planStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300">{formatNumber(c.channels)}</td>
                  <td className="px-5 py-3 text-right text-slate-300">
                    {formatNumber(c.activeSubscriptions)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-white">
                    {formatMoney(c.turnover)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-emerald-400">
                    {formatMoney(c.commission)}
                  </td>
                  <td className="px-5 py-3 text-slate-400">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
