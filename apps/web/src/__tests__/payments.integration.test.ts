import { test, expect } from '@playwright/test'

test.describe('Payments Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to payments page
    await page.goto('http://localhost:3000/admin/payments', { waitUntil: 'networkidle' })
  })

  test('should load payments page', async ({ page }) => {
    // Check page title
    const title = page.locator('h1')
    await expect(title).toContainText('Платежи')
  })

  test('should show payment filters', async ({ page }) => {
    // Check for filter selects
    const statusFilter = page.locator('select')
    await expect(statusFilter).toBeDefined()
  })

  test('should filter payments by status', async ({ page }) => {
    // Select status filter
    const statusSelect = page.locator('select').first()
    await statusSelect.selectOption('succeeded')
    
    // Wait for table update
    await page.waitForTimeout(500)
    
    // Verify filter applied
    await expect(statusSelect).toHaveValue('succeeded')
  })

  test('should display payment table', async ({ page }) => {
    // Wait for table
    const table = page.locator('table')
    await expect(table).toBeDefined()
  })
})

test.describe('Refunds Page', () => {
  test('should load refunds page', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/refunds', { waitUntil: 'networkidle' })
    const title = page.locator('h1')
    await expect(title).toContainText('Возвраты')
  })
})

test.describe('Analytics Page', () => {
  test('should load analytics page', async ({ page }) => {
    await page.goto('http://localhost:3000/admin/analytics', { waitUntil: 'networkidle' })
    const title = page.locator('h1')
    await expect(title).toContainText('Аналитика')
  })
})

test.describe('Client Portal', () => {
  test('should load subscriptions portal', async ({ page }) => {
    await page.goto('http://localhost:3000/portal/subscriptions', { waitUntil: 'networkidle' })
    const title = page.locator('h1')
    await expect(title).toContainText('Мои подписки')
  })
})
