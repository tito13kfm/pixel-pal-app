import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
})

test('gear icon opens AI settings panel', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.click('[title="AI Settings"]')
  // Actual heading is '▸ AI SETTINGS ▸' — getByText with partial match works
  await expect(page.getByText('AI SETTINGS')).toBeVisible()
})

test('AI settings panel closes on backdrop click', async ({ page }) => {
  await page.goto('/')
  await page.click('[title="AI Settings"]')
  await expect(page.getByText('AI SETTINGS')).toBeVisible()

  // Click the backdrop (outside the panel)
  await page.mouse.click(10, 10)
  // Panel is conditionally rendered — when closed it's removed from DOM
  await expect(page.getByText('AI SETTINGS')).not.toBeAttached()
})

test('provider selection updates base URL', async ({ page }) => {
  await page.goto('/')
  await page.click('[title="AI Settings"]')

  await page.selectOption('select', 'openai')
  // Base URL input has placeholder="https://api.example.com/v1"
  // After selecting openai, value becomes 'https://api.openai.com/v1'
  const baseUrl = await page.locator('input[placeholder="https://api.example.com/v1"]').inputValue()
  expect(baseUrl).toBe('https://api.openai.com/v1')
})

test('AI config persists across reload', async ({ page }) => {
  await page.goto('/')
  await page.click('[title="AI Settings"]')

  await page.selectOption('select', 'xai')
  // API key input has type="password"
  await page.locator('input[type="password"]').fill('test-key-123')
  // Model input: after selecting xai, placeholder = 'grok-3-mini' (the modelExample)
  // Fill the model field — it's the last text input in the panel
  const modelInput = page.locator('input[type="text"]').last()
  await modelInput.fill('grok-3-mini')
  // Use exact match — 'SAVE' button in panel vs 'Saved Palettes (0)' accordion both match /save/i
  await page.getByRole('button', { name: 'SAVE', exact: true }).click()

  // Reload — localStorage persists in Playwright's browser context
  await page.reload()
  await page.waitForLoadState('networkidle')
  await page.click('[title="AI Settings"]')

  const key = await page.locator('input[type="password"]').inputValue()
  expect(key).toBe('test-key-123')
})

test('instructions toggle shows and hides hint text', async ({ page }) => {
  await page.goto('/')
  await page.click('[title="AI Settings"]')

  // Default provider is 'anthropic' which has a hint, so toggle is present
  const toggle = page.getByText('How do I set this up?')
  await expect(toggle).toBeVisible()

  // Initially hidden — hint text is not rendered when showInstructions=false
  const hint = page.getByText(/Get a key at/)
  await expect(hint).not.toBeAttached()

  // Click to show
  await toggle.click()
  await expect(hint).toBeVisible()

  // Click to hide
  await toggle.click()
  await expect(hint).not.toBeAttached()
})
