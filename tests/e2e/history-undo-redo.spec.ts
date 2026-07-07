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

  // App.tsx has a mount-time effect (empty dep array, ~line 1654) that rolls a
  // random starting base color via setBaseColors/setShuffleSeed. That's a
  // real, intentional state change, and the history watcher (300ms debounce)
  // records it like any other: "Initial state" (index 0, null snapshot, a
  // deliberate no-op sentinel) is immediately followed by a second entry
  // capturing the actual randomized starting palette. So the settled baseline
  // after load is "(2 of 2)", not "(1 of 1)" - waiting for it here (rather
  // than assuming "(1 of 1)") is what makes this test's own subsequent
  // actions not race that automatic entry.
  const counter = page.getByText(/\(\d+ of \d+\)/).first()
  await expect(counter).toHaveText(/\(2 of 2\)/)

  // Swatch count is a deterministic proxy for palette CONTENT (no color-
  // collision risk). We record TWO more states (two ramp duplications), then
  // undo BETWEEN them, asserting content - not just the cursor - so a
  // meaningful round-trip must move between two distinct non-sentinel
  // snapshots, guarding against applyUndoSnapshot/applySnapshotFields
  // silently restoring nothing while the index still moves.
  const swatchCount = () => page.locator('[style*="background-color"]').count()
  const dup = () => page.getByTitle(/Duplicate this ramp at the end of the palette/).first().click()

  await dup()
  await expect(counter).toHaveText(/\(3 of 3\)/) // waits out the 300ms debounce
  const countA = await swatchCount() // state A: 2 ramps

  await dup()
  await expect(counter).toHaveText(/\(4 of 4\)/)
  const countB = await swatchCount() // state B: 3 ramps
  expect(countB).toBeGreaterThan(countA)

  // Undo: cursor back to entry A (redo entry preserved) AND palette restored to A.
  await page.keyboard.press('Control+z')
  await expect(counter).toHaveText(/\(3 of 4\)/)
  expect(await swatchCount()).toBe(countA)

  // Redo: cursor forward to entry B AND palette restored to B.
  await page.keyboard.press('Control+y')
  await expect(counter).toHaveText(/\(4 of 4\)/)
  expect(await swatchCount()).toBe(countB)
})
