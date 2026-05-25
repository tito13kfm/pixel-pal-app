/**
 * Tour reality checks.
 *
 * Two layers:
 *   1. DOM token matching — every UI label named in tour copy must exist in
 *      the rendered app. If a button gets renamed in App.tsx without updating
 *      tours.ts, this test breaks.
 *   2. Detector walk — documented actions actually fire auto-advance within 2s.
 *      Note: auto-advance fires on false→true edge. Each walk-guide test must
 *      ensure the detector starts false when the guide step is entered.
 */

import { test, expect } from '@playwright/test'

async function suppressAutoOpen(page) {
  await page.evaluate(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
}

async function openGuides(page) {
  await page.getByTitle('Open guides').click()
  await expect(page.getByText('Guides', { exact: true })).toBeVisible()
}

/** Returns true if the Export & Tools content is expanded (Hardware Lock in DOM). */
async function exportToolsExpanded(page) {
  return (await page.getByRole('button', { name: 'Hardware Lock', exact: true }).count()) > 0
}

async function ensureExportToolsOpen(page) {
  if (!await exportToolsExpanded(page)) {
    await page.getByRole('button', { name: /Export & Tools/ }).click()
    await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toBeAttached()
  }
}

async function ensureExportToolsClosed(page) {
  if (await exportToolsExpanded(page)) {
    await page.getByRole('button', { name: /Export & Tools/ }).click()
    await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).not.toBeAttached()
  }
}

// ─── Layer 1: DOM token matching ────────────────────────────────────────────

test.describe('tour copy references real UI elements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await suppressAutoOpen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')
  })

  test('Single Color tab controls exist', async ({ page }) => {
    // onboarding step 2 + hex-palette step 2
    await expect(page.getByRole('button', { name: 'Single Color', exact: true })).toBeVisible()
    await expect(page.locator('input[title="Type a hex color (e.g. #ff6b35)"]')).toBeVisible()
    await expect(page.locator('input[title="Pick a base color from the OS color picker"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New palette', exact: true })).toBeVisible()
  })

  test('AI Assist tab controls exist', async ({ page }) => {
    // onboarding step 2 + ai-assist steps 1,3
    await expect(page.getByRole('button', { name: 'AI Assist', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'AI Assist', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Execute', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Surprise Me', exact: true })).toBeVisible()
    await expect(page.locator('input[placeholder="describe anything..."]')).toBeVisible()
  })

  test('From Image tab exists (no image needed for tab check)', async ({ page }) => {
    // onboarding step 2 + image-import step 1
    await expect(page.getByRole('button', { name: 'From Image', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'From Image', exact: true }).click()
    // Drop zone present (image-import step 2)
    await expect(page.getByText('Drag & Drop Image')).toBeVisible()
    // Note: Eyedropper button only renders after an image is loaded (image-import step 3)
    // — verified manually, not automatable without test fixture image
  })

  test('Export & Tools panel controls exist', async ({ page }) => {
    // onboarding step 4 + export-gpl + hardware-lock + wcag-compare
    await ensureExportToolsOpen(page)
    // Check by attachment (controls may be below viewport)
    await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: 'Download .txt', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: 'WCAG Check', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: '.gpl (Piskel/Aseprite/GIMP)', exact: true })).toBeAttached()
    // Punchy/Balanced/Muted disambiguated by title (each appears twice: per-ramp + gpl export)
    await expect(page.getByTitle('Export the .gpl using high-contrast Punchy ramps')).toBeAttached()
    await expect(page.getByTitle('Export the .gpl using mid-contrast Balanced ramps')).toBeAttached()
    await expect(page.getByTitle('Export the .gpl using low-contrast Muted ramps')).toBeAttached()
  })

  test('Hardware Lock picker platform buttons exist', async ({ page }) => {
    // hardware-lock step 2 lists NES, Game Boy, CGA 16, EGA 64, C64
    await ensureExportToolsOpen(page)
    await page.getByRole('button', { name: 'Hardware Lock', exact: true }).click()
    await expect(page.getByRole('button', { name: 'NES', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: 'Game Boy', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: 'CGA 16', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: 'EGA 64', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: 'C64', exact: true })).toBeAttached()
  })

  test('Harmony Colors section and Harmonize button exist', async ({ page }) => {
    // harmonize step 2
    // Section heading is inside a toggle button; use text match
    await expect(page.getByText('Harmony Colors').first()).toBeAttached()
    // Harmonize button only renders when baseColors.length > 1 — add a second ramp
    const hexInput = page.locator('input[title="Type a hex color (e.g. #ff6b35)"]')
    await hexInput.fill('#3b82f6')
    await page.getByRole('button', { name: 'Add base', exact: true }).click()
    await expect(page.locator('button:has-text("Harmonize")').first()).toBeAttached()
  })
})

