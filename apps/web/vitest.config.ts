import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Юнит-тесты живут в tests/unit. Каталог tests/e2e — это Playwright
// (см. playwright.config.ts, запуск через `pnpm test:e2e`); если пустить туда
// vitest, он падает на `test.describe` из @playwright/test.
export default defineConfig({
  // Тот же алиас @/ → src, что и в tsconfig.json — vitest не читает paths оттуда.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
  },
})
