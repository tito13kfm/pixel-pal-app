# Guided Tour Redesign: Spotlight Onboarding & Interactive Guides

**Date:** 2026-05-28
**Status:** Design approved (sections), pending written-spec review
**Author:** Tim Kurash (design owner), implementation by Claude

---

## 1. Problem

The current onboarding/help system (`src/lib/tours.ts`, `src/components/TourPanel.tsx`)
is a fixed left sidebar that shows step text. It has two interaction models:

- **Onboarding tour** (4 steps): passive, read box then click Next.
- **Task guides** (8 guides): interactive, user performs the real action and a
  read-only `detector` auto-advances.

Limitations:

- The explanation box never points *at* the thing it describes. Only 3 elements
  (`mode-tabs`, `ramp-area`, `export-panel`) have spotlight anchors; the pulse is
  a faint box-shadow that is easy to miss.
- No dimming, no spatial focus. Task guides have zero spotlight, they only
  observe state.
- The panel cannot reveal what it describes (e.g. open a collapsed card).
- Guide copy has drifted from the app: the app gained the perceptual OKLCH
  engine, curve editors, style presets, and section drag-reorder since the
  guides were written. Some copy and detectors no longer reflect reality.

## 2. Goals

1. Redesign onboarding and all 8 task guides into a spotlight tour: dim the
   window, highlight the relevant element with a neon ring, float an explanation
   popover with an arrow pointing at the element.
2. Tours can open/close collapsed cards to reveal what a step describes, then
   restore the prior UI state on exit.
3. Interactive guides keep live detector auto-advance, the user performs the
   real action on the spotlighted (clickable) element.
4. Audit every existing guide so copy and detectors reflect the current app.
5. Preserve the value the existing e2e suite protects (token matching, detector
   walk), updating tests in lockstep with the rewrite.

## Non-goals

- No change to palette generation, color math, or any app feature itself.
- No new guides in this project (the audit may reword/retarget existing ones;
  adding brand-new guides is a follow-up).
- No analytics/telemetry on tour completion.

---

## 3. Decisions (locked during brainstorming)

| Topic | Decision |
|---|---|
| Scope | Onboarding **and** all 8 task guides get spotlight + callouts + live auto-advance. |
| Shell | Floating popover with an arrow pointing at the target (option C). Centered card fallback for steps with no target (Welcome / all-set). |
| Placement engine | `@floating-ui/dom` (vanilla package, not the React wrapper). |
| Spotlight look | Neon glow: **69%** dim (`rgba(0,0,0,0.69)` — intentional, do not "correct" to 0.68 or 0.70), bright cyan ring + outer glow, gentle pulse. Cutout geometry under the hood so the spotlighted element is clickable. |
| Interactive advance | Click the real target to advance (detector fires). Dimmed area is inert (clicks do nothing). No Next button on action-steps; Back is still available. |
| Panel restore | Snapshot open panels/mode on tour start; restore exactly on finish or early-exit. |
| Exit | Esc key and an X / "Exit tour" control on the popover. The `?` button opens the launcher; it does not force-close a running tour. |
| Launcher | Centered modal "help center" (option A): dims app, roomy card, 2-column grid of guides; scales as guides grow. |

---

## 4. Architecture

Three layers plus two components. The split keeps `tours.ts` pure serializable
data (the e2e tests parse it and `tsc` typechecks it), and keeps React state and
side effects in `App.tsx`.

### 4.1 Layer 1 — `src/lib/tours.ts` (pure data, extended)

`TourStep` gains four optional fields. All are plain values or read-only
functions; **no closures over App state, no setters.**

```ts
export interface TourStep {
  title: string
  body: string
  hint?: string
  target?: string                                  // existing: data-tour-id to spotlight
  setup?: string                                   // NEW: panel/mode id this step needs open
  advance?: 'next' | 'detector'                    // NEW: explicit advance mode
  detector?: (s: TourAppState) => boolean          // existing: read-only state observation
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'  // NEW: popover side hint (default 'auto')
}
```

- `advance` is made **explicit** rather than inferred from `detector` presence.
  Passive onboarding steps use `'next'`; interactive guide steps use `'detector'`.
  Defaulting rule for back-compat: if `advance` is omitted, treat as `'detector'`
  when a `detector` exists, else `'next'`.
- `setup` is a string id (e.g. `'export'`, `'ai-settings'`, `'hardware-picker'`),
  resolved to a setter in App via the dispatch map (4.3). Steps that should
  *teach* the user to open a panel themselves do **not** set `setup`; they keep
  "open the panel" as a detector step.
- `TourGuide` and `TourAppState` are unchanged except `TourAppState` may grow
  fields if the audit needs new detectors.

### 4.2 Layer 2 — `src/lib/tour-runtime.ts` (new, typed, no `@ts-nocheck`)

Side-effect-free helpers, the glue between pure data and React:

- `positionPopover(targetEl, popoverEl, arrowEl, placement)` — wraps
  `@floating-ui/dom` `computePosition` with `offset`, `flip`, `shift`, `arrow`
  middleware. Returns coords for popover + arrow.
