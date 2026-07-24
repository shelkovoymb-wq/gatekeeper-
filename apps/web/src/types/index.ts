export interface Channel {
  id: string
  name: string
  description?: string
  telegramId: string
  memberCount: number
  subscriptionFee: number
  currency: 'RUB' | 'USD'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  username: string
  telegramId: string
  email?: string
  isAdmin: boolean
  subscriptions: string[]
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  channelId: string
  userId: string
  content: string
  attachments?: string[]
  createdAt: string
}

export interface Stats {
  totalChannels: number
  totalUsers: number
  totalRevenue: number
  messageCount: number
  activeChannels: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
}

// Реэкспорт для обратной совместимости импортов из '@/types'.
export type { ChatMessage } from './chat'
