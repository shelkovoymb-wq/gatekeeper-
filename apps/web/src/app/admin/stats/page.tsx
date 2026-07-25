'use client'

import { useEffect } from 'react'
import { StatsTile } from '@/components/StatsTile'
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
        <h1 className="text-2xl font-bold text-white md:text-3xl">Обзор</h1>
        <p className="mt-1 text-sm text-slate-400">
          Сводка по каналам, подписчикам и выручке платформы
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading && !stats ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
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
            <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-emerald-600/15 via-slate-900/60 to-slate-900/60 p-8 lg:col-span-2">
              <p className="text-sm font-medium text-slate-300">Общая выручка</p>
              <div className="mt-3 text-4xl font-bold tracking-tight text-emerald-400 md:text-5xl">
                {formatMoney(stats.totalRevenue)}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                Сумма всех успешно проведённых платежей
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8">
              <p className="text-sm font-medium text-slate-300">Средний чек</p>
              <div className="mt-3 text-3xl font-bold text-white">
                {formatMoney(
                  stats.messageCount > 0 ? stats.totalRevenue / stats.messageCount : 0,
                )}
              </div>
              <p className="mt-2 text-sm text-slate-400">Выручка на одну подписку</p>
            </div>
          </div>
        </>
      ) : (
        <p className="text-slate-500">Нет данных</p>
      )}
    </div>
  )
}
