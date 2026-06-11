// tests/e2e/web-build.spec.ts
//
// Runs against `vite preview` of the web build (`npm run build:web`).
// Verifies IS_WEB-only UI: footer link, base-path, general smoke.

import { test, expect } from '@playwright/test'

const BASE = '/pixel-pal-app/'

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

test('footer "Get the desktop app" link present', async ({ page }) => {
  await page.goto(BASE)
  await page.waitForLoadState('networkidle')
  const link = page.getByRole('link', { name: /get the desktop app/i })
  await expect(link).toBeAttached()
  await expect(link).toHaveAttribute('href', /github\.com\/tito13kfm\/pixel-pal-app\/releases/)
  await expect(link).toHaveAttribute('target', '_blank')
})
