'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from '@/lib/format'

interface PlatformPlan {
  id: string
  code: string
  name: string
  priceMonth: number
  currency: string
  commissionPct: number
  isActive: boolean
  limits: Record<string, unknown>
  features: Record<string, unknown>
}

export default function OwnerPlansPage() {
  const [rows, setRows] = useState<PlatformPlan[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/platform/plans')
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
        <h1 className="text-2xl font-bold text-white md:text-3xl">Тарифы платформы</h1>
        <p className="mt-1 text-sm text-slate-400">
          Планы, по которым клиенты пользуются платформой (абонплата + комиссия)
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-7"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{p.name}</h2>
                {!p.isActive && (
                  <span className="rounded-lg bg-slate-700/60 px-2 py-1 text-xs text-slate-400">
                    выкл
                  </span>
                )}
              </div>
              <div className="mt-4 text-3xl font-bold tracking-tight text-white">
                {p.priceMonth > 0 ? formatMoney(p.priceMonth, p.currency) : 'Бесплатно'}
                {p.priceMonth > 0 && (
                  <span className="text-base font-medium text-slate-400"> / мес</span>
                )}
              </div>
              <div className="mt-5 space-y-2 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">💰</span>
                  <span>
                    Комиссия платформы:{' '}
                    <span className="font-semibold text-white">{p.commissionPct}%</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">🏷️</span>
                  <span className="text-slate-400">код: {p.code}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
