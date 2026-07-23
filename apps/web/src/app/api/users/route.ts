import { NextResponse } from 'next/server'
import type { User, ApiResponse } from '@/types'

const mockUsers: User[] = [
  {
    id: '1',
    username: 'alexsmith',
    telegramId: '123456789',
    email: 'alex@example.com',
    isAdmin: true,
    subscriptions: ['1', '2'],
    createdAt: '2026-01-20',
    updatedAt: '2026-07-20',
  },
  {
    id: '2',
    username: 'marketingjoe',
    telegramId: '987654321',
    email: 'joe@example.com',
    isAdmin: false,
    subscriptions: ['1', '3'],
    createdAt: '2026-02-05',
    updatedAt: '2026-07-18',
  },
  {
    id: '3',
    username: 'devondev',
    telegramId: '555555555',
    email: 'devon@example.com',
    isAdmin: false,
    subscriptions: ['2'],
    createdAt: '2026-03-12',
    updatedAt: '2026-07-21',
  },
]

export async function GET() {
  const response: ApiResponse<User[]> = {
    success: true,
    data: mockUsers,
    timestamp: new Date().toISOString(),
  }
  return NextResponse.json(response)
}
