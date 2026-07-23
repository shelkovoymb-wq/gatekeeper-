export type BotAgent = 'general' | 'kb' | 'devops'

export interface ParsedCommand {
  agent: BotAgent
  content: string
  rawPrefix?: string
}

export interface BotResponse {
  id: string
  userId: string
  username: string
  content: string
  timestamp: string
  isBot: true
  agent: BotAgent
  metadata?: {
    sourceDocs?: string[]
    systemStatus?: string
    alertLevel?: 'info' | 'warning' | 'critical'
  }
}

/**
 * Parse message and extract command prefix (kb:, devops:)
 * Default to 'general' if no prefix
 */
export function parseCommand(message: string): ParsedCommand {
  const trimmed = message.trim()
  const lowerTrimmed = trimmed.toLowerCase()

  console.log('[parseCommand] Input:', { message, trimmed, lowerTrimmed })

  // Check for KB command
  if (lowerTrimmed.startsWith('kb:')) {
    const result = {
      agent: 'kb' as const,
      content: trimmed.slice(3).trim(),
      rawPrefix: 'kb:',
    }
    console.log('[parseCommand] KB matched:', result)
    return result
  }

  // Check for DevOps command
  if (lowerTrimmed.startsWith('devops:')) {
    const result = {
      agent: 'devops' as const,
      content: trimmed.slice(7).trim(),
      rawPrefix: 'devops:',
    }
    console.log('[parseCommand] DevOps matched:', result)
    return result
  }

  // Default to general
  const result = {
    agent: 'general' as const,
    content: trimmed,
  }
  console.log('[parseCommand] General (default):', result)
  return result
}

/**
 * Generate agent-specific responses
 */
export function generateAgentResponse(
  agent: BotAgent,
  query: string
): string {
  const responses: Record<BotAgent, (q: string) => string> = {
    kb: (q) => {
      return `**Knowledge Base Search: "${q}"**\n\n📚 Found 3 documents:\n\n1. **Telegram Channel Management Guide**\n   - Setting up paid channels\n   - Member verification\n   - Payment processing\n\n2. **n8nHarness Documentation**\n   - Architecture overview\n   - API endpoints\n   - Deployment guide\n\n3. **Troubleshooting FAQ**\n   - Common issues and solutions\n   - Performance tuning\n   - Security best practices`
    },
    devops: (q) => {
      return `**DevOps Status Report**\n\n✅ **System Health:**\n- n8n Server: Running (uptime 45 days)\n- PostgreSQL: Healthy (99.98% availability)\n- MAX Messenger API: Connected\n- DeepSeek API: Responding normally\n\n⚠️ **Alerts (0 critical):**\n- Memory usage: 68% (normal)\n- API latency: 145ms avg (good)\n- Message queue depth: 12 (low)\n\n🔧 **Recent Deployments:**\n- Heartbeat Worker v2.1.2 (2 days ago)\n- Frontend v0.1.0 (today)`
    },
    general: (q) => {
      return `I'm the General Assistant. I can help you with:\n\n• **Channel Management** - info about managing Telegram channels\n• **User Statistics** - subscriber counts and engagement\n• **Payment Tracking** - subscription and revenue data\n• **Bot Configuration** - settings and integrations\n\nTry asking specific questions, or prefix with:\n- **kb:** for knowledge base search\n- **devops:** for system status\n\nYour question: "${q}"`
    },
  }

  return responses[agent](query)
}

/**
 * Get agent description and emoji
 */
export function getAgentInfo(agent: BotAgent): {
  name: string
  emoji: string
  description: string
} {
  const info: Record<
    BotAgent,
    { name: string; emoji: string; description: string }
  > = {
    general: {
      name: 'General Assistant',
      emoji: '🤖',
      description: 'Conversational AI for general queries',
    },
    kb: {
      name: 'Knowledge Base Agent',
      emoji: '📚',
      description: 'Search and synthesize documentation',
    },
    devops: {
      name: 'DevOps Agent',
      emoji: '⚙️',
      description: 'System status and operational info',
    },
  }

  return info[agent]
}
