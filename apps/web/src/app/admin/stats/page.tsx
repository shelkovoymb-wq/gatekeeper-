'use client'

import { useEffect } from 'react'
import { StatsTile } from '@/components/StatsTile'
import { SetupChecklist } from '@/components/SetupChecklist'
import { useAdminStore } from '@/lib/store'
import { api } from '@/lib/api'
import { formatMoney, formatNumber } from '@/lib/format'

export default function StatsPage() {
  const { stats, setStats, isLoading, setIsLoading, setError, error } = useAdminStore()

  useEffect(() => {
    const loadStats = async () => {
      try {
        setIsLoading(true)
        const data = await api.stats.get()
        setStats(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику')
      } finally {
        setIsLoading(false)
      }
    }
    loadStats()
  }, [setStats, setIsLoading, setError])

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Обзор</h1>
        <p className="mt-1 text-sm text-ledger-page/60">
          Сводка по каналам, подписчикам и выручке платформы
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <SetupChecklist />

      {isLoading && !stats ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-sm bg-ledger-page/10" />
          ))}
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatsTile
              label="Всего каналов"
              value={formatNumber(stats.totalChannels)}
              icon="📺"
              accent="primary"
              hint={`${formatNumber(stats.activeChannels)} активных`}
            />
            <StatsTile
              label="Активные каналы"
              value={formatNumber(stats.activeChannels)}
              icon="✅"
              accent="success"
              hint="Бот подключён и работает"
            />
            <StatsTile
              label="Подписчиков"
              value={formatNumber(stats.totalUsers)}
              icon="👥"
              accent="secondary"
              hint="Уникальных пользователей"
            />
            <StatsTile
              label="Подписок"
              value={formatNumber(stats.messageCount)}
              icon="🔑"
              accent="accent"
              hint="Оформлено доступов"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="rounded-sm bg-ledger-page p-8 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)] lg:col-span-2">
              <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-ink/50">
                Общая выручка
              </p>
              <div className="mt-3 font-display text-4xl tracking-tight text-ledger-stamp md:text-5xl">
                {formatMoney(stats.totalRevenue)}
              </div>
              <p className="mt-2 text-sm text-ledger-ink/55">
                Сумма всех успешно проведённых платежей
              </p>
            </div>

            <div className="rounded-sm bg-ledger-page p-8 text-ledger-ink shadow-[4px_6px_0_0_rgba(0,0,0,0.25)]">
              <p className="font-ledger-mono text-xs uppercase tracking-wide text-ledger-ink/50">
                Средний чек
              </p>
              <div className="mt-3 font-display text-3xl text-ledger-ink">
                {formatMoney(
                  stats.messageCount > 0 ? stats.totalRevenue / stats.messageCount : 0,
                )}
              </div>
              <p className="mt-2 text-sm text-ledger-ink/55">Выручка на одну подписку</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-ledger-page/50">Нет данных</p>
      )}
    </div>
  )
}
