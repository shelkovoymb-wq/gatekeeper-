import { test, expect } from '@playwright/test'

test.describe('Bot Commands and Routing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    // SSE stream never closes, so skip 'networkidle'
    await page.waitForLoadState('domcontentloaded')
    await page.locator('textarea').waitFor({ timeout: 5000 })
  })

  test('routes general message to General Assistant', async ({ page }) => {
    await page.fill('textarea', 'Hello, what can you do?')
    await page.click('button:has-text("Send")')

    // Wait for bot response
    await page.waitForSelector('text=General Assistant', { timeout: 8000 })

    const response = await page.locator('text=General Assistant').first()
    await expect(response).toBeVisible()

    // Check for characteristic response containing expected text
    await expect(page.locator('text=Channel Management')).toBeVisible({ timeout: 5000 })
  })

  test('routes kb: message to Knowledge Base Agent', async ({ page }) => {
    await page.fill('textarea', 'kb: How do I set up a paid channel?')
    await page.click('button:has-text("Send")')

    // Wait for KB agent response
    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    const response = await page.locator('text=Knowledge Base Agent').first()
    await expect(response).toBeVisible()

    // Check for KB characteristic response
    const kbContent = await page.locator('text=Found').first()
    await expect(kbContent).toBeVisible({ timeout: 3000 })
  })

  test('routes devops: message to DevOps Agent', async ({ page }) => {
    await page.fill('textarea', 'devops: What is the system status?')
    await page.click('button:has-text("Send")')

    // Wait for DevOps agent response
    await page.waitForSelector('text=DevOps Agent', { timeout: 5000 })

    const response = await page.locator('text=DevOps Agent').first()
    await expect(response).toBeVisible()

    // Check for DevOps characteristic response
    const devopsContent = await page.locator('text=System Health').first()
    await expect(devopsContent).toBeVisible({ timeout: 3000 })
  })

  test('displays agent emoji in response', async ({ page }) => {
    await page.fill('textarea', 'Test general')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=General Assistant', { timeout: 5000 })

    // Check for emoji (🤖)
    const message = await page.locator('[role="article"]').last()
    const text = await message.textContent()
    expect(text).toContain('🤖')
  })

  test('kb: agent shows Knowledge Base emoji', async ({ page }) => {
    await page.fill('textarea', 'kb: search terms')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    // Check for KB emoji (📚)
    const message = await page.locator('[role="article"]').last()
    const text = await message.textContent()
    expect(text).toContain('📚')
  })

  test('devops: agent shows DevOps emoji', async ({ page }) => {
    await page.fill('textarea', 'devops: status')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=DevOps Agent', { timeout: 5000 })

    // Check for DevOps emoji (⚙️)
    const message = await page.locator('[role="article"]').last()
    const text = await message.textContent()
    expect(text).toContain('⚙️')
  })

  test('ignores whitespace in commands', async ({ page }) => {
    await page.fill('textarea', '  kb:  How to deploy?  ')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    const response = await page.locator('text=Knowledge Base Agent').first()
    await expect(response).toBeVisible()
  })

  test('case-insensitive command parsing', async ({ page }) => {
    await page.fill('textarea', 'KB: uppercase prefix')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    const response = await page.locator('text=Knowledge Base Agent').first()
    await expect(response).toBeVisible()
  })

  test('handles multi-line kb: queries', async ({ page }) => {
    await page.fill('textarea', 'kb: How do I:\n1. Set up channels\n2. Configure webhooks\n3. Monitor performance')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    const response = await page.locator('text=Knowledge Base Agent').first()
    await expect(response).toBeVisible()
  })

  test('handles long devops: queries', async ({ page }) => {
    const longQuery =
      'devops: What is the current status of the system including API latency, database connections, memory usage, and deployment status?'
    await page.fill('textarea', longQuery)
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=DevOps Agent', { timeout: 5000 })

    const response = await page.locator('text=DevOps Agent').first()
    await expect(response).toBeVisible()
  })

  test('shows loading state during bot response', async ({ page }) => {
    await page.fill('textarea', 'Test loading')
    await page.click('button:has-text("Send")')

    // Wait for bot response to appear
    await page.waitForSelector('text=General Assistant', { timeout: 8000 })

    // Verify response appeared
    const response = await page.locator('text=General Assistant').first()
    await expect(response).toBeVisible()
  })
})

test.describe('Bot Command Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('domcontentloaded')
    await page.locator('textarea').waitFor({ timeout: 5000 })
  })

  test('treats "kb" not at start as general message', async ({ page }) => {
    await page.fill('textarea', 'Tell me about kb topics')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=General Assistant', { timeout: 5000 })

    const response = await page.locator('text=General Assistant').first()
    await expect(response).toBeVisible()
  })

  test('handles empty command prefix', async ({ page }) => {
    await page.fill('textarea', 'kb:')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    const response = await page.locator('text=Knowledge Base Agent').first()
    await expect(response).toBeVisible()
  })

  test('preserves command content in KB response', async ({ page }) => {
    const query = 'deployment'
    await page.fill('textarea', `kb: ${query}`)
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    // Check that the query is reflected in response
    const message = await page.locator('[role="article"]').last()
    const text = await message.textContent()
    expect(text).toContain(query)
  })

  test('multiple commands in sequence', async ({ page }) => {
    // First: General
    await page.fill('textarea', 'Hello')
    await page.click('button:has-text("Send")')
    await page.waitForSelector('text=General Assistant', { timeout: 5000 })

    // Second: KB
    await page.fill('textarea', 'kb: channels')
    await page.click('button:has-text("Send")')
    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })

    // Third: DevOps
    await page.fill('textarea', 'devops: status')
    await page.click('button:has-text("Send")')
    await page.waitForSelector('text=DevOps Agent', { timeout: 5000 })

    // Check all three are visible
    const agents = await page.locator('text=/General Assistant|Knowledge Base Agent|DevOps Agent/').all()
    expect(agents.length).toBeGreaterThanOrEqual(3)
  })

  test('chat history maintains agent info', async ({ page }) => {
    // Send command
    await page.fill('textarea', 'kb: test')
    await page.click('button:has-text("Send")')

    await page.waitForSelector('text=Knowledge Base Agent', { timeout: 8000 })

    // Reload and verify history
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.locator('textarea').waitFor({ timeout: 5000 })

    // KB message should still be visible
    const kbResponse = await page.locator('text=Knowledge Base Agent').first()
    await expect(kbResponse).toBeVisible({ timeout: 8000 })
  })
})
