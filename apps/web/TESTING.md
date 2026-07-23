# Testing Guide

## E2E Testing with Playwright & Auto-Inspector

### Quick Start

```bash
# Run all E2E tests
npm run test:e2e

# Run with interactive UI
npm run test:e2e:ui

# Run only component inspection tests
npm run test:inspect

# Debug a specific test
npm run test:e2e:debug
```

### Available Test Suites

1. **admin.spec.ts** — Core admin dashboard functionality
   - Navigation between pages
   - Component visibility
   - Data loading
   - Responsive design

2. **component-inspection.spec.ts** — Component analysis with Auto-Inspector
   - Component structure inspection
   - Accessibility validation
   - Screenshot generation
   - Component coverage report

### Auto-Inspector Features

The custom `AutoInspector` class provides:

#### Inspect Components
```typescript
const inspector = new AutoInspector(page)

// Inspect a single component
const sidebarInfo = await inspector.inspectComponent('aside')

// Inspect all matching elements
const tiles = await inspector.inspectAll('div[class*="rounded-lg"]')

// Take full page snapshot
const snapshot = await inspector.takeSnapshot()
```

#### Accessibility Validation
```typescript
const accessibility = await inspector.checkAccessibility('button')
// Returns: { hasRole, hasLabel, isKeyboardAccessible }
```

#### Visual Debugging
```typescript
// Highlight elements with colored outlines
await inspector.highlight('aside', 'red')
await page.screenshot()
await inspector.clearHighlights()
```

#### Component Reports
```typescript
const report = await inspector.generateReport({
  sidebar: 'aside',
  mainContent: 'main',
  buttons: 'button'
})
```

### Test Structure

Tests follow the AAA pattern (Arrange-Act-Assert):

```typescript
test('validates component visibility', async ({ page }) => {
  // Arrange
  const inspector = new AutoInspector(page)
  await page.goto('/admin/stats')

  // Act
  const component = await inspector.inspectComponent('aside')

  // Assert
  expect(component.isVisible).toBe(true)
})
```

### Debug Mode

For debugging specific tests:

```bash
# Interactive test runner
npm run test:e2e:debug

# View test report after run
npx playwright show-report
```

### Screenshots & Artifacts

Tests automatically capture:
- **Screenshots** on test failure (saved in `test-results/`)
- **Video recordings** on test failure (saved in `test-results/`)
- **Traces** for debugging (saved in `test-results/`)

View the HTML report:
```bash
npx playwright show-report
```

### Performance Testing

To measure component rendering performance:

```typescript
test('measures component render time', async ({ page }) => {
  const startTime = Date.now()
  await page.goto('/admin/stats')
  await page.waitForLoadState('networkidle')
  const renderTime = Date.now() - startTime

  expect(renderTime).toBeLessThan(3000) // Should load in < 3s
})
```

### Continuous Integration

For CI/CD pipelines:

```bash
# Run in CI mode (single worker, no reuse)
CI=true npm run test:e2e

# Generate reports
npm run test:e2e -- --reporter html
```

### Configuration

See `playwright.config.ts` for:
- Browser selection (Chromium by default)
- Base URL (http://localhost:3002)
- Test timeouts
- Retry logic
- Video/screenshot settings

### Troubleshooting

**Tests fail with "Navigation failed"**
- Ensure dev server is running: `npm run dev`
- Check if port 3002 is available

**Element not found**
- Use `--debug` mode to inspect page state
- Check if element is rendered dynamically
- Add `waitForLoadState('networkidle')`

**Flaky tests**
- Add explicit waits: `await page.waitForLoadState()`
- Increase timeout: `test.setTimeout(30000)`
- Check for race conditions

### Best Practices

1. **Use data-testid** for reliable selectors
2. **Wait for network** before assertions: `await page.waitForLoadState('networkidle')`
3. **Avoid hard timeouts** — use proper wait conditions
4. **Test user flows** not implementation details
5. **Keep tests isolated** — no dependencies between tests
6. **Use fixtures** for common setup

### Next Steps

- Add unit tests for components (Vitest)
- Add visual regression tests
- Integrate with CI/CD pipeline
- Add performance monitoring
