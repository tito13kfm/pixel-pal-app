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
    await expect(page.getByRole('combobox', { name: 'Export format' })).toBeAttached()
    await expect(page.getByRole('button', { name: 'WCAG Check', exact: true })).toBeAttached()
    await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeAttached()
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

  test('new guide labels are listed in the launcher', async ({ page }) => {
    await openGuides(page)
    await expect(page.getByText('Hide a shade', { exact: true })).toBeVisible()
    await expect(page.getByText('Save & load palettes', { exact: true })).toBeVisible()
    await expect(page.getByText('Compare side-by-side', { exact: true })).toBeVisible()
    await expect(page.getByText('Simulate colorblindness', { exact: true })).toBeVisible()
  })

  test('Saved Palettes section controls exist', async ({ page }) => {
    // save-palette steps 1-2
    await page.getByRole('button', { name: /Saved Palettes/ }).click()
    await expect(page.getByPlaceholder('Name this palette...')).toBeAttached()
    await expect(page.getByRole('button', { name: 'Save Current', exact: true })).toBeAttached()
  })

  test('Visualize & Compare slot selectors exist', async ({ page }) => {
    // side-by-side steps 1-2
    await page.getByRole('button', { name: /Visualize & Compare/ }).click()
    await expect(page.getByTitle('Pick a second palette to compare side-by-side (empty = single-column view)')).toBeAttached()
  })

  test('CVD simulation buttons exist in the header', async ({ page }) => {
    // cvd-sim step 1 names Pro / Deu / Tri
    await expect(page.getByTitle('Protanopia: simulates red-blindness (~1% of men)')).toBeVisible()
    await expect(page.getByTitle('Deuteranopia: simulates green-blindness (~6% of men, most common CVD)')).toBeVisible()
    await expect(page.getByTitle('Tritanopia: simulates blue-blindness (very rare)')).toBeVisible()
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

  // hex-palette is a fully Next-driven walk now. Step 1 ("Switch to Single
  // Color") is a detector step (mode==='color') but 'color' is the DEFAULT mode,
  // so it is pre-satisfied on entry → the engine surfaces a manual Next (no dead-
  // end). Steps 2–4 are advance:'next'. So: Next, Next, Next, Done. Mode must NOT
  // be switched away from 'color' before starting, or step 1 loses its pre-
  // satisfaction.
  test('hex-palette: Next-driven walk reaches Done', async ({ page }) => {
    await openGuides(page)
    await page.getByText('Generate from a hex color').click()

    // Step 1: pre-satisfied detector → manual Next.
    await expect(page.getByText('Switch to Single Color')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2: "Enter a hex color" (advance:'next').
    await expect(page.getByText('Enter a hex color')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 3: "Generate the ramps" (advance:'next').
    await expect(page.getByText('Generate the ramps')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 4 (last): "Tune the ramp" → final button is Done.
    await expect(page.getByText('Tune the ramp')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Done', exact: true }).click()

    await expect(page.locator('.tour-popover')).not.toBeAttached()
  })

  test('export-gpl: Export & Tools header advances step 1', async ({ page }) => {
    // Ensure Export & Tools is CLOSED so detector starts false when guide opens
    await ensureExportToolsClosed(page)

    await openGuides(page)
    await page.getByText('Export your palette').click()
    await expect(page.getByText('Open the Export panel')).toBeVisible()

    // Documented action: click Export & Tools header
    await page.getByRole('button', { name: /Export & Tools/ }).click()

    await expect(page.getByText('Choose a contrast style')).toBeVisible({ timeout: 2000 })
  })

  test('wcag-compare: Export panel then WCAG Check advances both steps', async ({ page }) => {
    // wcag-compare gained a step: step 1 "Open the Export panel" (detector
    // exportOpen), step 2 "Enable WCAG Check" (detector compareMode).
    // Ensure Export & Tools CLOSED so step 1 detector starts false on entry.
    await ensureExportToolsClosed(page)

    await openGuides(page)
    await page.getByText('Check contrast (WCAG)').click()
    await expect(page.getByText('Open the Export panel')).toBeVisible()

    // Step 1 action: click Export & Tools header (export-header is the target) →
    // exportOpen edge fires.
    await page.getByRole('button', { name: /Export & Tools/ }).click()
    await expect(page.getByText('Enable WCAG Check')).toBeVisible({ timeout: 2000 })

    // Step 2 action: click WCAG Check (wcag-check-btn is the target) →
    // compareMode edge fires.
    await page.getByRole('button', { name: 'WCAG Check', exact: true }).click()
    await expect(page.getByText('Pick two swatches')).toBeVisible({ timeout: 2000 })
  })

  test('hide-shade: right-clicking a swatch advances step 1', async ({ page }) => {
    await openGuides(page)
    await page.getByText('Hide a shade', { exact: true }).click()
    await expect(page.getByText('Right-click a swatch')).toBeVisible()

    // Documented action: right-click any shade swatch → hiddenCount edge fires.
    await page.locator('button[title*="Right-click to hide this shade"]').first().click({ button: 'right' })
    await expect(page.getByText('Hidden everywhere it matters')).toBeVisible({ timeout: 2000 })

    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Restore hidden shades')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.locator('.tour-popover')).not.toBeAttached()
  })

  test('save-palette: opening the section then saving advances both detector steps', async ({ page }) => {
    // savedOpen defaults false in a fresh context, so step 1's detector starts false.
    await openGuides(page)
    await page.getByText('Save & load palettes', { exact: true }).click()
    await expect(page.getByText('Open Saved Palettes')).toBeVisible()

    // Step 1 action: click the Saved Palettes header → savedOpen edge fires.
    await page.getByRole('button', { name: /Saved Palettes/ }).click()
    await expect(page.getByText('Name and save')).toBeVisible({ timeout: 2000 })

    // Step 2 action: name the palette and save → savedCount edge fires.
    await page.getByPlaceholder('Name this palette...').fill('tour test palette')
    await page.getByRole('button', { name: 'Save Current', exact: true }).click()
    await expect(page.getByText('Load it back')).toBeVisible({ timeout: 2000 })
  })

  test('side-by-side: Visualize & Compare header advances step 1', async ({ page }) => {
    // sbsOpen defaults false in a fresh context, so step 1's detector starts false.
    await openGuides(page)
    await page.getByText('Compare side-by-side', { exact: true }).click()
    await expect(page.getByText('Open Visualize & Compare')).toBeVisible()

    // Step 1 action: click the section header → sbsOpen edge fires.
    await page.getByRole('button', { name: /Visualize & Compare/ }).click()
    await expect(page.getByText('Fill Slot B')).toBeVisible({ timeout: 2000 })

    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Read the views')).toBeVisible({ timeout: 2000 })
  })

  test('cvd-sim: picking a simulation advances step 1', async ({ page }) => {
    // cvdMode defaults to 'none' in a fresh context, so step 1's detector starts false.
    await openGuides(page)
    await page.getByText('Simulate colorblindness', { exact: true }).click()
    await expect(page.getByText('Pick a simulation')).toBeVisible()

    // Documented action: click Deu → cvdMode edge fires.
    await page.getByTitle('Deuteranopia: simulates green-blindness (~6% of men, most common CVD)').click()
    await expect(page.getByText('Check and iterate')).toBeVisible({ timeout: 2000 })
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

    // Step 2 action: click Hardware Lock. It is step 2's spotlight target
    // (hardware-lock-btn), so the cutout passes the click through — no JS
    // dispatch needed. hwPickerOpen edge fires → auto-advance.
    await page.getByRole('button', { name: 'Hardware Lock', exact: true }).click()
    await expect(page.getByText('Pick a platform')).toBeVisible({ timeout: 2000 })
  })
})