// ─── Layer 2: detector walk ──────────────────────────────────────────────────

test.describe('tour auto-advance detectors fire correctly', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await suppressAutoOpen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')
  })

  test('hex-palette: New palette advances step 2', async ({ page }) => {
    await openGuides(page)
    await page.getByText('Generate from a hex color').click()

    // Reset to default magenta so step 2 detector starts false
    await expect(page.getByText('Switch to Single Color')).toBeVisible()
    const hexInput = page.locator('input[title="Type a hex color (e.g. #ff6b35)"]')
    await hexInput.fill('#ff00ff')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByText('Enter a hex color')).toBeVisible()

    // Documented action: type hex + click New palette
    await hexInput.fill('#3b82f6')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()

    await expect(page.getByText('Ramps generated')).toBeVisible({ timeout: 2000 })
  })

  test('export-gpl: Export & Tools header advances step 1', async ({ page }) => {
    // Ensure Export & Tools is CLOSED so detector starts false when guide opens
    await ensureExportToolsClosed(page)

    await openGuides(page)
    await page.getByText('Export as .gpl').click()
    await expect(page.getByText('Open the Export panel')).toBeVisible()

    // Documented action: click Export & Tools header
    await page.getByRole('button', { name: /Export & Tools/ }).click()

    await expect(page.getByText('Choose a contrast style')).toBeVisible({ timeout: 2000 })
  })

  test('wcag-compare: WCAG Check button advances step 1', async ({ page }) => {
    // compareMode starts false — guide opens with baseline false
    await openGuides(page)
    await page.getByText('Check contrast (WCAG)').click()
    await expect(page.getByText('Enable WCAG Check')).toBeVisible()

    // Ensure WCAG Check button is accessible (Export & Tools must be open)
    await ensureExportToolsOpen(page)

    // Documented action: click WCAG Check
    await page.getByRole('button', { name: 'WCAG Check', exact: true }).click()

    await expect(page.getByText('Pick two swatches')).toBeVisible({ timeout: 2000 })
  })

  test('hardware-lock: Export then Hardware Lock advances both steps', async ({ page }) => {
    // Ensure Export & Tools CLOSED so step 1 detector starts false when guide opens
    await ensureExportToolsClosed(page)

    await openGuides(page)
    await page.getByText('Snap to hardware colors').click()
    await expect(page.getByText('Open the Export panel')).toBeVisible()

    // Step 1 action: click Export & Tools header → exportOpen true (edge fires)
    await page.getByRole('button', { name: /Export & Tools/ }).click()
    await expect(page.getByText('Open the hardware picker')).toBeVisible({ timeout: 2000 })

    // Small wait for React useEffect to capture step 2 baseline before clicking
    await page.waitForTimeout(300)
    // Use JS dispatch to bypass guide panel z-index overlay interception
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(
        b => b.textContent?.trim() === 'Hardware Lock'
      ) as HTMLButtonElement | undefined
      btn?.click()
    })
    await expect(page.getByText('Shades snapped')).toBeVisible({ timeout: 2000 })
  })
})
