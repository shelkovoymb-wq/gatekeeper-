'use client'

import { useEffect } from 'react'
import { StatsTile } from '@/components/StatsTile'
import { useAdminStore } from '@/lib/store'
import { api } from '@/lib/api'

export default function StatsPage() {
  const { stats, setStats, isLoading, setIsLoading, setError } = useAdminStore()

  useEffect(() => {
    const loadStats = async () => {
      try {
        setIsLoading(true)
        const data = await api.stats.get()
        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats')
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
  }, [setStats, setIsLoading, setError])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">Loading...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-slate-500">No data available</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold text-slate-900">Statistics</h1>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatsTile
          label="Total Channels"
          value={stats.totalChannels}
          icon="📺"
          trend="up"
        />
        <StatsTile
          label="Active Channels"
          value={stats.activeChannels}
          icon="✓"
          trend="neutral"
        />
        <StatsTile
          label="Total Users"
          value={stats.totalUsers.toLocaleString()}
          icon="👥"
          trend="up"
        />
        <StatsTile
          label="Total Messages"
          value={stats.messageCount.toLocaleString()}
          icon="💬"
          trend="up"
        />
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Revenue</h2>
        <div className="text-4xl font-bold text-green-600">
          ${stats.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </div>
        <p className="mt-2 text-sm text-slate-500">Total subscription revenue</p>
      </div>
    </div>
  )
}
