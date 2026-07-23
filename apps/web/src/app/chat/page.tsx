'use client'

import { useEffect, useState } from 'react'
import { ChatHistory } from '@/components/ChatHistory'
import { ChatInput } from '@/components/ChatInput'
import { useChat } from '@/lib/hooks/useChat'

export default function ChatPage() {
  const [mounted, setMounted] = useState(false)
  const { messages, input, isLoading, error, setInput, sendMessage, messagesEndRef } = useChat({
    sessionId: 'default-session',
    userId: 'user-1',
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-500">Loading chat...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 via-secondary-600 to-accent-500 px-8 py-8 shadow-2xl border-b border-accent-400/20">
        <h1 className="text-4xl font-bold text-white mb-2">✨ Chat with AI Assistant</h1>
        <p className="text-white/90 text-sm">
          Powered by n8nHarness • Ask anything or use kb: for knowledge base, devops: for system status
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-danger/20 border-b border-danger/40 px-8 py-4">
          <p className="text-danger font-semibold text-sm">⚠️ {error}</p>
        </div>
      )}

      {/* Chat History */}
      <ChatHistory
        messages={messages}
        isLoading={isLoading}
        messagesEndRef={messagesEndRef}
      />

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={sendMessage}
        isLoading={isLoading}
        placeholder="Ask me anything... Type kb: or devops: for specialized help"
      />

      {/* Footer Info */}
      <div className="bg-slate-800/50 border-t border-slate-700 px-8 py-4 text-center text-xs text-slate-400">
        <p>🚀 n8nHarness v1.0 • AI-powered agent platform • Secure & fast</p>
      </div>
    </div>
  )
}
