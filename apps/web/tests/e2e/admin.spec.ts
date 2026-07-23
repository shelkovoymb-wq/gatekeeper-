import { test, expect } from '@playwright/test'

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('redirects to /admin/stats', async ({ page }) => {
    expect(page.url()).toContain('/admin/stats')
  })

  test('sidebar navigation is visible', async ({ page }) => {
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    const navItems = page.locator('aside a')
    await expect(navItems).toHaveCount(4)
  })

  test('displays statistics cards', async ({ page }) => {
    await expect(page.locator('text=Total Channels')).toBeVisible()
    await expect(page.locator('text=Active Channels')).toBeVisible()
    await expect(page.locator('text=Total Users')).toBeVisible()
    await expect(page.locator('text=Total Messages')).toBeVisible()
  })

  test('displays revenue card', async ({ page }) => {
    await expect(page.locator('text=Revenue')).toBeVisible()
    const revenue = page.locator('text=Total subscription revenue')
    await expect(revenue).toBeVisible()
  })
})

test.describe('Channels Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.click('text=Каналы')
    await page.waitForLoadState('networkidle')
  })

  test('displays channel list', async ({ page }) => {
    const channelCards = page.locator('[class*="rounded-lg"][class*="border"]')
    const count = await channelCards.count()
    expect(count).toBeGreaterThan(0)
  })

  test('shows channel details', async ({ page }) => {
    await expect(page.locator('text=AI Mastery')).toBeVisible()
    await expect(page.locator('text=DevOps Daily')).toBeVisible()
  })

  test('can open new channel form', async ({ page }) => {
    await page.click('text=New Channel')
    await expect(page.locator('text=Channel creation form')).toBeVisible()
  })
})

test.describe('Users Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.click('text=Пользователи')
    await page.waitForLoadState('networkidle')
  })

  test('displays user table', async ({ page }) => {
    const table = page.locator('table')
    await expect(table).toBeVisible()
  })

  test('shows user list', async ({ page }) => {
    await expect(page.locator('text=alexsmith')).toBeVisible()
    await expect(page.locator('text=marketingjoe')).toBeVisible()
  })

  test('displays user count', async ({ page }) => {
    const userCount = page.locator('text=Total:')
    await expect(userCount).toBeVisible()
  })
})

test.describe('Navigation', () => {
  test('can navigate between pages', async ({ page }) => {
    await page.goto('/')

    // Go to Channels
    await page.click('text=Каналы')
    await expect(page).toHaveURL(/.*\/admin\/channels/)

    // Go to Users
    await page.click('text=Пользователи')
    await expect(page).toHaveURL(/.*\/admin\/users/)

    // Go to Stats
    await page.click('text=Статистика')
    await expect(page).toHaveURL(/.*\/admin\/stats/)

    // Go to Chat
    await page.click('text=Чат')
    await expect(page).toHaveURL(/.*\/chat/)
  })

  test('sidebar is always visible', async ({ page }) => {
    await page.goto('/admin/channels')
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()

    await page.goto('/admin/users')
    await expect(sidebar).toBeVisible()
  })
})

test.describe('Responsive Design', () => {
  test('layout is responsive', async ({ page }) => {
    await page.goto('/')

    // Check main content area is visible
    const main = page.locator('main')
    await expect(main).toBeVisible()

    // Check content is within viewport
    const boundingBox = await main.boundingBox()
    expect(boundingBox).toBeTruthy()
  })
})
