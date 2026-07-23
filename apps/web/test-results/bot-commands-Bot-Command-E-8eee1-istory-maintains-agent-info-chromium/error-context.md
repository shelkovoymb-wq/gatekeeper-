# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bot-commands.spec.ts >> Bot Command Edge Cases >> chat history maintains agent info
- Location: tests\e2e\bot-commands.spec.ts:207:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Knowledge Base Agent').first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for locator('text=Knowledge Base Agent').first()

```

```yaml
- complementary:
  - heading "n8nHarness" [level=1]
  - paragraph: Admin Panel
  - navigation:
    - link "Каналы":
      - /url: /admin/channels
    - link "Пользователи":
      - /url: /admin/users
    - link "Статистика":
      - /url: /admin/stats
    - link "Чат":
      - /url: /chat
- main:
  - heading "Chat with Assistant" [level=1]
  - paragraph: Get help with channels, users, and statistics
  - log "Chat history":
    - 'article "Assistant: Привет! Я n8nHarness Assistant. Чем я могу вам помочь?"':
      - text: A Assistant16:54
      - paragraph: Привет! Я n8nHarness Assistant. Чем я могу вам помочь?
    - 'article "You: Привет! Расскажи о платформе"':
      - text: Y You16:56
      - paragraph: Привет! Расскажи о платформе
    - 'article "Assistant: n8nHarness — это платформа для управления Telegram-каналами с платной подпиской. Она позволяет: • Управлять доступом к каналам • Отслеживать подписки и платежи • Взаимодействовать с пользователями через AI-агентов • Анализировать статистику"':
      - text: A Assistant16:58
      - paragraph: "n8nHarness — это платформа для управления Telegram-каналами с платной подпиской. Она позволяет: • Управлять доступом к каналам • Отслеживать подписки и платежи • Взаимодействовать с пользователями через AI-агентов • Анализировать статистику"
  - search "Message input":
    - textbox "Message input":
      - /placeholder: Ask me anything... (Ctrl+Enter to send)
    - button "Send message" [disabled]: Send
    - paragraph: Ctrl+Enter to send
  - paragraph: Powered by n8nHarness • Chat messages are stored securely
- alert
```

# Test source

```ts
  121 |   test('handles long devops: queries', async ({ page }) => {
  122 |     const longQuery =
  123 |       'devops: What is the current status of the system including API latency, database connections, memory usage, and deployment status?'
  124 |     await page.fill('textarea', longQuery)
  125 |     await page.click('button:has-text("Send")')
  126 | 
  127 |     await page.waitForSelector('text=DevOps Agent', { timeout: 5000 })
  128 | 
  129 |     const response = await page.locator('text=DevOps Agent').first()
  130 |     await expect(response).toBeVisible()
  131 |   })
  132 | 
  133 |   test('shows loading state during bot response', async ({ page }) => {
  134 |     await page.fill('textarea', 'Test loading')
  135 |     await page.click('button:has-text("Send")')
  136 | 
  137 |     // Wait for bot response to appear
  138 |     await page.waitForSelector('text=General Assistant', { timeout: 8000 })
  139 | 
  140 |     // Verify response appeared
  141 |     const response = await page.locator('text=General Assistant').first()
  142 |     await expect(response).toBeVisible()
  143 |   })
  144 | })
  145 | 
  146 | test.describe('Bot Command Edge Cases', () => {
  147 |   test.beforeEach(async ({ page }) => {
  148 |     await page.goto('/chat')
  149 |     await page.waitForLoadState('domcontentloaded')
  150 |     await page.locator('textarea').waitFor({ timeout: 5000 })
  151 |   })
  152 | 
  153 |   test('treats "kb" not at start as general message', async ({ page }) => {
  154 |     await page.fill('textarea', 'Tell me about kb topics')
  155 |     await page.click('button:has-text("Send")')
  156 | 
  157 |     await page.waitForSelector('text=General Assistant', { timeout: 5000 })
  158 | 
  159 |     const response = await page.locator('text=General Assistant').first()
  160 |     await expect(response).toBeVisible()
  161 |   })
  162 | 
  163 |   test('handles empty command prefix', async ({ page }) => {
  164 |     await page.fill('textarea', 'kb:')
  165 |     await page.click('button:has-text("Send")')
  166 | 
  167 |     await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })
  168 | 
  169 |     const response = await page.locator('text=Knowledge Base Agent').first()
  170 |     await expect(response).toBeVisible()
  171 |   })
  172 | 
  173 |   test('preserves command content in KB response', async ({ page }) => {
  174 |     const query = 'deployment'
  175 |     await page.fill('textarea', `kb: ${query}`)
  176 |     await page.click('button:has-text("Send")')
  177 | 
  178 |     await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })
  179 | 
  180 |     // Check that the query is reflected in response
  181 |     const message = await page.locator('[role="article"]').last()
  182 |     const text = await message.textContent()
  183 |     expect(text).toContain(query)
  184 |   })
  185 | 
  186 |   test('multiple commands in sequence', async ({ page }) => {
  187 |     // First: General
  188 |     await page.fill('textarea', 'Hello')
  189 |     await page.click('button:has-text("Send")')
  190 |     await page.waitForSelector('text=General Assistant', { timeout: 5000 })
  191 | 
  192 |     // Second: KB
  193 |     await page.fill('textarea', 'kb: channels')
  194 |     await page.click('button:has-text("Send")')
  195 |     await page.waitForSelector('text=Knowledge Base Agent', { timeout: 5000 })
  196 | 
  197 |     // Third: DevOps
  198 |     await page.fill('textarea', 'devops: status')
  199 |     await page.click('button:has-text("Send")')
  200 |     await page.waitForSelector('text=DevOps Agent', { timeout: 5000 })
  201 | 
  202 |     // Check all three are visible
  203 |     const agents = await page.locator('text=/General Assistant|Knowledge Base Agent|DevOps Agent/').all()
  204 |     expect(agents.length).toBeGreaterThanOrEqual(3)
  205 |   })
  206 | 
  207 |   test('chat history maintains agent info', async ({ page }) => {
  208 |     // Send command
  209 |     await page.fill('textarea', 'kb: test')
  210 |     await page.click('button:has-text("Send")')
  211 | 
  212 |     await page.waitForSelector('text=Knowledge Base Agent', { timeout: 8000 })
  213 | 
  214 |     // Reload and verify history
  215 |     await page.reload()
  216 |     await page.waitForLoadState('domcontentloaded')
  217 |     await page.locator('textarea').waitFor({ timeout: 5000 })
  218 | 
  219 |     // KB message should still be visible
  220 |     const kbResponse = await page.locator('text=Knowledge Base Agent').first()
> 221 |     await expect(kbResponse).toBeVisible({ timeout: 8000 })
      |                              ^ Error: expect(locator).toBeVisible() failed
  222 |   })
  223 | })
  224 | 
```