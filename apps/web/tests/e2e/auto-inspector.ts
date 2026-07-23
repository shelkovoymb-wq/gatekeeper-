import { Page } from '@playwright/test'

/**
 * Auto Inspector integration for component inspection and element tracking
 * Enables detailed DOM analysis, component state inspection, and test artifact generation
 */

interface ComponentInfo {
  name: string
  selector: string
  isVisible: boolean
  role?: string
  ariaLabel?: string
  testId?: string
  classes: string[]
  children: number
}

interface PageSnapshot {
  url: string
  title: string
  timestamp: string
  components: ComponentInfo[]
}

export class AutoInspector {
  constructor(private page: Page) {}

  /**
   * Inspect a component and gather detailed information
   */
  async inspectComponent(selector: string): Promise<ComponentInfo> {
    const element = this.page.locator(selector).first()

    const info = await element.evaluate((el) => ({
      isVisible: (el as HTMLElement).offsetParent !== null,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      testId: el.getAttribute('data-testid'),
      classes: Array.from(el.classList),
      children: el.children.length,
      tagName: el.tagName.toLowerCase(),
      text: el.textContent?.slice(0, 100),
    }))

    return {
      name: `${info.tagName}${info.testId ? `#${info.testId}` : ''}`,
      selector,
      ...info,
    }
  }

  /**
   * Inspect all components on current page matching a selector pattern
   */
  async inspectAll(selectorPattern: string): Promise<ComponentInfo[]> {
    const elements = this.page.locator(selectorPattern)
    const count = await elements.count()

    const components: ComponentInfo[] = []

    for (let i = 0; i < Math.min(count, 50); i++) {
      try {
        const selector = `${selectorPattern} >> nth=${i}`
        const info = await this.inspectComponent(selector)
        components.push(info)
      } catch (e) {
        console.warn(`Failed to inspect element ${i}:`, e)
      }
    }

    return components
  }

  /**
   * Take a full page snapshot with component information
   */
  async takeSnapshot(): Promise<PageSnapshot> {
    const url = this.page.url()
    const title = await this.page.title()

    const components = await this.inspectAll('[class*=""]')

    return {
      url,
      title,
      timestamp: new Date().toISOString(),
      components: components.slice(0, 100),
    }
  }

  /**
   * Highlight an element for visual debugging
   */
  async highlight(selector: string, color = 'red'): Promise<void> {
    await this.page.locator(selector).first().evaluate((el, color) => {
      ;(el as HTMLElement).style.outline = `3px solid ${color}`
      ;(el as HTMLElement).style.outlineOffset = '2px'
    }, color)
  }

  /**
   * Remove highlights
   */
  async clearHighlights(): Promise<void> {
    await this.page.evaluate(() => {
      document.querySelectorAll('[style*="outline"]').forEach((el) => {
        ;(el as HTMLElement).style.outline = ''
      })
    })
  }

  /**
   * Validate component accessibility
   */
  async checkAccessibility(selector: string): Promise<{
    hasRole: boolean
    hasLabel: boolean
    isKeyboardAccessible: boolean
  }> {
    const element = this.page.locator(selector).first()

    return {
      hasRole: !!(await element.getAttribute('role')),
      hasLabel: !!(await element.getAttribute('aria-label')),
      isKeyboardAccessible: await element.evaluate((el) => {
        const tabindex = (el as HTMLElement).getAttribute('tabindex')
        return (
          (el as HTMLElement).tagName === 'BUTTON' ||
          (el as HTMLElement).tagName === 'A' ||
          (tabindex && parseInt(tabindex) >= 0)
        )
      }),
    }
  }

  /**
   * Generate component coverage report
   */
  async generateReport(
    selectors: Record<string, string>
  ): Promise<Record<string, ComponentInfo>> {
    const report: Record<string, ComponentInfo> = {}

    for (const [name, selector] of Object.entries(selectors)) {
      try {
        report[name] = await this.inspectComponent(selector)
      } catch (e) {
        console.warn(`Failed to inspect ${name}:`, e)
      }
    }

    return report
  }
}
