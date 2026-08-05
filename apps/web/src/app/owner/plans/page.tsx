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
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Тарифы платформы</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Планы, по которым клиенты пользуются платформой (абонплата + комиссия)
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-sm bg-ledger-page/10"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="relative overflow-hidden rounded-sm bg-ledger-page p-7 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ledger-ink">{p.name}</h2>
                {!p.isActive && (
                  <span className="rounded-sm bg-ledger-ink/10 px-2 py-1 font-ledger-mono text-xs text-ledger-ink/50">
                    выкл
                  </span>
                )}
              </div>
              <div className="mt-4 font-display text-3xl tracking-tight text-ledger-ink">
                {p.priceMonth > 0 ? formatMoney(p.priceMonth, p.currency) : 'Бесплатно'}
                {p.priceMonth > 0 && (
                  <span className="text-base font-medium text-ledger-ink/55"> / мес</span>
                )}
              </div>
              <div className="mt-5 space-y-2 text-sm text-ledger-ink/60">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-700">💰</span>
                  <span>
                    Комиссия платформы:{' '}
                    <span className="font-semibold text-ledger-ink">{p.commissionPct}%</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-ledger-ink/45">🏷️</span>
                  <span className="font-ledger-mono text-ledger-ink/55">код: {p.code}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
