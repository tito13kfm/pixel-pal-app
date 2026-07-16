import { test, expect } from '@playwright/test'

// Regression coverage for the per-ramp / per-shade editing handlers
// extracted into src/hooks/useRampEditing.ts (#113 slice 3): duplicate,
// base-color edit, pin/unpin, hide/restore shade, lock toggle, remove.
// Driven through the real ramp cards; state lives in the Zustand store the
// hook and App.tsx share.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
})

test('ramp editing round-trip: duplicate, edit base, pin, hide, lock, remove', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const rampCount = () => page.getByTitle(/Duplicate this ramp at the end of the palette/).count()
  await expect.poll(rampCount).toBe(1)

  // Duplicate: 1 -> 2 ramps.
  await page.getByTitle(/Duplicate this ramp at the end of the palette/).first().click()
  await expect.poll(rampCount).toBe(2)

  // Base-color editor: open on ramp 1, type a known hex, confirm it lands in
  // the base dock's jump button (which titles itself with the base hex).
  await page.getByTitle('Edit base color').first().click()
  // .last(): the Single Color tab has a hex input with the same tooltip; the
  // editor's input is rendered after it in the tree.
  const hexInput = page.getByTitle('Type a hex color (e.g. #ff6b35)').last()
  await hexInput.fill('#ff6b35')
  await expect(page.getByLabel('Go to ramp 1 (#FF6B35)')).toBeAttached()
  await page.getByTitle('Close the base color editor').click()

  // Pin: pinning the first punchy shade opens the pin editor and flips the
  // button to Unpin; unpinning closes it back.
  await page.getByTitle('Pin this punchy shade').first().click()
  await expect(page.getByTitle('Remove this pin and close the editor')).toBeAttached()
  await expect(page.getByTitle('Unpin this punchy shade').first()).toBeAttached()
  await page.getByTitle('Unpin this punchy shade').first().click()
  await expect(page.getByTitle('Remove this pin and close the editor')).not.toBeAttached()

  // Hide: right-click a swatch (its tooltip advertises the gesture) hides
  // that shade across styles and surfaces the per-ramp restore chip;
  // clicking the chip restores.
  await page.getByTitle(/Right-click to hide this shade/).first().click({ button: 'right' })
  await expect(page.getByTitle(/Restore 1 hidden shade$/)).toBeAttached()
  await page.getByTitle(/Restore 1 hidden shade$/).click()
  await expect(page.getByTitle(/Restore 1 hidden shade$/)).not.toBeAttached()

  // Lock: the padlock flips to the unlock affordance and back.
  await page.getByTitle(/^Lock this ramp\./).first().click()
  await expect(page.getByTitle(/^Unlock this ramp\./)).toBeAttached()
  await page.getByTitle(/^Unlock this ramp\./).click()
  await expect(page.getByTitle(/^Unlock this ramp\./)).not.toBeAttached()

  // Remove: 2 -> 1 ramps.
  await page.getByTitle('Remove this ramp').last().click()
  await expect.poll(rampCount).toBe(1)
})
