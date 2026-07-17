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
    // The whole-palette style selector was retired in #69: each ramp exports
    // at its own active style, so there is no Punchy/Balanced/Muted trio here.
  })

  test('Import .gpl control exists', async ({ page }) => {
    // import-gpl step 2
    await ensureExportToolsOpen(page)
    await expect(page.getByRole('button', { name: 'Import .gpl', exact: true })).toBeAttached()
  })

  test('ramp lock and edit controls exist', async ({ page }) => {
    // lock-ramp step 2 + shape-ramp step 2
    await expect(page.getByTitle('Lock this ramp. The Generate/Shuffle buttons will skip it, and Harmonize will use it as a fixed reference. Pins and hidden shades are unaffected (they were per-ramp anyway).')).toBeAttached()
    await expect(page.getByTitle('Edit base color')).toBeAttached()
  })

  test('ramp editor Advanced disclosure exists', async ({ page }) => {
    // shape-ramp step 3
    await page.getByTitle('Edit base color').click()
    await expect(page.getByText('▸ Advanced', { exact: true })).toBeAttached()
  })

  test('Surprise Me generator row exists', async ({ page }) => {
    // surprise-me steps 2-3
    await expect(page.getByRole('button', { name: 'Surprise Me', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Around This', exact: true })).toBeVisible()
    await expect(page.getByLabel('Mood preset')).toBeVisible()
  })

  test('Image remap drop zone exists', async ({ page }) => {
    // remap-image step 3
    await page.getByRole('button', { name: /Visualize & Compare/ }).click()
    await expect(page.getByText('Drop an image here, or browse for a file, to remap against the palette.')).toBeAttached()
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
    await expect(page.getByText('Lock a ramp', { exact: true })).toBeVisible()
    await expect(page.getByText('Shape a ramp (Advanced)', { exact: true })).toBeVisible()
    await expect(page.getByText('One-click palette (Surprise Me)', { exact: true })).toBeVisible()
    await expect(page.getByText('Remap an image to your palette', { exact: true })).toBeVisible()
    await expect(page.getByText('Import a .gpl palette', { exact: true })).toBeVisible()
  })

  test('launcher groups guides under category headings', async ({ page }) => {
    await openGuides(page)
    await expect(page.getByText('Generate', { exact: true })).toBeVisible()
    await expect(page.getByText('Edit & Refine', { exact: true })).toBeVisible()
    await expect(page.getByText('Check & Compare', { exact: true })).toBeVisible()
    await expect(page.getByText('Save & Export', { exact: true })).toBeVisible()
    // 'Generate from a hex color' should render under the 'Generate' heading,
    // not under an unrelated one (sanity check the grouping actually groups).
    const generateHeading = page.getByText('Generate', { exact: true })
    const generateSection = generateHeading.locator('xpath=..')
    await expect(generateSection.getByText('Generate from a hex color', { exact: true })).toBeVisible()
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

  test('lock-ramp: locking a ramp advances step 2', async ({ page }) => {
    // Step 1's detector (baseColors[0] !== '#ff00ff' || imageDataUrl !== null) is
    // undrivable through the cutout from the pristine default (ramp-area is
    // spotlighted; New palette sits outside it). Generate first so step 1 is
    // pre-satisfied on entry, same pattern as pin-shade in tour-spotlight.spec.ts.
    await page.locator('input[title="Type a hex color (e.g. #ff6b35)"]').fill('#3b82f6')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()

    await openGuides(page)
    await page.getByText('Lock a ramp', { exact: true }).click()
    await expect(page.getByText('Generate a palette first')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByRole('heading', { name: 'Click the lock icon' })).toBeVisible({ timeout: 2000 })
    // Documented action: click the ramp's lock icon → lockedCount edge fires.
    await page.getByTitle(/^Lock this ramp\./).first().click()
    await expect(page.getByText('What locking protects')).toBeVisible({ timeout: 2000 })
  })

  test('shape-ramp: opening the editor then Advanced advances both steps', async ({ page }) => {
    await page.locator('input[title="Type a hex color (e.g. #ff6b35)"]').fill('#3b82f6')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()

    await openGuides(page)
    await page.getByText('Shape a ramp (Advanced)', { exact: true }).click()
    await expect(page.getByText('Generate a palette first')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByText('Open the ramp editor')).toBeVisible({ timeout: 2000 })
    // Step 2 action: click the sliders icon → editorOpen edge fires.
    await page.getByTitle('Edit base color').click()
    await expect(page.getByText('Open Advanced')).toBeVisible({ timeout: 2000 })

    // Step 3 action: click ▸ Advanced → advancedOpenAny edge fires.
    await page.getByText('▸ Advanced', { exact: true }).click()
    await expect(page.getByText('What each control does')).toBeVisible({ timeout: 2000 })
  })

  test('surprise-me: Next then Surprise Me advances through the walk', async ({ page }) => {
    // Default mode is 'color', so step 1's detector (mode === 'color') is
    // pre-satisfied on entry, same pre-satisfied pattern as hex-palette step 1.
    await openGuides(page)
    await page.getByText('One-click palette (Surprise Me)', { exact: true }).click()
    await expect(page.getByText('Switch to Single Color')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByText('Pick a mood (optional)')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByRole('heading', { name: 'Click Surprise Me' })).toBeVisible({ timeout: 2000 })
    // Documented action: click Surprise Me → baseColors.length===5 edge fires.
    await page.getByRole('button', { name: 'Surprise Me', exact: true }).click()
    await expect(page.getByText('Keep rolling, or anchor a color')).toBeVisible({ timeout: 2000 })
  })

  test('remap-image: opening viz then uploading an image advances both steps', async ({ page }) => {
    await page.locator('input[title="Type a hex color (e.g. #ff6b35)"]').fill('#3b82f6')
    await page.getByRole('button', { name: 'New palette', exact: true }).click()

    await openGuides(page)
    await page.getByText('Remap an image to your palette', { exact: true }).click()
    await expect(page.getByText('Generate a palette first')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    await expect(page.getByText('Open Visualize & Compare')).toBeVisible({ timeout: 2000 })
    // Step 2 action: click the section header → sbsOpen edge fires.
    await page.getByRole('button', { name: /Visualize & Compare/ }).click()
    // Wait for the tour's OWN heading, not the always-present static
    // instructional paragraph ("Upload an image. Every pixel snaps...") which
    // matches a plain getByText('Upload an image') the instant sbsOpen flips,
    // well before the guide's 400ms step transition actually completes.
    await expect(page.getByRole('heading', { name: 'Upload an image' })).toBeVisible({ timeout: 2000 })

    // Step 3 action: upload a file into the remap dropzone (only image-type
    // file input while in Single Color mode) → remapLoaded edge fires. A 1x1
    // PNG built inline avoids needing a checked-in fixture image.
    const onePixelPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    )
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    })
    await expect(page.getByText('Tune and download')).toBeVisible({ timeout: 2000 })
  })

  test('import-gpl: opening export then choosing a file advances both steps', async ({ page }) => {
    // Ensure Export & Tools CLOSED so step 1 detector starts false when guide opens
    await ensureExportToolsClosed(page)

    await openGuides(page)
    await page.getByText('Import a .gpl palette', { exact: true }).click()
    await expect(page.getByText('Open the Export panel')).toBeVisible()

    // Step 1 action: click Export & Tools header → exportOpen edge fires.
    await page.getByRole('button', { name: /Export & Tools/ }).click()
    await expect(page.getByText('Import a .gpl file')).toBeVisible({ timeout: 2000 })

    // Step 2 action: choose a .gpl file → gplImportOpen edge fires (the modal
    // opens whether the parse succeeds or fails).
    const gplContents = 'GIMP Palette\nName: Test\nColumns: 1\n#\n255 0 255\tpink\n'
    await page.locator('input[type="file"][accept=".gpl,text/plain"]').setInputFiles({
      name: 'test.gpl',
      mimeType: 'text/plain',
      buffer: Buffer.from(gplContents),
    })
    await expect(page.getByText('Choose how to apply it')).toBeVisible({ timeout: 2000 })
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
