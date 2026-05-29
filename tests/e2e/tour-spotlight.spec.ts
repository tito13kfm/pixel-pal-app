import { test, expect } from '@playwright/test'

// The spotlight overlay engine. These tests lock behaviors that static review
// missed and e2e caught: the document.body portal, the dim-inert / hole-click-
// through hit test, snapshot/restore on exit, setup auto-open + auto-advance,
// and the pre-satisfied-detector "manual Next, Back doesn't bounce" fix.

async function suppressAutoOpen(page) {
  // First-run auto-starts onboarding ~600ms after load. Suppress it so each
  // test drives the launcher explicitly.
  await page.evaluate(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
}

async function openLauncher(page) {
  await page.getByTitle('Open guides').click()
  await expect(page.getByText('Guides', { exact: true })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await suppressAutoOpen(page)
  await page.reload()
  await page.waitForLoadState('networkidle')
})

test('overlay portals to document.body, not inside a transformed ancestor', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Quick tour').click()
  await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()
  // The dim SVG must mount as a direct child of <body> so the CRT-perspective /
  // backdrop-blur wrappers don't transform its coordinate space (a transformed
  // ancestor would misplace the cutout).
  const parentIsBody = await page.evaluate(() => {
    const svg = document.querySelector('.tour-overlay-svg')
    return svg?.parentElement === document.body
  })
  expect(parentIsBody).toBe(true)
})

test('dim-area click is inert; hole click reaches the target element', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Quick tour').click()
  await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()

  // Click in the top-left corner: the dim path (pointerEvents:auto) covers it,
  // outside both the mode-tabs cutout and the popover. The click is swallowed,
  // so the tour does not advance and step 1 stays visible.
  await page.mouse.click(5, 5)
  await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()

  // Now prove the cutout hole passes a real click through to the spotlighted
  // element. Use the hardware-lock guide: step 2 spotlights Hardware Lock; a
  // plain .click() through the hole satisfies the hwPickerOpen detector and
  // auto-advances. No JS dispatch.
  await page.keyboard.press('Escape')
  await openLauncher(page)
  await page.getByText('Snap to hardware colors').click()
  await page.getByRole('button', { name: /Export & Tools/ }).click()
  await expect(page.getByText('Open the hardware picker')).toBeVisible({ timeout: 2000 })
  await page.getByRole('button', { name: 'Hardware Lock', exact: true }).click()
  await expect(page.getByText('Shades snapped')).toBeVisible({ timeout: 2000 })
})

test('Esc exits the tour and restores Export panel state', async ({ page }) => {
  // Export starts closed (PANEL_DEFAULTS.exportOpen === false), so the Hardware
  // Lock button is not rendered at baseline.
  await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toHaveCount(0)

  await openLauncher(page)
  await page.getByText('Snap to hardware colors').click()
  await page.getByRole('button', { name: /Export & Tools/ }).click()
  await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toBeVisible({ timeout: 2000 })

  // Esc exits and restoreTourState() must put Export back to its pre-tour
  // (closed) state, which un-renders the Hardware Lock button.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toHaveCount(0)
})

test('hardware-lock guide auto-advances through setup step', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Snap to hardware colors').click()
  // Step 1 detector: exportOpen. Opening Export advances to step 2.
  await page.getByRole('button', { name: /Export & Tools/ }).click()
  // Step 2 has setup:'export' (panel auto-kept-open) and spotlights Hardware Lock.
  await expect(page.getByText('Open the hardware picker')).toBeVisible({ timeout: 2000 })
  await page.getByRole('button', { name: 'Hardware Lock', exact: true }).click()
  // hwPickerOpen detector flips → auto-advance to the final "Shades snapped" step.
  await expect(page.getByText('Shades snapped')).toBeVisible({ timeout: 2000 })
})

test('pre-satisfied detector step shows manual Next and Back does not bounce', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Generate from a hex color').click()

  // Step 1 "Switch to Single Color": detector is mode === 'color', and 'color'
  // is the DEFAULT mode, so the detector is satisfied at entry. The engine must
  // surface a manual Next (baselineSatisfied) rather than dead-end with no
  // advance path.
  await expect(page.getByText('Switch to Single Color')).toBeVisible()
  const next = page.getByRole('button', { name: 'Next →' })
  await expect(next).toBeVisible()
  await next.click()

  // Step 2.
  await expect(page.getByText('Enter a hex color')).toBeVisible()

  // Back to step 1 must NOT immediately bounce forward. The just-fixed bug:
  // a stale `false` baseline on Back re-entry triggered the false->true auto-
  // advance again. The synchronous baseline reset to null prevents that.
  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.getByText('Switch to Single Color')).toBeVisible()
  await page.waitForTimeout(800) // longer than the 400ms auto-advance delay
  await expect(page.getByText('Switch to Single Color')).toBeVisible() // still here, no bounce
})

