import { NextRequest, NextResponse } from 'next/server'
import type { ChatMessage, ApiResponse } from '@/types'
import type { ChatMessage as MessageType } from '@/types/chat'

// Mock chat history
const mockHistory: Record<string, MessageType[]> = {
  'default-session': [
    {
      id: '1',
      userId: 'bot',
      username: 'Assistant',
      content: 'Привет! Я n8nHarness Assistant. Чем я могу вам помочь?',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      isBot: true,
    },
    {
      id: '2',
      userId: 'user-1',
      username: 'You',
      content: 'Привет! Расскажи о платформе',
      timestamp: new Date(Date.now() - 3500000).toISOString(),
      isBot: false,
    },
    {
      id: '3',
      userId: 'bot',
      username: 'Assistant',
      content:
        'n8nHarness — это платформа для управления Telegram-каналами с платной подпиской. Она позволяет:\n\n• Управлять доступом к каналам\n• Отслеживать подписки и платежи\n• Взаимодействовать с пользователями через AI-агентов\n• Анализировать статистику',
      timestamp: new Date(Date.now() - 3400000).toISOString(),
      isBot: true,
    },
  ],
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId') || 'default-session'

  const history = mockHistory[sessionId] || []

  const response: ApiResponse<MessageType[]> = {
    success: true,
    data: history,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(response)
}
