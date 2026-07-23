import type { ChatMessage as ChatMessageType } from '@/types/chat'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isBot = message.isBot
  const time = new Date(message.timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })

  const username = message.username || (isBot ? 'Assistant' : 'You')
  const firstLetter = (username || 'A').charAt(0).toUpperCase()

  return (
    <div
      className={`flex gap-4 mb-6 ${isBot ? 'flex-row' : 'flex-row-reverse'}`}
      role="article"
      aria-label={`${username}: ${message.content}`}
    >
      {/* Avatar */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-lg ${
          isBot ? 'bg-gradient-to-br from-primary-500 via-secondary-500 to-primary-600' : 'bg-gradient-to-br from-accent-400 via-accent-500 to-pink-600'
        }`}
      >
        {message.avatar ? (
          <img src={message.avatar} alt={username} className="w-full h-full rounded-xl" />
        ) : (
          <span>{firstLetter}</span>
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col ${isBot ? 'items-start' : 'items-end'} max-w-sm lg:max-w-md`}>
        <div className="text-xs mb-2">
          <span className="font-bold text-slate-300">{username}</span>
          <span className="ml-3 text-slate-500">{time}</span>
        </div>

        <div
          className={`rounded-2xl px-5 py-4 break-words shadow-lg backdrop-blur-sm ${
            isBot
              ? 'bg-slate-700/60 text-slate-50 border border-slate-600/50'
              : 'bg-gradient-to-br from-primary-500 via-purple-500 to-primary-600 text-white shadow-xl shadow-primary-500/40'
          }`}
        >
          <p className="text-sm leading-relaxed font-medium">{message.content}</p>
        </div>
      </div>
    </div>
  )
}
