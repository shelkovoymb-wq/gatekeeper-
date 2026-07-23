'use client'

import { useEffect, useState } from 'react'
import { ChannelCard } from '@/components/ChannelCard'
import { useAdminStore } from '@/lib/store'
import { api } from '@/lib/api'
import type { Channel } from '@/types'

export default function ChannelsPage() {
  const { channels, setChannels, isLoading, setIsLoading, setError } = useAdminStore()
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    const loadChannels = async () => {
      try {
        setIsLoading(true)
        const data = await api.channels.list()
        setChannels(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load channels')
      } finally {
        setIsLoading(false)
      }
    }

    loadChannels()
  }, [setChannels, setIsLoading, setError])

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure?')) {
      try {
        await api.channels.delete(id)
        setChannels(channels.filter((c) => c.id !== id))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete channel')
      }
    }
  }

  const handleCreate = () => {
    setIsCreating(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">Channels</h1>
        <button
          onClick={handleCreate}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Channel
        </button>
      </div>

      {isCreating && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-6">
          <p className="text-sm text-blue-700">Channel creation form coming soon...</p>
          <button
            onClick={() => setIsCreating(false)}
            className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Close
          </button>
        </div>
      )}

      {channels.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">No channels yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
