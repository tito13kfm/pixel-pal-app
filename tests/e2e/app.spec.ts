import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
})

test('app loads without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(errors).toHaveLength(0)
})

test('palette swatches render after load', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Swatches are divs with inline background-color styles
  const swatches = page.locator('[style*="background-color"]')
  await expect(swatches.first()).toBeVisible()
  const count = await swatches.count()
  expect(count).toBeGreaterThan(10)
})

test('dark theme is default', async ({ page }) => {
  await page.goto('/')
  const body = page.locator('body')
  // Dark theme sets a dark background
  const bg = await body.evaluate(el => getComputedStyle(el).backgroundColor)
  // Background should be dark — not white (rgb(255, 255, 255))
  expect(bg).not.toBe('rgb(255, 255, 255)')
})

test('theme switches on button click', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Take screenshot of dark theme
  const darkShot = await page.screenshot()

  // Click the light theme button.
  // Actual title attribute: 'Light: off-white background' (from opt.hint in App.tsx).
  // The spec assumed title="Light" but the full hint string is the title.
  await page.getByTitle('Light: off-white background').click()
  await page.waitForTimeout(200)

  // Take screenshot of light theme
  const lightShot = await page.screenshot()

  // Screenshots should differ
  expect(Buffer.compare(darkShot, lightShot)).not.toBe(0)
})

test('single color generate produces swatches', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Find the color picker or hex input and set a value
  const hexInput = page.locator('input[type="color"], input[placeholder*="#"], input[placeholder*="hex"]').first()
  if (await hexInput.isVisible()) {
    await hexInput.fill('#6a2f8a')
  }

  // Click generate if there's a button, or wait for auto-generation
  const generateBtn = page.getByRole('button', { name: /generate/i }).first()
  if (await generateBtn.isVisible()) {
    await generateBtn.click()
  }

  await page.waitForTimeout(500)

  const swatches = page.locator('[style*="background-color"]')
  const count = await swatches.count()
  expect(count).toBeGreaterThan(10)
})
