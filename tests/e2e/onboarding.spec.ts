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

    // First-run auto-starts the onboarding tour ~600ms after load: the popover
    // appears showing the first step title.
    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible({ timeout: 2000 })
  })

  test('completes tour and sets localStorage flag', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Click Next through all 4 passive steps; final button is Done.
    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Input modes')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Palette ramps')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()

    // Popover should close and localStorage flag set. Assert on the popover
    // itself, not step-1 text — "Welcome" is already gone by step 4.
    await expect(page.locator('.tour-popover')).not.toBeAttached()
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

  test('exit X closes tour and sets flag', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // The popover exit X (title="Exit tour") replaces the old Skip button.
    // Onboarding marks seen on any exit.
    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible({ timeout: 2000 })
    await page.getByTitle('Exit tour').click()

    await expect(page.locator('.tour-popover')).not.toBeAttached()
    const seen = await page.evaluate(() => localStorage.getItem('pixel-pal-tour-seen'))
    expect(seen).toBe('1')
  })
})

test.describe('"?" button and guide select', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Suppress auto-open so tests control when the launcher modal appears
    await page.evaluate(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
    await page.reload()
    await page.waitForLoadState('networkidle')
  })

  test('"?" button opens launcher modal', async ({ page }) => {
    await page.getByTitle('Open guides').click()
    // Centered launcher modal: header "Guides", quick-tour button, section label.
    await expect(page.getByText('Guides', { exact: true })).toBeVisible()
    await expect(page.getByText('Quick tour')).toBeVisible()
    await expect(page.getByText('Show me how to...')).toBeVisible()
  })

  test('close X closes the launcher modal', async ({ page }) => {
    await page.getByTitle('Open guides').click()
    await expect(page.getByText('Guides', { exact: true })).toBeVisible()
    await page.getByTitle('Close guides').click()
    await expect(page.getByText('Guides', { exact: true })).not.toBeAttached()
  })

  test('all 7 task guides listed', async ({ page }) => {
    await page.getByTitle('Open guides').click()
    await expect(page.getByText('Generate from a hex color')).toBeVisible()
    await expect(page.getByText('Extract from an image')).toBeVisible()
    await expect(page.getByText('Pin a shade to a custom hex')).toBeVisible()
    await expect(page.getByText('Snap to hardware colors')).toBeVisible()
    await expect(page.getByText('Harmonize ramps')).toBeVisible()
    await expect(page.getByText('Export your palette')).toBeVisible()
    await expect(page.getByText('Check contrast (WCAG)')).toBeVisible()
  })

})
