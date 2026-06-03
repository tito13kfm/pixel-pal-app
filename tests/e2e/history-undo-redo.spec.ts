import { test, expect } from '@playwright/test'

// Behavior-sensitive coverage for the undo/redo/jump machinery extracted into
// src/hooks/useHistory.ts (App.tsx Tier B Wave 2). The history watcher,
// undo/redo keybinds, and the cursor live in the hook; usePaletteState owns the
// document core they snapshot. This is the one path the unit suite can't cover.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
})

test('undo/redo round-trips both the cursor AND the palette via keyboard', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // The History panel header renders "(<index+1> of <length>)". At load the
  // single "Initial state" entry gives "(1 of 1)".
  const counter = page.getByText(/\(\d+ of \d+\)/).first()
  await expect(counter).toHaveText(/\(1 of 1\)/)

  // Swatch count is a deterministic proxy for palette CONTENT (no color-
  // collision risk). We record TWO states (two ramp duplications), then undo
  // BETWEEN them: index 0 is the "Initial state" sentinel whose snapshot is null
  // (a deliberate no-op restore), so a meaningful content round-trip must move
  // between two non-null snapshots. Asserting content - not just the cursor -
  // guards against applyUndoSnapshot/applySnapshotFields silently restoring
  // nothing while the index still moves.
  const swatchCount = () => page.locator('[style*="background-color"]').count()
  const dup = () => page.getByTitle(/Duplicate this ramp at the end of the palette/).first().click()

  await dup()
  await expect(counter).toHaveText(/\(2 of 2\)/) // waits out the 300ms debounce
  const countA = await swatchCount() // state A: 2 ramps

  await dup()
  await expect(counter).toHaveText(/\(3 of 3\)/)
  const countB = await swatchCount() // state B: 3 ramps
  expect(countB).toBeGreaterThan(countA)

  // Undo: cursor back to entry A (redo entry preserved) AND palette restored to A.
  await page.keyboard.press('Control+z')
  await expect(counter).toHaveText(/\(2 of 3\)/)
  expect(await swatchCount()).toBe(countA)

  // Redo: cursor forward to entry B AND palette restored to B.
  await page.keyboard.press('Control+y')
  await expect(counter).toHaveText(/\(3 of 3\)/)
  expect(await swatchCount()).toBe(countB)
})
