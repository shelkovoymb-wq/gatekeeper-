import { NextResponse } from 'next/server'
import type { Stats, ApiResponse } from '@/types'

export async function GET() {
  const stats: Stats = {
    totalChannels: 3,
    totalUsers: 2400,
    totalRevenue: 89700,
    messageCount: 45280,
    activeChannels: 2,
  }

  const response: ApiResponse<Stats> = {
    success: true,
    data: stats,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(response)
}
