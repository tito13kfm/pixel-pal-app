# Guided Tour Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the left-sidebar text tour with a spotlight tour, dim the window, highlight the relevant element with a neon cutout, and float an explanation popover with an arrow, for both the onboarding tour and all 8 interactive task guides.

**Architecture:** Three layers. `src/lib/tours.ts` stays pure serializable data (extended `TourStep`). New `src/lib/tour-runtime.ts` holds typed, side-effect-free geometry helpers wrapping `@floating-ui/dom`. `App.tsx` owns React state, the setup-action dispatch map, and snapshot/restore. New `src/components/TourOverlay.tsx` renders the running tour through a portal to `document.body`; `src/components/TourPanel.tsx` shrinks to a centered help-center launcher modal.

**Tech Stack:** React 19, TypeScript 6 (`tsc --noEmit`), Vite 8, Tailwind v3, `@floating-ui/dom` (new), Vitest, Playwright. Windows/PowerShell shell.

**Source spec:** `docs/superpowers/specs/2026-05-28-guided-tour-redesign-design.md`

---

## Conventions for this plan

- All shell commands are PowerShell (Windows). Run from repo root `C:\Claude\pixel-pal-app`.
- Branch already exists: `feat/guided-tour-redesign`. Commit to it.
- Typecheck gate after touching any `.ts`/`.tsx`: `npm run build` (runs `tsc --noEmit && vite build`). For a faster inner loop use `npx tsc --noEmit`.
- New files (`tour-runtime.ts`, `TourOverlay.tsx`) are **typed** — do NOT add `// @ts-nocheck`. Only `color.ts` and `App.tsx` carry the intentional nocheck.
- e2e against the web build is run separately (see CLAUDE.md). Desktop e2e: `npm run test:e2e`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/tours.ts` | Pure tour data; extended `TourStep` shape | Modify |
| `src/lib/tour-runtime.ts` | Typed geometry helpers (popover placement, cutout rect) wrapping floating-ui | Create |
| `src/components/TourOverlay.tsx` | Running-tour renderer: portal, SVG cutout, popover, per-step sequence, exit, snapshot/restore wiring | Create |
| `src/components/TourPanel.tsx` | Centered help-center launcher modal only | Rewrite (shrink) |
| `src/App.tsx` | Tour state, `SETUP_ACTIONS` map, snapshot state, mounts overlay + launcher, `data-tour-id` anchors | Modify |
| `src/index.css` | Spotlight ring/glow/pulse keyframes (reuse + tune `tour-pulse`) | Modify |
| `package.json` | Add `@floating-ui/dom` dependency | Modify |
| `tests/unit/tour-runtime.spec.ts` | Unit tests for pure rect/cutout math | Create |
| `tests/e2e/onboarding.spec.ts` | Update selectors: popover/modal instead of sidebar | Modify |
| `tests/e2e/tour-reality.spec.ts` | Keep token matching + detector walk; update click-through | Modify |
| `tests/e2e/tour-spotlight.spec.ts` | New: portal, cutout hit-test, setup→advance, restore | Create |

---

## Phase 0: Spike — de-risk expand-then-measure

**Purpose:** Prove the hardest mechanic (open a collapsed card, wait for layout, measure a nested element, spotlight it, click through the cutout) before the data model is locked. This is throwaway-quality code on a scratch path; it is NOT committed to the real component tree. If the timing fights us, revisit `setup`/`advance` in `tours.ts` before Phase 2.

### Task 0: Manual spike of setup→measure→spotlight on Hardware Lock

**Files:**
- Create (temporary): `src/components/__spike__/SpikeOverlay.tsx`

- [ ] **Step 1: Install floating-ui (needed for spike and rest of plan)**

Run:
```powershell
npm install @floating-ui/dom
```
Expected: `@floating-ui/dom` added to `dependencies` in `package.json`, no errors.

- [ ] **Step 2: Write a throwaway spike component**

Create `src/components/__spike__/SpikeOverlay.tsx`. It must: accept an `onOpenExport: () => void` prop, on mount call `onOpenExport()`, then poll via `requestAnimationFrame` until `[data-tour-id="hardware-lock-btn"]` exists with a non-zero rect, then `console.log` the rect and render a fixed-position cyan ring at that rect via a portal to `document.body`.

```tsx
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function SpikeOverlay({ onOpenExport }: { onOpenExport: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    onOpenExport()
    let raf = 0
    const tryMeasure = () => {
      const el = document.querySelector('[data-tour-id="hardware-lock-btn"]')
      const r = el?.getBoundingClientRect()
      if (r && r.width > 0 && r.height > 0) {
        console.log('SPIKE rect', r)
        setRect(r)
      } else {
        raf = requestAnimationFrame(tryMeasure)
      }
    }
    raf = requestAnimationFrame(tryMeasure)
    return () => cancelAnimationFrame(raf)
  }, [onOpenExport])

  if (!rect) return null
  return createPortal(
    <div style={{
      position: 'fixed',
      left: rect.left - 4, top: rect.top - 4,
      width: rect.width + 8, height: rect.height + 8,
      border: '3px solid #00ffff', borderRadius: 8,
      boxShadow: '0 0 22px #00ffff', pointerEvents: 'none', zIndex: 9999,
    }} />,
    document.body,
  )
}
```

- [ ] **Step 3: Temporarily mount the spike in App.tsx**

In `App.tsx`, near the existing `<TourPanel ... />` mount (around line 7777), temporarily add (you will remove this in Step 6):

```tsx
{/* SPIKE — remove after Phase 0 */}
<SpikeOverlay onOpenExport={() => { setExportOpen(true); setHwPickerOpen(false); }} />
```
Add the import at top: `import { SpikeOverlay } from './components/__spike__/SpikeOverlay'`.

Note: a `data-tour-id="hardware-lock-btn"` anchor does not exist yet. For the spike only, temporarily add `data-tour-id="hardware-lock-btn"` to the existing Hardware Lock `<button>` (find it: `npx tsc` is not needed; search App.tsx for the Hardware Lock button near line 7505-7560). This anchor becomes permanent in Phase 1.

- [ ] **Step 4: Run the app and verify the ring lands on the button**

Run:
```powershell
npm run dev
```
Open the served URL. Expected: the Export & Tools panel auto-expands on load, and within a frame or two a cyan ring appears exactly around the Hardware Lock button. The console logs a rect with non-zero width/height. Confirm the ring is correctly placed **despite** the CRT perspective layer and card backdrop-blur (this is the portal-to-body proof).

- [ ] **Step 5: Verify click-through plan**

Manually confirm the button under the ring is still clickable (the spike ring has `pointer-events: none`). Click Hardware Lock; the picker should open. This validates that a `pointer-events: none` overlay region passes clicks through. (The real overlay uses an SVG even-odd hole for the same effect; the spike only needs to confirm the underlying element stays interactive under a portaled fixed layer.)

- [ ] **Step 6: Tear down the spike**

Remove the temporary `<SpikeOverlay .../>` mount and its import from `App.tsx`. Delete `src/components/__spike__/SpikeOverlay.tsx` and the empty `__spike__` folder. Keep the temporary `data-tour-id="hardware-lock-btn"` on the button (it is wanted permanently; Phase 1 formalizes it). Keep `@floating-ui/dom` installed.

- [ ] **Step 7: Commit the dependency + spike findings**

```powershell
git add package.json package-lock.json
git commit -m "build: add @floating-ui/dom for tour spotlight (Phase 0 spike validated)"
```

**Phase 0 exit criteria:** ring lands accurately on a nested element inside a just-opened card; underlying element stays clickable; portal-to-body defeats the perspective/blur containing-block problem. If any failed, stop and reassess the `setup`/`advance` design before Phase 2.

---

## Phase 1: Guide copy reality audit + anchor enumeration

**Purpose:** Independent of the overlay engine. Make every existing guide reflect the current app and give every targeted element a stable `data-tour-id`. Uses `tour-reality.spec.ts` layer-1 token matching as the lever.

### Task 1: Run the existing tour-reality suite and record drift

**Files:**
- Read: `tests/e2e/tour-reality.spec.ts`, `src/lib/tours.ts`, `src/App.tsx`

- [ ] **Step 1: Run the token-matching layer against the current app**

Run:
```powershell
npm run test:e2e -- tour-reality.spec.ts
```
Expected: some assertions may pass, some may fail where copy drifted. Record every failure (which guide, which label).

- [ ] **Step 2: Manually walk each of the 9 guides in the running app**

With `npm run dev` open, for each guide in `ONBOARDING_TOUR` + `TASK_GUIDES`, read the step `body`/`hint` and confirm against the live UI: does the named button/section still exist with that exact label? Does the described behavior match the OKLCH engine, curve editors, style presets, section drag-reorder? Write a short drift list (guide id → step index → what's wrong).

- [ ] **Step 3: Commit the drift notes as a scratch doc (optional, helps the rewrite)**

Create `docs/superpowers/plans/tour-audit-notes-2026-05-29.md` with the drift list. This file is informational; it does not need to be perfect.

```powershell
git add docs/superpowers/plans/tour-audit-notes-2026-05-29.md
git commit -m "docs: tour copy drift audit notes"
```

### Task 2: Add `data-tour-id` anchors to every targeted element

**Files:**
- Modify: `src/App.tsx` (add `data-tour-id` attributes)

**Anchor list** (every element any guide step targets). Existing anchors: `mode-tabs` (App.tsx:5899), `ramp-area` (6132), `export-panel` (7495). Add the following, using the exact element found by searching App.tsx for the quoted label:

| `data-tour-id` | Element (search key in App.tsx) |
|---|---|
| `mode-single` | `Single Color` mode button (~5900) |
| `mode-ai` | `AI Assist` mode button (~5901) |
| `mode-image` | `From Image` mode button (~5902) |
| `hex-input` | hex `<input title="Type a hex color (e.g. #ff6b35)">` |
| `new-palette-btn` | `New palette` button (~6031) |
| `add-base-btn` | `Add base` button (~5912) |
| `ai-prompt-input` | `<input placeholder="describe anything...">` |
| `ai-execute-btn` | `Execute` button (~6015) |
| `ai-surprise-btn` | `Surprise Me` button (~6018) |
| `ai-settings-btn` | the AI Settings gear button (search `title="AI Settings"`) |
| `image-dropzone` | the `Drag & Drop Image` drop zone |
| `export-header` | the `Export & Tools` toggle `<button>` (~7496) |
| `hardware-lock-btn` | `Hardware Lock` button (formalize the Phase-0 temp anchor) |
| `wcag-check-btn` | `WCAG Check` button (~7512) |
| `gpl-export-btn` | `.gpl (Piskel/Aseprite/GIMP)` button |
| `harmony-header` | the `Harmony Colors` toggle button (~6584) |
| `harmonize-btn` | `Harmonize` button (~6675) |

- [ ] **Step 1: Add each `data-tour-id` attribute**

For each row, locate the element and add the attribute. Example (mode buttons already inside the `mode-tabs` div, add individual ids):

```tsx
<button onClick={() => setMode('color')} data-tour-id="mode-single" title="Build a palette from a single hex color" ...>Single Color</button>
```

Add anchors only; do not change classNames, handlers, or layout. For inputs, add the attribute directly on the `<input>`.

- [ ] **Step 2: Typecheck**

Run:
```powershell
npx tsc --noEmit
```
Expected: no errors (adding a DOM attribute is type-safe).

- [ ] **Step 3: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(tour): add data-tour-id anchors to all guide-targeted elements"
```

