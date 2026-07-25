'use client'

import { useEffect } from 'react'
import { ChannelCard } from '@/components/ChannelCard'
import { useAdminStore } from '@/lib/store'
import { api } from '@/lib/api'

export default function ChannelsPage() {
  const { channels, setChannels, isLoading, setIsLoading, setError, error } =
    useAdminStore()

  useEffect(() => {
    const loadChannels = async () => {
      try {
        setIsLoading(true)
        const data = await api.channels.list()
        setChannels(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить каналы')
      } finally {
        setIsLoading(false)
      }
    }
    loadChannels()
  }, [setChannels, setIsLoading, setError])

  return (
    <div>
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">Каналы</h1>
          <p className="mt-1 text-sm text-slate-400">
            Платные Telegram-каналы, подключённые к платформе
          </p>
        </div>
        {!isLoading && (
          <span className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-sm text-slate-300">
            {channels.length}
          </span>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
            />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-12 text-center">
          <div className="mb-3 text-4xl">📺</div>
          <p className="text-slate-300">Пока нет подключённых каналов</p>
          <p className="mt-1 text-sm text-slate-500">
            Каналы появятся здесь после подключения бота и создания тарифа
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      )}
    </div>
  )
}
