export interface ChatMessage {
  id: string
  userId: string
  username: string
  content: string
  timestamp: string
  isBot: boolean
  avatar?: string
}

export interface ChatSession {
  id: string
  userId: string
  channelId?: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface ChatResponse {
  success: boolean
  data?: ChatMessage | ChatMessage[]
  error?: string
}