### Task 3: Rewrite guide copy to match reality

**Files:**
- Modify: `src/lib/tours.ts` (copy + add `target`/`setup`/`advance`/`placement` per step)

This task also pre-populates the new fields (defined formally in Phase 2 Task 4); adding them now as data is safe because the interface change is additive and optional. If you prefer strict ordering, do Phase 2 Task 4 (interface) first, then return here. Either order compiles.

- [ ] **Step 1: For each guide, set `target`, `setup`, `advance`, `placement`, and corrected copy**

Apply the drift fixes from Task 1 and wire spatial fields. Rules:
- `advance: 'next'` for passive onboarding steps; `advance: 'detector'` for steps where the user performs an action.
- `setup`: set only for *incidental* reveals (the panel is not what the step teaches). For `hardware-lock`, `export-gpl`, `wcag-compare` the FIRST step teaches the user to open Export themselves, so those keep a detector step and NO `setup`. Use `setup` for later steps in the same guide that need the panel already open (e.g. hardware-lock step 2 targeting `hardware-lock-btn` sets `setup: 'export'`).
- `target`: the `data-tour-id` from Task 2.
- `placement`: `'auto'` unless a specific side reads better.

Worked example (replace the existing `hardware-lock` guide):

```ts
{
  id: 'hardware-lock',
  label: 'Snap to hardware colors',
  steps: [
    {
      title: 'Open the Export panel',
      body: 'Hardware Lock lives in the Export & Tools panel. Open it to continue.',
      hint: '→ click Export & Tools',
      target: 'export-header',
      advance: 'detector',
      detector: (s) => s.exportOpen,
      placement: 'bottom',
    },
    {
      title: 'Open the hardware picker',
      body: 'Click Hardware Lock to reveal the console palettes: NES, Game Boy, CGA 16, EGA 64, C64.',
      hint: '→ click Hardware Lock',
      target: 'hardware-lock-btn',
      setup: 'export',          // panel must already be open to measure the nested button
      advance: 'detector',
      detector: (s) => s.hwPickerOpen,
      placement: 'right',
    },
    {
      title: 'Shades snapped',
      body: 'Every unlocked shade now uses the nearest legal color for that hardware.',
      advance: 'next',
    },
  ],
},
```

