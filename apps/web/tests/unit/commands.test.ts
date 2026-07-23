import { describe, it, expect } from 'vitest'
import { parseCommand, generateAgentResponse, getAgentInfo } from '@/lib/bot/commands'

describe('Command Parser', () => {
  it('parses kb: prefix correctly', () => {
    const result = parseCommand('kb: What is a channel?')
    expect(result.agent).toBe('kb')
    expect(result.content).toBe('What is a channel?')
    expect(result.rawPrefix).toBe('kb:')
  })

  it('parses devops: prefix correctly', () => {
    const result = parseCommand('devops: System status')
    expect(result.agent).toBe('devops')
    expect(result.content).toBe('System status')
    expect(result.rawPrefix).toBe('devops:')
  })

  it('defaults to general for unprefixed messages', () => {
    const result = parseCommand('Hello, how are you?')
    expect(result.agent).toBe('general')
    expect(result.content).toBe('Hello, how are you?')
    expect(result.rawPrefix).toBeUndefined()
  })

  it('handles case-insensitive kb: prefix', () => {
    const result = parseCommand('KB: search terms')
    expect(result.agent).toBe('kb')
    expect(result.content).toBe('search terms')
  })

  it('handles case-insensitive devops: prefix', () => {
    const result = parseCommand('DEVOPS: status check')
    expect(result.agent).toBe('devops')
    expect(result.content).toBe('status check')
  })

  it('strips whitespace before and after message', () => {
    const result = parseCommand('  kb:   query   ')
    expect(result.content).toBe('query')
  })

  it('handles empty content after prefix', () => {
    const result = parseCommand('kb:')
    expect(result.agent).toBe('kb')
    expect(result.content).toBe('')
  })

  it('preserves kb in middle of message for general agent', () => {
    const result = parseCommand('Tell me about kb management')
    expect(result.agent).toBe('general')
    expect(result.content).toContain('kb management')
  })

  it('handles multiline content after prefix', () => {
    const message = 'kb: How to:\n1. Deploy\n2. Monitor\n3. Debug'
    const result = parseCommand(message)
    expect(result.agent).toBe('kb')
    expect(result.content).toContain('How to:')
    expect(result.content).toContain('Deploy')
  })
})

describe('Agent Response Generation', () => {
  it('generates KB response', () => {
    const response = generateAgentResponse('kb', 'channels')
    expect(response).toContain('Knowledge Base Search')
    expect(response).toContain('📚')
    expect(response).toContain('Found')
  })

  it('generates DevOps response', () => {
    const response = generateAgentResponse('devops', 'status')
    expect(response).toContain('DevOps Status Report')
    expect(response).toContain('⚙️')
    expect(response).toContain('System Health')
  })

  it('generates General response', () => {
    const response = generateAgentResponse('general', 'help')
    expect(response).toContain('General Assistant')
    expect(response).toContain('🤖')
    expect(response).toContain('help')
  })

  it('includes query in KB response', () => {
    const query = 'deployment strategy'
    const response = generateAgentResponse('kb', query)
    expect(response).toContain(query)
  })

  it('KB response includes document references', () => {
    const response = generateAgentResponse('kb', 'any')
    expect(response).toContain('Telegram Channel Management')
    expect(response).toContain('n8nHarness Documentation')
    expect(response).toContain('Troubleshooting FAQ')
  })

  it('DevOps response includes system metrics', () => {
    const response = generateAgentResponse('devops', 'health')
    expect(response).toContain('uptime')
    expect(response).toContain('availability')
    expect(response).toContain('latency')
  })

  it('General response explains available commands', () => {
    const response = generateAgentResponse('general', 'help')
    expect(response).toContain('kb:')
    expect(response).toContain('devops:')
  })
})

describe('Agent Info', () => {
  it('returns correct KB agent info', () => {
    const info = getAgentInfo('kb')
    expect(info.name).toBe('Knowledge Base Agent')
    expect(info.emoji).toBe('📚')
    expect(info.description).toContain('documentation')
  })

  it('returns correct DevOps agent info', () => {
    const info = getAgentInfo('devops')
    expect(info.name).toBe('DevOps Agent')
    expect(info.emoji).toBe('⚙️')
    expect(info.description).toContain('operational')
  })

  it('returns correct General agent info', () => {
    const info = getAgentInfo('general')
    expect(info.name).toBe('General Assistant')
    expect(info.emoji).toBe('🤖')
    expect(info.description).toContain('conversational')
  })

  it('all agents have emoji', () => {
    const agents = ['kb', 'devops', 'general'] as const
    agents.forEach((agent) => {
      const info = getAgentInfo(agent)
      expect(info.emoji).toBeTruthy()
      expect(info.emoji.length).toBeGreaterThan(0)
    })
  })
})

describe('Command Edge Cases', () => {
  it('treats "KB" as part of general message if not at start', () => {
    const result = parseCommand('Tell me about KB topics')
    expect(result.agent).toBe('general')
  })

  it('handles "kb:" at start of quoted text', () => {
    const result = parseCommand('"kb: something in quotes"')
    expect(result.agent).toBe('kb')
  })

  it('strips only kb: prefix, not content with kb:', () => {
    const result = parseCommand('kb: What about kb: nested?')
    expect(result.agent).toBe('kb')
    expect(result.content).toContain('nested')
  })

  it('handles very long content', () => {
    const longContent = 'kb: ' + 'A'.repeat(1000)
    const result = parseCommand(longContent)
    expect(result.agent).toBe('kb')
    expect(result.content.length).toBeGreaterThan(900)
  })

  it('handles special characters in content', () => {
    const result = parseCommand('kb: What about @#$%^&*() chars?')
    expect(result.agent).toBe('kb')
    expect(result.content).toContain('@#$%^&*()')
  })

  it('handles unicode in commands', () => {
    const result = parseCommand('kb: 你好 世界')
    expect(result.agent).toBe('kb')
    expect(result.content).toBe('你好 世界')
  })
})
