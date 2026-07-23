'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { ChatMessage, ChatSession } from '@/types/chat'

interface UseChatOptions {
  sessionId?: string
  userId?: string
}

export function useChat(options: UseChatOptions = {}) {
  const { sessionId = 'default-session', userId = 'user-1' } = options

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Load chat history
  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch(`/api/chat/history?sessionId=${sessionId}`)
      const data = await res.json()

      if (data.success) {
        setMessages(data.data || [])
        setError(null)
      } else {
        setError(data.error || 'Failed to load chat history')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [sessionId])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Send message
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return

      // Add user message optimistically
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        userId,
        username: 'You',
        content,
        timestamp: new Date().toISOString(),
        isBot: false,
      }

      setMessages((prev) => [...prev, userMessage])
      setInput('')
      setError(null)

      try {
        // Subscribe to bot response via SSE
        const response = await fetch('/api/chat/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            userId,
            content,
          }),
        })

        if (!response.ok) throw new Error('Failed to send message')

        const data = await response.json()

        if (data.success && data.data) {
          setMessages((prev) => [...prev, data.data])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        // Remove optimistic message on error
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMessage.id)
        )
      }
    },
    [sessionId, userId]
  )

  // Subscribe to real-time updates with auto-reconnect
  useEffect(() => {
    loadHistory()

    let reconnectAttempts = 0
    const maxReconnectAttempts = 5
    const reconnectDelay = 3000

    function connectSSE() {
      try {
        const eventSource = new EventSource(`/api/chat/stream?sessionId=${sessionId}`)

        eventSource.onmessage = (event) => {
          try {
            // Skip heartbeat comments
            if (event.data.startsWith(':')) return

            const message = JSON.parse(event.data)

            // Skip connection confirmation messages
            if (message.type === 'connection') return

            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === message.id)) return prev
              return [...prev, message]
            })

            // Reset error on successful message
            setError(null)
            reconnectAttempts = 0
          } catch (e) {
            // JSON parse error or heartbeat, ignore
          }
        }

        eventSource.onerror = () => {
          eventSource.close()

          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++
            setError(`Connection lost. Reconnecting (${reconnectAttempts}/${maxReconnectAttempts})...`)
            setTimeout(connectSSE, reconnectDelay)
          } else {
            setError('Connection failed. Please refresh the page.')
          }
        }

        eventSourceRef.current = eventSource
      } catch (e) {
        console.error('Failed to connect SSE:', e)
        setError('Connection error. Please try again.')
      }
    }

    connectSSE()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [sessionId, loadHistory])

  return {
    messages,
    input,
    isLoading,
    error,
    setInput,
    sendMessage,
    messagesEndRef,
  }
}