Apply the analogous treatment to all 9 guides (`onboarding`, `hex-palette`, `ai-assist`, `image-import`, `pin-shade`, `hardware-lock`, `harmonize`, `export-gpl`, `wcag-compare`). Onboarding steps get `target` + `advance: 'next'` and no detector.

- [ ] **Step 2: Typecheck (after Phase 2 Task 4 interface exists) or temporarily loosen**

If doing this before Phase 2 Task 4, the new fields will be unknown properties. To keep ordering flexible, do Phase 2 Task 4 FIRST. Then:
```powershell
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Run token matching to confirm copy references real labels**

```powershell
npm run test:e2e -- tour-reality.spec.ts
```
Expected: layer-1 token tests pass (copy now matches DOM). Update the test's expected labels in Task 11 if you intentionally reworded a label the test asserts.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/tours.ts
git commit -m "feat(tour): audit guide copy to current app + wire spatial fields"
```

---

## Phase 2: Data model + runtime helpers

### Task 4: Extend the `TourStep` interface

**Files:**
- Modify: `src/lib/tours.ts:12-18`

- [ ] **Step 1: Extend the interface**

Replace the `TourStep` interface:

```ts
export interface TourStep {
  title: string
  body: string
  hint?: string
  target?: string                                  // data-tour-id to spotlight
  setup?: string                                   // panel/mode id to open for this step
  advance?: 'next' | 'detector'                    // explicit advance mode
  detector?: (s: TourAppState) => boolean          // read-only state observation
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
}
```

- [ ] **Step 2: Add a helper that resolves the effective advance mode (back-compat)**

Append to `tours.ts`:

```ts
export function effectiveAdvance(step: TourStep): 'next' | 'detector' {
  if (step.advance) return step.advance
  return step.detector ? 'detector' : 'next'
}
```

- [ ] **Step 3: Typecheck**

```powershell
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/tours.ts
git commit -m "feat(tour): extend TourStep with target/setup/advance/placement"
```

### Task 5: Write the typed runtime geometry helpers

**Files:**
- Create: `src/lib/tour-runtime.ts`
- Test: `tests/unit/tour-runtime.spec.ts`

- [ ] **Step 1: Write the failing unit test for `cutoutRectFrom`**

Create `tests/unit/tour-runtime.spec.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cutoutRectFrom } from '../../src/lib/tour-runtime'

describe('cutoutRectFrom', () => {
  it('expands a target rect by padding on all sides', () => {
    const target = { left: 100, top: 50, width: 80, height: 30 } as DOMRect
    const r = cutoutRectFrom(target, 6)
    expect(r).toEqual({ x: 94, y: 44, width: 92, height: 42 })
  })

  it('clamps negative origin to 0', () => {
    const target = { left: 2, top: 1, width: 20, height: 20 } as DOMRect
    const r = cutoutRectFrom(target, 6)
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
  })
})
```

- [ ] **Step 2: Run it, verify it fails**

```powershell
npm run test:unit -- tour-runtime
```
Expected: FAIL — `cutoutRectFrom` not exported / module missing.

- [ ] **Step 3: Implement `tour-runtime.ts`**

Create `src/lib/tour-runtime.ts` (typed, no `@ts-nocheck`):

