// tests/e2e/web-build.spec.ts
//
// Runs against `vite preview` of the web build (`npm run build:web`).
// Verifies IS_WEB-only UI: provider filter, key warning, footer link.

import { test, expect } from '@playwright/test'

const BASE = '/pixel-pal-app/'
const AI_TAB_TITLE = 'Describe a subject, mood, or scene and let AI pick the palette'

async function goToAIMode(page) {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  await page.click(`[title="${AI_TAB_TITLE}"]`)
}

test.beforeEach(async ({ page }) => {
  // Skip the onboarding tour — same pattern as existing e2e specs.
  await page.addInitScript(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
})

test('app loads with no page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  expect(errors).toHaveLength(0)
})

test('AI settings: Anthropic and Ollama absent from provider dropdown', async ({ page }) => {
  await goToAIMode(page)
  await page.click('[title="AI Settings"]')
  await expect(page.getByText('AI SETTINGS')).toBeVisible()
  const options = await page.locator('select').first().locator('option').allInnerTexts()
  const lower = options.map(o => o.toLowerCase()).join(' ')
  expect(lower).not.toContain('anthropic')
  expect(lower).not.toContain('ollama')
  expect(lower).toContain('openai')
  expect(lower).toContain('xai')
  expect(lower).toContain('google')
  expect(lower).toContain('openrouter')
})

test('WebKeyWarning banner renders and dismiss persists', async ({ page }) => {
  await goToAIMode(page)
  await page.click('[title="AI Settings"]')
  const banner = page.getByText('KEY STORAGE NOTICE')
  await expect(banner).toBeVisible()
  await page.getByLabel('Dismiss warning').click()
  await expect(banner).not.toBeAttached()
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.click(`[title="${AI_TAB_TITLE}"]`)
  await page.click('[title="AI Settings"]')
  await expect(page.getByText('KEY STORAGE NOTICE')).not.toBeAttached()
})

test('footer "Get the desktop app" link present', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  const link = page.getByRole('link', { name: /get the desktop app/i })
  await expect(link).toBeAttached()
  await expect(link).toHaveAttribute('href', /github\.com\/tito13kfm\/pixel-pal-app\/releases/)
  await expect(link).toHaveAttribute('target', '_blank')
})

test('custom provider shows CORS hint', async ({ page }) => {
  await goToAIMode(page)
  await page.click('[title="AI Settings"]')
  await page.selectOption('select', 'custom')
  await expect(page.getByText(/browser CORS may block your endpoint/i)).toBeVisible()
})
