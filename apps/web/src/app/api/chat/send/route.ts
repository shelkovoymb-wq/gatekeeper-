import { NextRequest, NextResponse } from 'next/server'
import type { ChatMessage, ApiResponse } from '@/types'
import type { ChatMessage as MessageType } from '@/types/chat'
import { parseCommand, generateAgentResponse, getAgentInfo } from '@/lib/bot/commands'

function generateBotResponse(userMessage: string): MessageType {
  // Parse command and extract agent
  const { agent, content } = parseCommand(userMessage)
  const agentInfo = getAgentInfo(agent)

  // Generate response based on agent
  const responseContent = generateAgentResponse(agent, content)

  return {
    id: `msg-${Date.now()}`,
    userId: 'bot',
    username: agentInfo.name,
    content: `${agentInfo.emoji} **${agentInfo.name}**\n\n${responseContent}`,
    timestamp: new Date().toISOString(),
    isBot: true,
  }
}

export async function POST(request: NextRequest) {
  const { sessionId, userId, content } = await request.json()

  if (!content || !content.trim()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Message content is required',
      },
      { status: 400 }
    )
  }

  // Debug: log parsed command
  const parsed = parseCommand(content)
  console.log('[Chat API] Message:', { content, agent: parsed.agent, parsedContent: parsed.content })

  // Generate bot response with command routing
  const botMessage = generateBotResponse(content)

  // Simulate processing delay (would be API call to n8n in production)
  await new Promise((resolve) => setTimeout(resolve, 800))

  const response: ApiResponse<MessageType> = {
    success: true,
    data: botMessage,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(response)
}