```ts
import { computePosition, offset, flip, shift, arrow } from '@floating-ui/dom'
import type { Placement } from '@floating-ui/dom'

export interface CutoutRect { x: number; y: number; width: number; height: number }

/** Viewport-space rounded-rect for the spotlight hole, padded around the target. */
export function cutoutRectFrom(target: DOMRect, padding: number): CutoutRect {
  const x = Math.max(0, target.left - padding)
  const y = Math.max(0, target.top - padding)
  return {
    x,
    y,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  }
}

export interface PopoverPlacementResult {
  x: number
  y: number
  placement: Placement
  arrowX: number | null
  arrowY: number | null
}

/** Wraps floating-ui computePosition with the tour's middleware stack. */
export async function positionPopover(
  targetEl: HTMLElement,
  popoverEl: HTMLElement,
  arrowEl: HTMLElement,
  preferred: 'top' | 'bottom' | 'left' | 'right' | 'auto',
): Promise<PopoverPlacementResult> {
  const placement: Placement = preferred === 'auto' ? 'bottom' : preferred
  const { x, y, placement: finalPlacement, middlewareData } = await computePosition(
    targetEl,
    popoverEl,
    {
      placement,
      middleware: [offset(12), flip(), shift({ padding: 8 }), arrow({ element: arrowEl })],
    },
  )
  return {
    x,
    y,
    placement: finalPlacement,
    arrowX: middlewareData.arrow?.x ?? null,
    arrowY: middlewareData.arrow?.y ?? null,
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

```powershell
npm run test:unit -- tour-runtime
```
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

```powershell
npx tsc --noEmit
```
Expected: no errors. (Confirms `@floating-ui/dom` types resolve.)

- [ ] **Step 6: Commit**

```powershell
git add src/lib/tour-runtime.ts tests/unit/tour-runtime.spec.ts
git commit -m "feat(tour): typed runtime geometry helpers (cutout + popover placement)"
```

---

## Phase 3: Overlay component

### Task 6: Add spotlight CSS

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add overlay classes (keep existing `tour-pulse`)**

Append to `src/index.css`:

```css
/* Tour spotlight overlay */
.tour-overlay-svg {
  position: fixed;
  inset: 0;
  z-index: 50;
  /* Root must be none so clicks in the unpainted hole reach the element beneath.
     The dim <path> re-enables pointer-events:auto to swallow dim-area clicks.
     This child-re-enables-on-none-parent pattern is the deterministic SVG
     click-through idiom; relying on the svg root default (auto) makes hole
     click-through browser-dependent and breaks interactive guides. */
  pointer-events: none;
}
.tour-overlay-dim {
  fill: rgba(0, 0, 0, 0.69); /* intentional 0.69 — do not change to 0.68/0.70 */
}
.tour-ring {
  fill: none;
  stroke: #00ffff;
  stroke-width: 3;
  filter: drop-shadow(0 0 12px #00ffff);
  animation: tour-pulse 1.4s ease-in-out infinite;
}
.tour-popover {
  position: fixed;
  z-index: 51;
  max-width: 280px;
  background: #1e1b4b;
  border: 2px solid #7c3aed;
  border-radius: 8px;
  padding: 12px;
  color: #c4b5fd;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), 0 0 18px rgba(124, 58, 237, 0.5);
}
.tour-arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #1e1b4b;
  border-left: 2px solid #7c3aed;
  border-top: 2px solid #7c3aed;
  transform: rotate(45deg);
}
```

Note: `.tour-ring` reuses the existing `tour-pulse` keyframe (defined at index.css:13). Do not duplicate the keyframe.

- [ ] **Step 2: Commit**

```powershell
git add src/index.css
git commit -m "feat(tour): spotlight overlay styles (69% dim, neon ring)"
```

### Task 7: Build `TourOverlay.tsx`

**Files:**
- Create: `src/components/TourOverlay.tsx`

This is the largest task. It renders the running tour. Props are provided by App (Task 9).

- [ ] **Step 1: Define the props and skeleton (portal to body)**

Create `src/components/TourOverlay.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate } from '@floating-ui/dom'
import { ONBOARDING_TOUR, TASK_GUIDES, effectiveAdvance } from '../lib/tours'
import type { TourAppState, TourGuide, TourStep } from '../lib/tours'
import { cutoutRectFrom, positionPopover, type CutoutRect } from '../lib/tour-runtime'

const ALL_GUIDES: TourGuide[] = [ONBOARDING_TOUR, ...TASK_GUIDES]

interface TourOverlayProps {
  open: boolean
  guideId: string | null
  step: number
  appState: TourAppState
  runSetup: (setupId: string) => void   // App resolves setupId -> setter(true)
  onSetStep: (step: number) => void
  onExit: () => void                     // App handles restore + mark-seen
}