// ─── Start-step coverage for thin guides ─────────────────────────────────────
// These guides were only token/copy-checked before; their popovers were never
// launched. Each test starts the guide, asserts the first step's title + that
// the spotlight popover renders, and drives a forward path (detector edge or
// Next) so a target/detector/copy drift breaks the test.

test('ai-assist: starts, then AI Assist tab click auto-advances to step 2', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Use AI Assist').click()

  // Step 1 "Switch to AI Assist": detector mode==='ai'. Default mode is 'color'
  // so the detector starts false (drivable, not pre-satisfied).
  await expect(page.getByText('Switch to AI Assist')).toBeVisible()
  await expect(page.locator('.tour-popover')).toBeVisible()

  // mode-ai is step 1's spotlight target; clicking the AI Assist tab through the
  // cutout fires the mode==='ai' edge → auto-advance.
  await page.getByRole('button', { name: 'AI Assist', exact: true }).click()
  await expect(page.getByText('Add your API key')).toBeVisible({ timeout: 2000 })
})

test('image-import: starts, then From Image tab click auto-advances to step 2', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Extract from an image').click()

  // Step 1 "Switch to From Image": detector mode==='image' (starts false).
  await expect(page.getByText('Switch to From Image')).toBeVisible()
  await expect(page.locator('.tour-popover')).toBeVisible()

  // mode-image is the spotlight target; clicking From Image fires the edge.
  await page.getByRole('button', { name: 'From Image', exact: true }).click()
  await expect(page.getByText('Load an image')).toBeVisible({ timeout: 2000 })
})

test('harmonize: Next past mode step, then adding a 2nd base auto-advances', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Harmonize ramps').click()

  // Step 1 "Switch to Single Color": detector mode === 'color', which is the
  // DEFAULT mode, so it is pre-satisfied on entry → engine surfaces a manual
  // Next. Click through to reach the original first step.
  await expect(page.getByRole('heading', { name: 'Switch to Single Color' })).toBeVisible()
  await page.getByRole('button', { name: 'Next →' }).click()

  // Step 2 "Generate two or more ramps": detector baseColors.length >= 2. Default
  // is a single base, so it starts false (not pre-satisfied → no Next; the
  // forward path is the detector). Spotlight target is add-base-btn.
  await expect(page.getByText('Generate two or more ramps')).toBeVisible()
  await expect(page.locator('.tour-popover')).toBeVisible()

  // Default colorInput is '#ff00ff' which equals baseColors[0], so Add base would
  // dedup. Fill a distinct hex first (.fill bypasses the dim's receives-events
  // check), then click the spotlighted Add base through the cutout → length 2 →
  // detector edge fires.
  await page.locator('input[title="Type a hex color (e.g. #ff6b35)"]').fill('#3b82f6')
  await page.getByRole('button', { name: 'Add base', exact: true }).click()
  // "Click Harmonize" also appears in step 2's body + hint, so match the popover
  // heading specifically.
  await expect(page.getByRole('heading', { name: 'Click Harmonize' })).toBeVisible({ timeout: 2000 })
})

test('pin-shade: starts pre-satisfied, Next walks through to step 3', async ({ page }) => {
  // Step 1 "Generate a palette first" is a detector step
  // (baseColors[0] !== '#ff00ff' || imageDataUrl !== null), NOT advance:'next'.
  // From the pristine default it is false and undrivable through the cutout
  // (ramp-area is spotlighted; New palette sits outside it and the dim swallows
  // the click). So generate a palette BEFORE launching the guide — then step 1's
  // detector is pre-satisfied on entry and the engine surfaces a manual Next.
  await page.locator('input[title="Type a hex color (e.g. #ff6b35)"]').fill('#3b82f6')
  await page.getByRole('button', { name: 'New palette', exact: true }).click()

  await openLauncher(page)
  await page.getByText('Pin a shade to a custom hex').click()

  // Step 1: pre-satisfied detector → manual Next present.
  await expect(page.getByText('Generate a palette first')).toBeVisible()
  await expect(page.locator('.tour-popover')).toBeVisible()
  await page.getByRole('button', { name: 'Next →' }).click()

  // Step 2 "Reveal a shade's pin" (advance:'next').
  await expect(page.getByText("Reveal a shade's pin")).toBeVisible({ timeout: 2000 })
  await page.getByRole('button', { name: 'Next →' }).click()

  // Step 3 "Set the target hex" (advance:'next', no target → centered card).
  await expect(page.getByText('Set the target hex')).toBeVisible({ timeout: 2000 })
})
