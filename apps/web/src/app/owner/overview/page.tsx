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
        <h1 className="text-2xl font-bold text-white md:text-3xl">Платформа</h1>
        <p className="mt-1 text-sm text-slate-400">
          Сводка по всем клиентам, обороту и комиссии платформы
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
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
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-primary-600/15 via-slate-900/60 to-slate-900/60 p-8">
              <p className="text-sm font-medium text-slate-300">Оборот клиентов</p>
              <div className="mt-3 text-3xl font-bold tracking-tight text-primary-300 md:text-4xl">
                {formatMoney(data.clientsTurnover)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Сумма всех успешных платежей у клиентов
              </p>
            </div>

            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-emerald-600/15 via-slate-900/60 to-slate-900/60 p-8">
              <p className="text-sm font-medium text-slate-300">Комиссия платформы</p>
              <div className="mt-3 text-3xl font-bold tracking-tight text-emerald-400 md:text-4xl">
                {formatMoney(data.platformCommission)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Начислено с оборота по тарифам клиентов
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
              <p className="text-sm font-medium text-slate-300">Подписки клиентов (MRR)</p>
              <div className="mt-3 text-3xl font-bold text-white">
                {formatMoney(data.platformMrr)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Ежемесячная выручка от платформенных тарифов
              </p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-slate-500">Нет данных</p>
      )}
    </div>
  )
}