- `getCutoutRect(targetEl, padding)` — returns the viewport-space rect
  (`getBoundingClientRect` + padding) for the spotlight hole.
- Type definitions shared by the overlay component.

This file is **typed** (it is new code, not artifact-derived). The intentional
`// @ts-nocheck` applies only to `color.ts` and `App.tsx`; it must not leak here.

### 4.3 Layer 3 — `App.tsx` (state + dispatch owner)

- Owns existing `tourOpen`, `tourGuideId`, `tourStep`.
- New `tourSnapshot` state: captures `{ mode, exportOpen, hwPickerOpen,
  showAISettings, compareMode, ... }` at tour start for restore on exit.
- A `SETUP_ACTIONS` map resolving `setup` ids to existing panel setters, e.g.
  `{ export: setExportOpen, 'hardware-picker': setHwPickerOpen,
  'ai-settings': setShowAISettings }`. Defined in App because it closes over
  React setters; passed to the overlay as a callback prop.
- Renders `<TourOverlay>` (running tour) and the launcher modal.

### 4.4 Components

- **`src/components/TourOverlay.tsx`** (new, typed) — renders the running tour:
  the dim+cutout layer, the floating popover (arrow, title, body, hint,
  Back/Exit, step counter, conditional Next), and orchestrates the per-step
  sequence (4.6). **Portaled to `document.body`** (4.5).
- **`src/components/TourPanel.tsx`** (shrinks) — becomes only the centered
  help-center launcher modal: "Quick tour" + a 2-column grid of task guides.
  The step-rendering and detector logic move out to `TourOverlay`.

---

## 5. Critical mechanics

### 5.1 Portal to `document.body` (hard requirement)

The overlay uses `position: fixed` and positions the cutout hole from
`getBoundingClientRect` (viewport coords). A fixed element is positioned relative
to the nearest ancestor that has `transform`, `filter`, `backdrop-filter`, or
`perspective` — such an ancestor becomes the containing block and breaks the
viewport-coordinate assumption.

This app has **both** hazards:
- the CRT layer `transform: perspective(500px) rotateX(60deg)` (App.tsx ~5715),
- `backdrop-blur-sm` on the very cards being spotlighted (`ramp-area`,
  `export-panel`).

Therefore `TourOverlay` **must** render through a React portal to `document.body`
(via `createPortal`), outside any transformed/filtered ancestor. This is a
requirement, not an option.

### 5.2 Clickable cutout via SVG even-odd mask

The dim layer is an SVG covering the viewport with a single `<path>` using
`fill-rule="evenodd"`: an outer full-viewport rectangle minus an inner
rounded-rect over the target. The painted region (everything except the hole)
carries the dim fill and `pointer-events` to swallow clicks on the dimmed area
(inert, per the interaction decision). The unpainted hole has no fill and lets
clicks pass through to the real element beneath, so interactive steps work by
clicking the actual button. The neon ring + glow is drawn around the hole edge.

`pointer-events` detail: the SVG path is the only pointer-capturing surface; the
hole is a true gap so events reach the underlying element naturally. The popover
sits above the SVG with its own pointer events.

### 5.3 Per-step sequence (ordered, must not be reordered)

For each step, in this exact order:

1. **Run `setup`** (if present): call the mapped setter to open the needed panel.
2. **Await target mount + layout**: wait until `[data-tour-id="<target>"]` exists
   and layout is settled (e.g. `requestAnimationFrame` / a short rAF loop until
   the rect is non-zero and stable). Do not measure on the same tick as the
   setState that opens the card, layout is not ready yet.
3. **Capture detector baseline** *after* setup+mount: record `detector(appState)`
   now. This is the bug that silently kills auto-advance, if the baseline is
   captured before setup, an already-true detector never produces the false→true
   edge. Baseline capture happens here, not earlier.
4. **Position**: compute cutout rect and popover/arrow coords.
5. **Arm `autoUpdate`**: subscribe to scroll/resize so popover *and cutout hole*
   recompute together on the same cadence (5.4).

Auto-advance still fires on the detector's false→true edge (existing
edge-trigger logic from `TourPanel`), preserved and moved into `TourOverlay`.

### 5.4 Scroll/resize tracking

`@floating-ui/dom` `autoUpdate` drives popover repositioning. The SVG cutout rect
**must** recompute on the identical cadence or the hole and popover drift apart
mid-scroll. Wire both off the same `autoUpdate` callback. Also recompute on
window resize and on the target element resizing (ResizeObserver if needed).

### 5.5 Panel snapshot / restore

On tour start: snapshot the relevant UI booleans/mode into `tourSnapshot`.
On finish or any exit path (Esc, popover X, completing the last step): restore
each value from the snapshot, then clear it. Steps that taught the user to open a
panel themselves (no `setup`) are still restored, so the app returns to its
pre-tour state regardless of who opened what.

### 5.6 Exit paths