export function TourOverlay({
  open, guideId, step, appState, runSetup, onSetStep, onExit,
}: TourOverlayProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLDivElement>(null)
  const [cutout, setCutout] = useState<CutoutRect | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number; arrowX: number | null; arrowY: number | null } | null>(null)
  const [targetMissing, setTargetMissing] = useState(false)
  const detectorBaseline = useRef<boolean | null>(null)

  const guide: TourGuide | null = guideId ? ALL_GUIDES.find(g => g.id === guideId) ?? null : null
  const current: TourStep | null = guide?.steps[step] ?? null
  const isLast = guide ? step === guide.steps.length - 1 : false

  // ... (steps below fill in the effects)

  if (!open || !guide || !current) return null
  // body rendered via portal in Step 4
}
```

- [ ] **Step 2: Implement the per-step sequence effect (setup → mount → baseline → position → autoUpdate)**

Inside the component, add this effect. Order is load-bearing (see spec 5.3): run setup, await target mount+layout, THEN capture detector baseline, then position, then arm autoUpdate.

```tsx
useEffect(() => {
  if (!open || !current) return
  let raf = 0
  let cleanupAuto: (() => void) | undefined
  let cancelled = false

  // Reset baseline synchronously at EVERY step entry. Critical: without this,
  // clicking Back into a step whose detector is already satisfied leaves a stale
  // `false` baseline, and the auto-advance effect sees a false->true edge and
  // bounces the user forward again. The auto-advance effect guards on `=== null`,
  // so it stays inert until the rAF below captures the real post-mount baseline.
  detectorBaseline.current = null
  setTargetMissing(false)

  // 1. setup: open any panel this step needs
  if (current.setup) runSetup(current.setup)

  // no target → centered card (Welcome / all-set). Capture baseline immediately.
  if (!current.target) {
    detectorBaseline.current = current.detector ? current.detector(appState) : null
    setCutout(null)
    setPopoverPos(null) // centered via CSS in render
    return
  }

  // 2. await target mount + stable layout, with a cap so a missing/typo'd
  // target (wrong mode, bad data-tour-id) does not busy-loop forever and strand
  // the user. After ~2s give up: fall back to a centered card and force a Next
  // escape hatch even on detector steps (see render: showNext logic).
  let frames = 0
  const MAX_FRAMES = 120 // ~2s at 60fps
  const waitForTarget = () => {
    const el = document.querySelector(`[data-tour-id="${current.target}"]`) as HTMLElement | null
    const rect = el?.getBoundingClientRect()
    if (el && rect && rect.width > 0 && rect.height > 0) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // 3. capture detector baseline AFTER setup+mount
      detectorBaseline.current = current.detector ? current.detector(appState) : null
      // 4 + 5. position + arm autoUpdate (recompute cutout AND popover together)
      const recompute = async () => {
        if (cancelled || !popoverRef.current || !arrowRef.current) return
        const r = el.getBoundingClientRect()
        setCutout(cutoutRectFrom(r, 6))
        const p = await positionPopover(el, popoverRef.current, arrowRef.current,
          current.placement ?? 'auto')
        if (!cancelled) setPopoverPos({ x: p.x, y: p.y, arrowX: p.arrowX, arrowY: p.arrowY })
      }
      void recompute()
      cleanupAuto = autoUpdate(el, popoverRef.current!, recompute)
    } else if (frames++ < MAX_FRAMES) {
      raf = requestAnimationFrame(waitForTarget)
    } else {
      // target never appeared: degrade to centered card + Next escape hatch
      detectorBaseline.current = current.detector ? current.detector(appState) : null
      setCutout(null)
      setPopoverPos(null)
      setTargetMissing(true)
    }
  }
  raf = requestAnimationFrame(waitForTarget)

  return () => {
    cancelled = true
    cancelAnimationFrame(raf)
    cleanupAuto?.()
  }
  // appState intentionally NOT a dep: baseline captured at step entry only
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open, guideId, step])
```

- [ ] **Step 3: Implement auto-advance (false→true edge) and Esc**

Add two more effects:

```tsx
// Auto-advance on detector false->true edge (interactive steps)
useEffect(() => {
  if (!open || !current) return
  if (effectiveAdvance(current) !== 'detector' || !current.detector) return
  if (detectorBaseline.current === null) return
  const now = current.detector(appState)
  if (detectorBaseline.current === false && now === true) {
    detectorBaseline.current = true // block re-entry
    const last = guide ? step === guide.steps.length - 1 : false
    setTimeout(() => { last ? onExit() : onSetStep(step + 1) }, 400)
  }
}, [appState, open, current, guide, step, onExit, onSetStep])

// Esc exits
useEffect(() => {
  if (!open) return
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit() }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [open, onExit])
```

- [ ] **Step 4: Render the portal (SVG cutout + popover)**

Replace the final `return` with the portal body:

```tsx
const advanceMode = effectiveAdvance(current)
// Show Next for passive steps, no-target steps, and the target-absent fallback
// (so a detector step whose target never mounted still has an escape hatch).
const showNext = advanceMode === 'next' || !current.target || targetMissing
const W = typeof window !== 'undefined' ? window.innerWidth : 0
const H = typeof window !== 'undefined' ? window.innerHeight : 0

