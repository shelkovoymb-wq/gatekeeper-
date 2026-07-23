import { NextRequest, NextResponse } from 'next/server'
import type { Channel, ApiResponse } from '@/types'

// Mock data
const mockChannels: Channel[] = [
  {
    id: '1',
    name: 'AI Mastery',
    description: 'Learn advanced AI techniques',
    telegramId: 'ai_mastery_paid',
    memberCount: 1250,
    subscriptionFee: 299,
    currency: 'RUB',
    isActive: true,
    createdAt: '2026-01-15',
    updatedAt: '2026-07-20',
  },
  {
    id: '2',
    name: 'DevOps Daily',
    description: 'DevOps best practices and tips',
    telegramId: 'devops_daily',
    memberCount: 890,
    subscriptionFee: 199,
    currency: 'RUB',
    isActive: true,
    createdAt: '2026-02-10',
    updatedAt: '2026-07-22',
  },
  {
    id: '3',
    name: 'Trading Signals',
    description: 'Premium trading alerts',
    telegramId: 'trading_signals_vip',
    memberCount: 2100,
    subscriptionFee: 499,
    currency: 'RUB',
    isActive: false,
    createdAt: '2026-03-05',
    updatedAt: '2026-07-10',
  },
]

export async function GET() {
  const response: ApiResponse<Channel[]> = {
    success: true,
    data: mockChannels,
    timestamp: new Date().toISOString(),
  }
  return NextResponse.json(response)
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const newChannel: Channel = {
    id: Date.now().toString(),
    ...body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const response: ApiResponse<Channel> = {
    success: true,
    data: newChannel,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(response, { status: 201 })
}
