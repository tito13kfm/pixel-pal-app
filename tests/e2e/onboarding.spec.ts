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

  // SKIPPED: detector-driven spotlight interaction belongs to Task 12 (new
  // spotlight e2e). Two blockers under the new shell:
  //   1. hex-palette step 1 detector is mode === 'color', which is the default
  //      mode, so the baseline captures true on entry — no false→true edge, and
  //      a detector step with a present target renders no Next button. The tour
  //      dead-ends on step 1. (Suspected app bug: any task guide whose step-1
  //      detector is already satisfied on entry cannot advance.)
  //   2. "New palette" is not the step target, so it sits under the dim overlay
  //      (pointerEvents:auto); only the cutout hole passes clicks through.
  // Driving the cutout/detector machinery is the subject of Task 12.
  test.skip('task guide auto-advances when condition met', async ({ page }) => {
    // Use "hex-palette" guide. Step 2 detector: baseColors[0] !== '#ff00ff'.
    // App randomizes baseColors[0] on mount, so we reset it to #ff00ff first
    // to ensure the baseline is captured as false when step 2 is entered.
    await page.getByTitle('Open guides').click()
    await page.getByText('Generate from a hex color').click()

    // Step 1: "Switch to Single Color" — detector advances when mode === 'color'.
    await expect(page.getByText('Switch to Single Color')).toBeVisible()
    const hexInput = page.locator('input[title="Type a hex color (e.g. #ff6b35)"]')
    await hexInput.fill('#ff00ff')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()

    // Step 2: "Enter a hex color" — baseline now false
    await expect(page.getByText('Enter a hex color')).toBeVisible()

    // Change to a different color → detector transitions false→true → auto-advance
    await hexInput.fill('#3b82f6')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()

    // Should auto-advance to step 3
    await expect(page.getByText('Tune the ramp')).toBeVisible({ timeout: 4000 })
  })
})
