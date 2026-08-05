'use client'

import { useEffect, useState } from 'react'
import { StatsTile } from '@/components/StatsTile'
import { formatMoney, formatNumber } from '@/lib/format'

interface Overview {
  totalClients: number
  activeClients: number
  totalChannels: number
  totalBots: number
  activeSubscriptions: number
  clientsTurnover: number
  platformCommission: number
  paymentsCount: number
  platformMrr: number
}

export default function OwnerOverviewPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/platform/overview')
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data)
        else setError(res.error || 'Ошибка загрузки')
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Платформа</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Сводка по всем клиентам, обороту и комиссии платформы
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-sm bg-ledger-page/10"
            />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatsTile
              label="Клиентов"
              value={formatNumber(data.totalClients)}
              icon="🏢"
              accent="primary"
              hint={`${formatNumber(data.activeClients)} активных`}
            />
            <StatsTile
              label="Каналов"
              value={formatNumber(data.totalChannels)}
              icon="📺"
              accent="secondary"
              hint={`${formatNumber(data.totalBots)} ботов`}
            />
            <StatsTile
              label="Активных подписок"
              value={formatNumber(data.activeSubscriptions)}
              icon="🔑"
              accent="accent"
              hint="У всех клиентов"
            />
            <StatsTile
              label="Платежей"
              value={formatNumber(data.paymentsCount)}
              icon="💳"
              accent="success"
              hint="Успешных, по платформе"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="relative overflow-hidden rounded-sm bg-ledger-page p-8 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
              <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-ink/50">Оборот клиентов</p>
              <div className="mt-3 font-display text-3xl tracking-tight text-ledger-stamp md:text-4xl">
                {formatMoney(data.clientsTurnover)}
              </div>
              <p className="mt-2 text-sm text-ledger-ink/55">
                Сумма всех успешных платежей у клиентов
              </p>
            </div>

            <div className="relative overflow-hidden rounded-sm bg-ledger-page p-8 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
              <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-ink/50">Комиссия платформы</p>
              <div className="mt-3 font-display text-3xl tracking-tight text-emerald-700 md:text-4xl">
                {formatMoney(data.platformCommission)}
              </div>
              <p className="mt-2 text-sm text-ledger-ink/55">
                Начислено с оборота по тарифам клиентов
              </p>
            </div>

            <div className="rounded-sm bg-ledger-page p-8 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
              <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-ink/50">Подписки клиентов (MRR)</p>
              <div className="mt-3 font-display text-3xl text-ledger-ink">
                {formatMoney(data.platformMrr)}
              </div>
              <p className="mt-2 text-sm text-ledger-ink/55">
                Ежемесячная выручка от платформенных тарифов
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-ledger-page/45">Нет данных</p>
      )}
    </div>
  )
}