return createPortal(
  <>
    <svg className="tour-overlay-svg" width="100%" height="100%"
         onClick={onExit /* clicking dim exits? NO — spec: inert. Use stopPropagation instead. */}>
      {/* Even-odd: outer rect minus cutout hole. Dim painted region swallows clicks. */}
      <path
        className="tour-overlay-dim"
        fillRule="evenodd"
        style={{ pointerEvents: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        d={cutout
          ? `M0 0 H${W} V${H} H0 Z M${cutout.x} ${cutout.y} h${cutout.width} v${cutout.height} h${-cutout.width} Z`
          : `M0 0 H${W} V${H} H0 Z`}
      />
      {cutout && (
        // No rx: the even-odd hole is sharp-cornered, so a rounded ring would
        // let dim triangles peek inside the corners. Keep ring corners sharp to
        // match the hole. (To round both, round the hole path AND the ring.)
        <rect className="tour-ring" x={cutout.x} y={cutout.y}
              width={cutout.width} height={cutout.height}
              style={{ pointerEvents: 'none' }} />
      )}
    </svg>

    <div
      ref={popoverRef}
      className="tour-popover"
      style={cutout && popoverPos
        ? { left: popoverPos.x, top: popoverPos.y }
        : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
    >
      {cutout && (
        <div ref={arrowRef} className="tour-arrow"
             style={{
               left: popoverPos?.arrowX != null ? popoverPos.arrowX : undefined,
               top: popoverPos?.arrowY != null ? popoverPos.arrowY : undefined,
             }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
        <h3 style={{ color: '#e9d5ff', fontWeight: 600, fontSize: 14 }}>{current.title}</h3>
        <button onClick={onExit} title="Exit tour"
                style={{ color: '#7c3aed', fontSize: 16, lineHeight: 1, marginLeft: 8 }}>✕</button>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{current.body}</p>
      {current.hint && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#7c3aed', marginTop: 4 }}>{current.hint}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <span style={{ fontSize: 11, color: '#6d28d9' }}>{step + 1} / {guide.steps.length}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {step > 0 && (
            <button onClick={() => onSetStep(step - 1)}
                    style={{ fontSize: 11, color: '#7c3aed' }}>← Back</button>
          )}
          {showNext && (
            <button onClick={() => isLast ? onExit() : onSetStep(step + 1)}
                    style={{ fontSize: 11, background: '#7c3aed', color: '#fff', padding: '3px 12px', borderRadius: 4 }}>
              {isLast ? 'Done' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  </>,
  document.body,
)
```

Note on the dim `onClick`: remove the top-level `<svg onClick={onExit}>` — that contradicts the "dim is inert" decision. The `<path>` already has `stopPropagation`. The svg element itself should have NO onClick. Fix: `<svg className="tour-overlay-svg" width="100%" height="100%">` with no handler.

- [ ] **Step 5: Typecheck**

```powershell
npx tsc --noEmit
```
Expected: no errors. Fix any type issues (e.g. `TourAppState` import, `Placement` arrow positioning).

- [ ] **Step 6: Commit**

```powershell
git add src/components/TourOverlay.tsx
git commit -m "feat(tour): TourOverlay with portal, SVG cutout, floating popover, auto-advance"
```

---

## Phase 4: Launcher modal

### Task 8: Shrink `TourPanel.tsx` to a centered help-center modal

**Files:**
- Rewrite: `src/components/TourPanel.tsx`

- [ ] **Step 1: Rewrite the component as a centered modal launcher**

Replace `src/components/TourPanel.tsx` entirely:

```tsx
import { ONBOARDING_TOUR, TASK_GUIDES } from '../lib/tours'

interface TourLauncherProps {
  open: boolean
  onClose: () => void
  onStartGuide: (id: string) => void
}

export function TourPanel({ open, onClose, onStartGuide }: TourLauncherProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{ width: 340, background: '#1e1b4b', border: '2px solid #7c3aed',
                    borderRadius: 10, padding: 16, boxShadow: '0 0 30px rgba(124,58,237,0.5)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-sm tracking-widest uppercase" style={{ color: '#c4b5fd' }}>Guides</span>
          <button onClick={onClose} title="Close guides" style={{ color: '#7c3aed', fontSize: 18 }}>✕</button>
        </div>
        <button onClick={() => onStartGuide('onboarding')}
                className="w-full text-left rounded px-3 py-2 text-sm font-medium mb-3"
                style={{ background: '#312e81', color: '#c4b5fd' }}>
          ▶ Quick tour ({ONBOARDING_TOUR.steps.length} steps)
        </button>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#6d28d9' }}>Show me how to...</div>
        <div className="grid grid-cols-2 gap-1.5">
          {TASK_GUIDES.map(g => (
            <button key={g.id} onClick={() => onStartGuide(g.id)}
                    className="text-left rounded px-2 py-1.5 text-xs"
                    style={{ color: '#a78bfa', background: '#241f52' }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck (will fail at App.tsx call site — expected, fixed in Task 9)**

```powershell
npx tsc --noEmit
```
Expected: errors only at the `<TourPanel .../>` call site in App.tsx (old props no longer match). That is fixed in Task 9. The component file itself must be error-free.

- [ ] **Step 3: Commit**

```powershell
git add src/components/TourPanel.tsx
git commit -m "feat(tour): shrink TourPanel to centered help-center launcher modal"
```

---

## Phase 5: Wire App.tsx

### Task 9: Wire state, setup map, snapshot/restore, and mount both components

**Files:**
- Modify: `src/App.tsx` (state ~997-999, mount ~7777-7795, first-run effect ~1818-1826, mark-seen ~1847-1849)

- [ ] **Step 1: Add snapshot state and the setup-action map**

Near the existing tour state (App.tsx ~997):

```tsx
const [tourOpen, setTourOpen] = useState(false);
const [tourGuideId, setTourGuideId] = useState(null);
const [tourStep, setTourStep] = useState(0);
const [launcherOpen, setLauncherOpen] = useState(false);
const tourSnapshot = useRef(null);
```

Add a `runTourSetup` callback and snapshot/restore helpers (place near `handleTourMarkSeen`, ~1847):

```tsx
const SETUP_SETTERS = {
  export: setExportOpen,
  'hardware-picker': setHwPickerOpen,
  'ai-settings': setShowAISettings,
  harmony: setHarmonyOpen,
};

const runTourSetup = (setupId) => {
  const setter = SETUP_SETTERS[setupId];
  if (setter) setter(true);
};

const snapshotTourState = () => {
  tourSnapshot.current = {
    mode, exportOpen, hwPickerOpen, showAISettings, compareMode, harmonyOpen,
  };
};

const restoreTourState = () => {
  const s = tourSnapshot.current;
  if (!s) return;
  setMode(s.mode);
  setExportOpen(s.exportOpen);
  setHwPickerOpen(s.hwPickerOpen);
  setShowAISettings(s.showAISettings);
  setCompareMode(s.compareMode);
  setHarmonyOpen(s.harmonyOpen);
  tourSnapshot.current = null;
};

const startTour = (id) => {
  snapshotTourState();
  setLauncherOpen(false);
  setTourGuideId(id);
  setTourStep(0);
  setTourOpen(true);
};

const exitTour = () => {
  if (tourGuideId === 'onboarding') handleTourMarkSeen();
  setTourOpen(false);
  setTourGuideId(null);
  setTourStep(0);
  restoreTourState();
};
```

Confirm the setter names exist: `setExportOpen`, `setHwPickerOpen`, `setShowAISettings`, `setCompareMode`, `setHarmonyOpen`, `setMode`. (All present in App.tsx; verify by search.)

- [ ] **Step 2: Update first-run effect to start the onboarding tour**

Replace the first-run effect (~1818):

```tsx
useEffect(() => {
  if (!localStorage.getItem('pixel-pal-tour-seen')) {
    setTimeout(() => { startTour('onboarding'); }, 600);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 3: Update the `?` button to open the launcher**

Replace the `?` button onClick (~5724):

```tsx
onClick={() => setLauncherOpen(o => !o)}
```

- [ ] **Step 4: Replace the `<TourPanel>` mount with launcher + overlay**

Replace the existing `<TourPanel ... />` block (~7777) with:

```tsx
<TourPanel
  open={launcherOpen}
  onClose={() => setLauncherOpen(false)}
  onStartGuide={startTour}
/>
<TourOverlay
  open={tourOpen}
  guideId={tourGuideId}
  step={tourStep}
  appState={{ mode, showAISettings, imageDataUrl, exportOpen, compareMode, hwPickerOpen, aiLoading, baseColors }}
  runSetup={runTourSetup}
  onSetStep={setTourStep}
  onExit={exitTour}
/>
```

Add the import (~20): `import { TourOverlay } from './components/TourOverlay'`. Keep the `TourPanel` import.

- [ ] **Step 5: Remove now-dead code**

Remove the old `activeTourTarget` `useMemo` + `scrollIntoView` effect (~1620-1631) — the overlay owns scrolling now. Remove `tour-highlight` className concatenation on `mode-tabs`/`ramp-area`/`export-panel` (the `.tour-highlight` CSS class can stay for now; the inline `${activeTourTarget === ... }` expressions must go since `activeTourTarget` is deleted). Keep the `data-tour-id` attributes.

- [ ] **Step 6: Typecheck + build**

```powershell
npm run build
```
Expected: `tsc --noEmit` passes, `vite build` succeeds. Fix any dangling references to removed symbols.

- [ ] **Step 7: Manual smoke test**

```powershell
npm run dev
```
Clear the flag in devtools console: `localStorage.removeItem('pixel-pal-tour-seen')`, reload. Expected: onboarding tour auto-starts with dim + spotlight on the mode tabs, popover with arrow, Next advances, Esc exits and the UI is unchanged. Click `?`: the centered launcher modal appears. Start "Snap to hardware colors": step 1 spotlights the Export header; clicking it advances; step 2 spotlights Hardware Lock (panel auto-opened via setup); clicking it advances; step 3 is a centered card; Done exits and Export returns to its pre-tour state.

- [ ] **Step 8: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(tour): wire overlay + launcher, snapshot/restore, first-run spotlight"
```

---

## Phase 6: Tests

### Task 10: Update onboarding e2e for the new shell

**Files:**
- Modify: `tests/e2e/onboarding.spec.ts`

- [ ] **Step 1: Update selectors from sidebar to popover/modal**

The tour no longer renders the word "Guides" as a sidebar header during a running tour; it renders a popover with the step title. Update assertions:
- Auto-open test: assert `getByText('Welcome to PIXEL.PAL')` is visible (popover title) instead of the "Guides" sidebar.
- Complete test: click `Next →` through steps, final button is `Done`; after Done, assert the popover is not attached and `pixel-pal-tour-seen` is `'1'`.
- `?` button test: clicking `?` shows the launcher modal — assert `getByText('Guides', { exact: true })` (modal header) and `getByText('Quick tour')`.
- Skip: the popover X (`title="Exit tour"`) replaces the old Skip button. Update the "skip closes tour" test to click `getByTitle('Exit tour')` and assert the flag is set.
- The "all 8 task guides listed" test: open launcher, assert all 8 labels visible (grid).

Apply these edits; keep the test structure. Exact label strings come from the current `tours.ts` after Task 3.

- [ ] **Step 2: Run**

```powershell
npm run test:e2e -- onboarding.spec.ts
```
Expected: PASS. Iterate on selectors until green.

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/onboarding.spec.ts
git commit -m "test(tour): update onboarding e2e for popover + launcher modal"
```

### Task 11: Update tour-reality e2e

**Files:**
- Modify: `tests/e2e/tour-reality.spec.ts`

- [ ] **Step 1: Update any reworded labels from Task 3**

Layer-1 token tests assert specific labels exist. If Task 3 reworded copy that references a label, update the expected label here to match the current DOM. The helper `openGuides` clicks `getByTitle('Open guides')` then expects "Guides" — update to open the launcher modal (same title works if the `?` button keeps `title="Open guides"`; confirm and adjust).

- [ ] **Step 2: Update the detector-walk for click-through**

Layer-2 tests drive a guide and expect auto-advance. With the overlay, the spotlighted element is clickable via the cutout. The existing JS-dispatch workaround (line ~193) can stay or be simplified to a normal `.click()` if the cutout passes events. Verify each walk test (`hex-palette`, `export-gpl`, `wcag-compare`, `hardware-lock`) still advances within 2s; the guide must be started via the new launcher (`startTour`) flow.

- [ ] **Step 3: Run**

```powershell
npm run test:e2e -- tour-reality.spec.ts
```
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add tests/e2e/tour-reality.spec.ts
git commit -m "test(tour): update tour-reality for overlay click-through + launcher"
```

### Task 12: New spotlight e2e (portal, hit-test, setup-advance, restore)

**Files:**
- Create: `tests/e2e/tour-spotlight.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/tour-spotlight.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

async function suppressAutoOpen(page) {
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
  // popover present
  await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()
  // the overlay svg is a direct-ish child of body, not inside the CRT/perspective wrapper
  const parentIsBody = await page.evaluate(() => {
    const svg = document.querySelector('.tour-overlay-svg')
    return svg?.parentElement === document.body
  })
  expect(parentIsBody).toBe(true)
})

test('dim-area click is inert; hole click reaches the target element', async ({ page }) => {
  // Inert dim: clicking far from the popover does not advance/exit.
  await openLauncher(page)
  await page.getByText('Quick tour').click()
  await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()
  await page.mouse.click(5, 5) // top-left, on the dim path, away from popover
  await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()

  // Click-through: in a detector guide, clicking the spotlighted real element
  // (through the cutout hole) must advance. If pointer-events are wrong, the SVG
  // intercepts and this fails with pointer interception — the canary for Bug 2.
  await page.keyboard.press('Escape')
  await openLauncher(page)
  await page.getByText('Snap to hardware colors').click()
  await page.getByRole('button', { name: /Export & Tools/ }).click()
  await expect(page.getByText('Open the hardware picker')).toBeVisible({ timeout: 2000 })
  // normal Playwright click (no JS dispatch) — proves the hole passes events
  await page.getByRole('button', { name: 'Hardware Lock', exact: true }).click()
  await expect(page.getByText('Shades snapped')).toBeVisible({ timeout: 2000 })
})

test('Esc exits the tour and restores Export panel state', async ({ page }) => {
  // Export starts closed
  await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toHaveCount(0)
  await openLauncher(page)
  await page.getByText('Snap to hardware colors').click()
  // step 1: click Export header to advance (detector)
  await page.getByRole('button', { name: /Export & Tools/ }).click()
  // step 2 setup opens the panel; Hardware Lock now visible/spotlit
  await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toBeVisible({ timeout: 2000 })
  // Esc exits
  await page.keyboard.press('Escape')
  // restore: Export returns to closed (pre-tour state)
  await expect(page.getByRole('button', { name: 'Hardware Lock', exact: true })).toHaveCount(0)
})

test('hardware-lock guide auto-advances through setup step', async ({ page }) => {
  await openLauncher(page)
  await page.getByText('Snap to hardware colors').click()
  await page.getByRole('button', { name: /Export & Tools/ }).click()
  await expect(page.getByText('Open the hardware picker')).toBeVisible({ timeout: 2000 })
  await page.getByRole('button', { name: 'Hardware Lock', exact: true }).click()
  await expect(page.getByText('Shades snapped')).toBeVisible({ timeout: 2000 })
})
```

- [ ] **Step 2: Run**

```powershell
npm run test:e2e -- tour-spotlight.spec.ts
```
Expected: PASS (4 tests). If the dim-click test flakes because the popover covers (5,5), pick a coordinate provably outside the popover (e.g. bottom-right corner via `page.viewportSize()`).

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/tour-spotlight.spec.ts
git commit -m "test(tour): spotlight overlay portal, hit-test, setup-advance, restore"
```

### Task 13: Full suite + web build check

**Files:** none (verification)

- [ ] **Step 1: Run unit + desktop e2e**

```powershell
npm test
npm run test:e2e
```
Expected: all green.

- [ ] **Step 2: Web build + web e2e (gated Tauri import sanity)**

```powershell
npm run build:web
npx playwright test --config=playwright.web.config.ts
```
Expected: web build succeeds (overlay uses no Tauri APIs), web e2e green.

- [ ] **Step 3: Final manual pass of all 9 guides**

```powershell
npm run dev
```
Walk every guide start-to-finish. Confirm: spotlight lands correctly, popover arrow points at target, interactive steps advance on the real click, passive steps advance on Next, Esc/X exit and restore, no-target steps render centered.

- [ ] **Step 4: Commit any fixes, then the suite is done**

```powershell
git add -A
git commit -m "test(tour): full suite green + manual verification of all 9 guides"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Spotlight/dim/popover (spec §3, §5.2) → Tasks 6, 7. ✓
- Portal to body (§5.1) → Task 7 Step 1/4, Task 12 test 1. ✓
- SVG even-odd clickable cutout (§5.2) → Task 7 Step 4, Task 12 test 2. ✓
- Per-step ordering setup→mount→baseline→position→autoUpdate (§5.3) → Task 7 Step 2. ✓
- Scroll/resize tracking of hole + popover together (§5.4) → Task 7 Step 2 `recompute` in `autoUpdate`. ✓
- Snapshot/restore (§5.5) → Task 9 Step 1. ✓
- Esc + X exit (§5.6) → Task 7 Step 3, Task 8, Task 9. ✓
- First-run → tour; `?` → launcher (§6) → Task 9 Steps 2-3. ✓
- Launcher centered modal grid (§3, §6) → Task 8. ✓
- Copy reality audit + anchors (§7) → Phase 1 (Tasks 1-3). ✓
- `@floating-ui/dom` (§8) → Task 0 Step 1. ✓
- Tests preserve + add (§9) → Phase 6. ✓
- Phase 0 spike (§10.0) → Phase 0. ✓
- Data model extension (§4.1) → Task 4. ✓

**Type consistency:** `cutoutRectFrom`, `positionPopover`, `CutoutRect`, `effectiveAdvance`, `runTourSetup`/`runSetup`, `startTour`/`exitTour`, `onStartGuide` used consistently across Tasks 4-9. `TourOverlay` prop names match the App mount in Task 9 Step 4.

**Placeholder scan:** no TBD/TODO; all code steps show full code; commands have expected output.
