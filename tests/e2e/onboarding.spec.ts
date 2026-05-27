import { test, expect } from '@playwright/test'

// Helper: clear the tour-seen flag so every test starts fresh
async function clearTourSeen(page) {
  await page.evaluate(() => localStorage.removeItem('pixel-pal-tour-seen'))
}

test.describe('Onboarding tour', () => {
  test('auto-opens on first launch', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Panel should appear automatically (component renders "Guides", CSS uppercase is visual only)
    await expect(page.getByText('Guides', { exact: true })).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()
  })

  test('completes tour and sets localStorage flag', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Click through all 4 steps
    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Input modes')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Palette ramps')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()

    // Panel should close and localStorage flag set
    await expect(page.getByText('Guides', { exact: true })).not.toBeAttached()
    const seen = await page.evaluate(() => localStorage.getItem('pixel-pal-tour-seen'))
    expect(seen).toBe('1')
  })

  test('does NOT auto-open on subsequent launches', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Set the flag directly so we simulate a returning user
    await page.evaluate(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800) // wait longer than the 600ms delay

    await expect(page.getByText('Welcome to PIXEL.PAL')).not.toBeAttached()
  })

  test('skip closes tour and sets flag', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Skip', exact: true }).click()

    await expect(page.getByText('Guides', { exact: true })).not.toBeAttached()
    const seen = await page.evaluate(() => localStorage.getItem('pixel-pal-tour-seen'))
    expect(seen).toBe('1')
  })
})

test.describe('"?" button and guide select', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Suppress auto-open so tests control when panel appears
    await page.evaluate(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
    await page.reload()
    await page.waitForLoadState('networkidle')
  })

  test('"?" button opens guide-select panel', async ({ page }) => {
    await page.getByTitle('Open guides').click()
    await expect(page.getByText('Guides', { exact: true })).toBeVisible()
    await expect(page.getByText('Quick tour')).toBeVisible()
    await expect(page.getByText('Show me how to...')).toBeVisible()
  })

  test('"?" button closes open panel', async ({ page }) => {
    await page.getByTitle('Open guides').click()
    await expect(page.getByText('Guides', { exact: true })).toBeVisible()
    await page.getByTitle('Close guides').click()
    await expect(page.getByText('Guides', { exact: true })).not.toBeAttached()
  })

  test('all 8 task guides listed', async ({ page }) => {
    await page.getByTitle('Open guides').click()
    await expect(page.getByText('Generate from a hex color')).toBeVisible()
    await expect(page.getByText('Use AI Assist')).toBeVisible()
    await expect(page.getByText('Extract from an image')).toBeVisible()
    await expect(page.getByText('Pin a shade to a custom hex')).toBeVisible()
    await expect(page.getByText('Snap to hardware colors')).toBeVisible()
    await expect(page.getByText('Harmonize ramps')).toBeVisible()
    await expect(page.getByText('Export as .gpl')).toBeVisible()
    await expect(page.getByText('Check contrast (WCAG)')).toBeVisible()
  })

  test('task guide auto-advances when condition met', async ({ page }) => {
    // Use "hex-palette" guide. Step 2 detector: baseColors[0] !== '#ff00ff'.
    // App randomizes baseColors[0] on mount, so we reset it to #ff00ff first
    // to ensure the baseline is captured as false when step 2 is entered.
    await page.getByTitle('Open guides').click()
    await page.getByText('Generate from a hex color').click()

    // Step 1: "Switch to Single Color" — reset baseColors to #ff00ff so step 2
    // detector starts as false, then advance manually.
    await expect(page.getByText('Switch to Single Color')).toBeVisible()
    const hexInput = page.locator('input[title="Type a hex color (e.g. #ff6b35)"]')
    await hexInput.fill('#ff00ff')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2: "Enter a hex color" — baseline now false
    await expect(page.getByText('Enter a hex color')).toBeVisible()

    // Change to a different color → detector transitions false→true → auto-advance
    await hexInput.fill('#3b82f6')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()

    // Should auto-advance to step 3
    await expect(page.getByText('Ramps generated')).toBeVisible({ timeout: 4000 })
  })
})
