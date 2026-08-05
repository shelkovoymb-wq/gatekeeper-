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
          <h1 className="font-display text-2xl text-ledger-page md:text-3xl">Каналы</h1>
          <p className="mt-1 text-sm text-ledger-page/60">
            Платные Telegram-каналы, подключённые к платформе
          </p>
        </div>
        {!isLoading && (
          <span className="rounded-sm border border-ledger-page/20 bg-ledger-page/10 px-3 py-1 text-sm text-ledger-page">
            {channels.length}
          </span>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-sm bg-ledger-page/10"
            />
          ))}
        </div>
      ) : channels.length === 0 ? (
        <div className="rounded-sm border border-dashed border-ledger-page/20 p-12 text-center">
          <div className="mb-3 text-4xl">📺</div>
          <p className="text-ledger-page/70">Пока нет подключённых каналов</p>
          <p className="mt-1 text-sm text-ledger-page/45">
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
