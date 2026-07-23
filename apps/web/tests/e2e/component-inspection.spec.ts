import { test, expect } from '@playwright/test'
import { AutoInspector } from './auto-inspector'

test.describe('Component Inspection with Auto-Inspector', () => {
  let inspector: AutoInspector

  test.beforeEach(async ({ page }) => {
    inspector = new AutoInspector(page)
    await page.goto('/admin/stats')
    await page.waitForLoadState('networkidle')
  })

  test('inspect layout component', async ({ page }) => {
    const sidebarInfo = await inspector.inspectComponent('aside')
    expect(sidebarInfo.isVisible).toBe(true)
    expect(sidebarInfo.classes).toContain('w-64')
  })

  test('inspect stats tiles', async ({ page }) => {
    const tiles = await inspector.inspectAll('div[class*="rounded-lg"][class*="border-slate-200"]')
    expect(tiles.length).toBeGreaterThan(0)

    // Verify each tile is visible
    for (const tile of tiles.slice(0, 4)) {
      const element = page.locator(`text="${tile.name}"`).first()
      await expect(element).toBeVisible()
    }
  })

  test('inspect navigation elements', async ({ page }) => {
    const navItems = await inspector.inspectAll('a[class*="px-4"][class*="py-2"]')
    expect(navItems.length).toBe(4)

    // Check accessibility
    for (const item of navItems) {
      const accessibility = await inspector.checkAccessibility(`a >> text="${item.name}"`)
      expect(accessibility.isKeyboardAccessible).toBe(true)
    }
  })

  test('take component snapshot', async ({ page }) => {
    const snapshot = await inspector.takeSnapshot()

    expect(snapshot.url).toContain('/admin/stats')
    expect(snapshot.title).toBe('n8nHarness Admin')
    expect(snapshot.components.length).toBeGreaterThan(0)

    // Verify snapshot contains key components
    const componentNames = snapshot.components.map((c) => c.name)
    expect(componentNames.some((n) => n.includes('aside'))).toBe(true)
  })

  test('validate component accessibility', async ({ page }) => {
    const report = await inspector.generateReport({
      sidebar: 'aside',
      mainContent: 'main',
      navButtons: 'aside a',
    })

    expect(report.sidebar.isVisible).toBe(true)
    expect(report.mainContent.isVisible).toBe(true)
    expect(report.navButtons.children).toBeGreaterThan(0)
  })

  test('highlight components for debugging', async ({ page }) => {
    // Highlight sidebar
    await inspector.highlight('aside', 'red')
    await page.screenshot({ path: 'tests/e2e/screenshots/sidebar-highlighted.png' })

    // Highlight main content
    await inspector.highlight('main', 'blue')
    await page.screenshot({ path: 'tests/e2e/screenshots/main-highlighted.png' })

    // Clear highlights
    await inspector.clearHighlights()
  })
})

test.describe('Channels Page Components', () => {
  let inspector: AutoInspector

  test.beforeEach(async ({ page }) => {
    inspector = new AutoInspector(page)
    await page.goto('/admin/channels')
    await page.waitForLoadState('networkidle')
  })

  test('inspect channel cards', async ({ page }) => {
    const cards = await inspector.inspectAll('div[class*="grid"]')
    expect(cards.length).toBeGreaterThan(0)
  })

  test('validate channel card structure', async ({ page }) => {
    const cardInfo = await inspector.inspectComponent(
      'div[class*="rounded-lg"][class*="border-slate-200"]'
    )

    expect(cardInfo.isVisible).toBe(true)
    expect(cardInfo.children).toBeGreaterThan(0)
  })

  test('inspect new channel button', async ({ page }) => {
    const buttonInfo = await inspector.inspectComponent('button >> text="New Channel"')
    expect(buttonInfo.isVisible).toBe(true)

    const accessibility = await inspector.checkAccessibility('button >> text="New Channel"')
    expect(accessibility.isKeyboardAccessible).toBe(true)
  })
})

test.describe('Users Table Components', () => {
  let inspector: AutoInspector

  test.beforeEach(async ({ page }) => {
    inspector = new AutoInspector(page)
    await page.goto('/admin/users')
    await page.waitForLoadState('networkidle')
  })

  test('inspect table structure', async ({ page }) => {
    const tableInfo = await inspector.inspectComponent('table')
    expect(tableInfo.isVisible).toBe(true)
  })

  test('inspect table rows', async ({ page }) => {
    const rows = await inspector.inspectAll('tr')
    expect(rows.length).toBeGreaterThan(0)
  })

  test('validate table accessibility', async ({ page }) => {
    const accessibility = await inspector.checkAccessibility('table')
    expect(accessibility.hasRole || accessibility.isKeyboardAccessible).toBe(true)
  })
})
