import { test, expect } from '@playwright/test'

// Regression coverage for the saved-palette persistence pipeline extracted
// into src/hooks/useSavedPalettesActions.ts (#113 slice 2): save -> list ->
// load -> rename -> two-click delete, all through the real UI against the
// localStorage-backed window.storage shim. This flow previously had zero
// e2e coverage - the same gap that let the image-remap effect regression
// ship silently before slice 1.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
})

test('save / load / rename / delete round-trip through the Saved Palettes panel', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  await page.getByTitle('Expand the Saved Palettes section').click()

  // Save the current palette under a known name.
  const nameInput = page.getByPlaceholder('Name this palette...')
  await nameInput.fill('E2E Roundtrip')
  await page.getByTitle("Save the current palette to your browser's local storage").click()

  // The saved row appears in the list (name + Load/Rename/Delete controls).
  const loadBtn = page.getByTitle('Load "E2E Roundtrip" and replace the current palette')
  await expect(loadBtn).toBeAttached()

  // Mutate the working palette so a subsequent load has something to restore:
  // duplicating a ramp changes the ramp count.
  const swatchRows = () => page.getByTitle(/Duplicate this ramp at the end of the palette/).count()
  const before = await swatchRows()
  await page.getByTitle(/Duplicate this ramp at the end of the palette/).first().click()
  await expect.poll(swatchRows).toBe(before + 1)

  // Load restores the saved palette (ramp count drops back). The "Loaded ..."
  // toast is deliberately NOT asserted: it self-clears after 2s and races the
  // poll above.
  await loadBtn.click()
  await expect.poll(swatchRows).toBe(before)

  // Rename in place: same slug, new display name.
  await page.getByTitle('Rename "E2E Roundtrip"').click()
  const renameInput = page.getByTitle('Type a new name. Enter to save, Escape to cancel.')
  await renameInput.fill('E2E Renamed')
  await page.getByTitle('Save the new name (Enter)').click()
  await expect(page.getByTitle('Rename "E2E Renamed"')).toBeAttached()
  await expect(page.getByTitle('Rename "E2E Roundtrip"')).not.toBeAttached()

  // Two-click delete: first click arms, second commits, row disappears.
  await page.getByTitle('Delete "E2E Renamed" from saved palettes').click()
  await page.getByTitle('Click again to confirm deletion').click()
  await expect(page.getByTitle('Rename "E2E Renamed"')).not.toBeAttached()
  await expect(page.getByTitle('Click again to confirm deletion')).not.toBeAttached()
})