- **Esc**: a keydown listener (added while `tourOpen`) exits and restores.
- **Popover X**: an always-visible exit control.
- Onboarding-specific: exiting via any path still sets `pixel-pal-tour-seen`
  (preserves the existing first-run-once contract).

---

## 6. First-run & launcher behavior

- **First run** (`pixel-pal-tour-seen` unset): after the existing ~600ms delay,
  launch directly into the onboarding **tour** (spotlight), not the launcher
  modal. Matches today's auto-open intent.
- **`?` button**: opens the centered help-center launcher modal (dim + roomy
  card, 2-column guide grid). Clicking a guide closes the modal and starts that
  tour. Clicking `?` while a tour runs opens the launcher over it (does not
  force-close the tour); this is an edge case, acceptable.
- The launcher lists "Quick tour" plus the task guides. Grid layout scales as
  guides are added later.

---

## 7. Guide copy reality audit (independent workstream)

Largely decoupled from the overlay engine and delivers value immediately, so it
runs as the **first phase**, against the current system.

For every guide, build a per-step spec table and verify against the live app:

`guide → step → target selector (data-tour-id) → setup panel → popover placement
→ exact copy → advance mode (next | which detector) → behavior if target absent`

- The audit is the work that enumerates every needed `data-tour-id`. Today only
  3 exist (`mode-tabs`, `ramp-area`, `export-panel`); the redesign needs an
  anchor on every targeted element. Adding stable `data-tour-id` attributes is
  part of this phase.
- Lever: `tests/e2e/tour-reality.spec.ts` layer-1 token matching already asserts
  that every UI label named in tour copy exists in the rendered DOM. Run it,
  fix drift, extend it to cover any reworded copy.
- Known drift to check: OKLCH engine wording, curve editors (already referenced
  in `hex-palette` step 3, verify), style presets, section drag-reorder, any
  renamed buttons.

---

## 8. Dependencies

- Add `@floating-ui/dom` (vanilla, ~5KB gzipped) to `dependencies`. Lands in both
  desktop and web bundles; acceptable given it is small and the alternative is
  hand-rolled edge-flip geometry we would own and mis-handle.
- No other new runtime deps. React `createPortal` is already available via
  `react-dom`.

---

## 9. Testing

Tests change in lockstep with the rewrite; the existing suite encodes invariants
to preserve or consciously replace.

**Preserve (update selectors as needed):**
- `onboarding.spec.ts`: auto-open on first run; complete/skip set
  `pixel-pal-tour-seen`; `?` opens launcher; no auto-open on return; 8 guides
  listed. The "Done/Skip" and counter assertions move from sidebar selectors to
  popover/modal selectors.
- `tour-reality.spec.ts`: layer-1 token matching (keep, extend for reworded
  copy); layer-2 detector walk (keep; update the action of clicking through the
  overlay, the JS-dispatch trick at line ~193 already anticipates z-index, the
  clickable cutout should make it cleaner).

**Add:**
- Portal correctness: overlay mounts under `document.body`, not inside the CRT
  or card containers.
- Cutout hit-testing: a click in the hole reaches the target; a click on the dim
  area does not advance.
- Setup→measure→baseline ordering: a step with `setup` that opens Export and
  targets a nested element auto-advances correctly (the Phase-0 spike, hardened
  into a test).
- Restore: after a tour that opened Export, exiting restores the prior
  open/closed state.

**Unit (vitest):** `tour-runtime.ts` placement/cutout helpers where pure-testable
(rect math; floating-ui itself is trusted).

---

## 10. Implementation phasing (for the plan)

0. **Phase 0 spike** (de-risk before locking the data model): one step,
   end-to-end, targeting Hardware Lock *inside* the collapsed Export panel:
   `setup`-open Export → await mount → spotlight → clickable cutout → advance.
   Proves the expand-then-measure timing and the portal/coordinate approach. If
   this fights us, revisit the `setup`/`advance` shape before it is locked.
1. **Guide copy reality audit** (Section 7): standalone, against the current
   system, using `tour-reality.spec.ts` as the lever. Enumerate every needed
   `data-tour-id` and add the attributes.
2. **Data model**: extend `TourStep`, write `tour-runtime.ts`, add
   `@floating-ui/dom`.
3. **Overlay component**: `TourOverlay.tsx` with portal, SVG cutout, popover,
   per-step sequence, exit paths, snapshot/restore.
4. **Launcher**: shrink `TourPanel.tsx` to the centered help-center modal.
5. **Wire onboarding + 8 guides** through the new engine; first-run behavior.
6. **Tests**: update preserved specs, add new ones.

---

## 11. Open items (decide during implementation, not blocking)

- Exact dim opacity is locked at 0.69; ring color reuses the existing cyan
  (`#00ffff`) and the `tour-pulse` keyframe in `index.css` (tune timing).
- Popover max-width and small-window behavior: `@floating-ui/dom` `shift` handles
  clamping; pick a sensible max-width during build.
- Whether the centered fallback card (no-target steps) reuses the popover
  component centered, or a distinct element. Lean: same component, centered, no
  arrow.
