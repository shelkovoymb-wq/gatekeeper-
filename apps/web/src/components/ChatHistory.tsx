'use client'

import { ChatMessage } from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/types/chat'

interface ChatHistoryProps {
  messages: ChatMessageType[]
  isLoading: boolean
  messagesEndRef?: React.RefObject<HTMLDivElement>
}

export function ChatHistory({
  messages,
  isLoading,
  messagesEndRef,
}: ChatHistoryProps) {
  return (
    <div
      className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-800 via-slate-800 to-slate-900"
      role="log"
      aria-label="Chat history"
      aria-live="polite"
      aria-atomic="false"
    >
      {messages.length === 0 && !isLoading ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="text-6xl mb-6 opacity-80">💬</div>
            <p className="text-slate-300 text-xl font-semibold">No messages yet</p>
            <p className="text-slate-400 text-sm mt-2">Start a conversation with the AI assistant below!</p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}

          {isLoading && (
            <div className="flex gap-4 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-600 flex items-center justify-center text-white text-sm font-bold shadow-lg">
                🤖
              </div>

              <div className="flex gap-2 items-end pt-3">
                <div className="w-3 h-3 bg-primary-400 rounded-full animate-bounce" />
                <div className="w-3 h-3 bg-secondary-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-3 h-3 bg-accent-400 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  )
}
