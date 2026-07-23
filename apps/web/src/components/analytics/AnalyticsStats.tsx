'use client'

interface StatsProps {
  stats: any
}

export function AnalyticsStats({ stats }: StatsProps) {
  return <div>Статистика: {JSON.stringify(stats)}</div>
}
