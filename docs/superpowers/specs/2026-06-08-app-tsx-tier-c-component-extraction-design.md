# App.tsx Tier C — Per-Panel Component Extraction (Design)

**Date:** 2026-06-08
**Status:** Approved (design); pending implementation plan
**Predecessors:** Tier A (helpers → `lib/`, PR #31), Tier B (state → 14 hooks, PR #31/#32/#33)
**Related memories:** `app-tsx-decomposition`, `token-control-execution`, `old-palette-opt-out`

---

## Problem

`src/App.tsx` is a ~6,482-line `@ts-nocheck` god component. Tier A extracted pure
helpers; Tier B extracted all domain state into 14 hooks. What remains is the
~2,200-line JSX `return` (lines ~4431–6650) plus a wiring layer that instantiates
every hook and threads ~79 setters/handlers into that JSX.

Every new feature lands in this file, growing blast radius. The `@ts-nocheck`
pragma means `tsc`/`npm run build` does **not** catch dangling references or prop
mismatches here — grep + a manual type-gate are the only safety nets. Tier C
extracts the JSX into per-panel components so App.tsx becomes a thin shell:
provider tree + generate pipeline + per-panel wiring for the few coupled hooks.

## Goals

- Decompose the JSX `return` into ~8 focused, independently-readable panel
  components, one small PR each.
- Decouple presentation from state *source* via React Context, so the state model
  can later migrate slice-by-slice to a reducer/store **without touching panels**.
- Do not reopen Tier B hooks, the generate pipeline, or settled decisions.
- Preserve zero behavior change per PR (the campaign invariant).

## Non-Goals

- No reducer/store this tier. Context is the seam that *enables* that later; it is
  not itself the store migration. (Confirmed with user: Hybrid is the on-ramp to a
  full store, not a wall.)
- No new features, no panel redesigns, no unrelated refactoring.
- No removal of the `@ts-nocheck` pragma from App.tsx (still intentional).

---

## Architecture: Hybrid wiring (context + co-location + props)

State reaches a panel by one of three routes, chosen by how many consumers it has:

### 1. Context — for genuinely shared state (multiple panel consumers)

Four providers, split by **update cadence** so a hot update doesn't re-render cold
panels:

| Provider | Holds | Update cadence |
|----------|-------|----------------|
| `PaletteContext` | committed document state (ramps, base colors, locks) + `useHistory` | on commit |
| `EditorContext` | live editor state — `editingIndex`, `editorHsv`, `pinEditor` | **every HSV drag frame** |
| `ThemeContext` | theme tokens `t` + display settings | rarely |
| `LayoutContext` | section order/open flags + drag handlers (`makeSectionDragHandlers`, `dropLine`, `sectionOrder`) | on toggle/reorder |

**Critical perf split:** `editingIndex`/`editorHsv` tick on every slider drag. They
MUST live in `EditorContext`, separate from the committed ramps in `PaletteContext`.
If they shared a context, TopControls / Export / Saved would re-render every drag
frame. Only the active ramp card should re-render on drag.

### 2. Co-location — for single-consumer hooks

Where a Tier-B hook feeds exactly one panel and nothing else, the hook call **moves
down into that panel** and leaves App.tsx entirely (strictly better than context —
removes the state from the shell). Candidate hooks (consumer count grep-verified
per-panel in the plan, not assumed here):

- `useSavedPalettes` → SavedPalettesPanel
- `useSideBySide` → VizComparePanel
- `useUpdater` → UpdateNotification
- `useTour` → TourOverlay (already a component)
- `useSpriteImport` → PlaygroundPanel

### 3. Props — for hooks coupled to the generate pipeline

Some "feature" hooks are **not** single-consumer: `useImageExtract` and
`useAIAssist` produce colors that feed the central **generate pipeline**, which
deliberately stayed in App.tsx (Tier B Wave 2 decision). These stay wired in the
shell; their results pass down as explicit props. They do **not** co-locate.

> The plan's per-panel investigation step settles each hook's true consumer count
> by grep before moving it. Co-location candidates above are hypotheses to verify,
> not commitments.

---

## Panel inventory

Boundaries honor the 7 existing reorderable section keys
(`['ramps','harmony','playground','viz','saved','history','export']`, from
`usePanelLayout`/`DEFAULT_SECTION_ORDER`) plus the top-controls region above the
sortable area and the update notification below it.

| Panel | Section key | JSX lines (approx, will drift) | Existing sub-components | Coupled to gen pipeline? |
|-------|-------------|-------------------------------|-------------------------|--------------------------|
| TopControls | (above grid) | 4431–4933 | — | **Yes** (generate, AI, extract) |
| RampsPanel | `ramps` | 4934–5394 | RampAdvancedPanel ✓ | partial (editor) |
| HarmonyPanel | `harmony` | 5395–5593 | — | partial (harmony derive) |
| PlaygroundPanel | `playground` | 5594–5901 | PixelPlayground ✓ | no |
| VizComparePanel | `viz` | 5902–6114 | AdjacencyMatrix, CrossRampDither, DitherBlend, CurveEditor ✓ | no |
| SavedPalettesPanel | `saved` | 6115–6302 | — | no |
| HistoryPanel | `history` | 6303–6368 | — | no |
| ExportPanel | `export` | 6369–6476 | — | no |
| UpdateNotification | (fixed, outside grid) | 6505+ | — | no |

Line numbers are indicative; the plan anchors each extraction on grep-able strings,
not line numbers (per `token-control-execution`).

---

## PR sequence (risk-based, NOT layout order)

**PR #1 — `<SectionCard>` dedupe (pre-requisite, zero extraction).**
The 7 reorderable sections each wrap their content in a near-identical div carrying
`{...makeSectionDragHandlers(key)}` + `style={{ order: sectionOrder.indexOf(key),
background, borderColor, boxShadow:[accentGlow(...), dropLine(key)] }}` (lines 4934,
5395, 5594, 5902, 6115, 6303, 6369 — copy-pasted 7×). Extract one
`<SectionCard sectionKey accent>` that owns all drag/order/theme chrome (consuming
`LayoutContext` + `ThemeContext`); each section's content becomes its child. This is
a pure 7→1 dedupe — no panel extraction — and it removes the need to drill drag
chrome into every panel. **Must land before any panel PR**, because panel boundaries
become "the child of a SectionCard."

The provider tree (`PaletteContext`/`EditorContext`/`ThemeContext`/`LayoutContext`)
is also established here or in an adjacent setup PR, so panels have something to
consume.

**Then panels, smallest/least-coupled first → most-coupled last:**

1. HistoryPanel — pilot (~65 lines, toggle + list, no coupled hooks). Proves the
   pattern on the smallest leaf.
2. ExportPanel
3. SavedPalettesPanel (co-locate `useSavedPalettes`)
4. PlaygroundPanel (co-locate `useSpriteImport`)
5. VizComparePanel (co-locate `useSideBySide`)
6. HarmonyPanel
7. RampsPanel (editor-coupled; `EditorContext` consumer)
8. TopControls — **last** (~500 lines, wired into generate + AI + extract; most coupled)
9. UpdateNotification (co-locate `useUpdater`; can land any time after providers)

Each is its own PR, ideally its own fresh session (`executing-plans` cadence) to keep
context from compounding.

---

## Safety gates (per PR)

The campaign's existing net, **widened for Tier C's new failure mode**:

1. **Strict prop interfaces.** Every new panel declares a non-optional TypeScript
   props interface. **No `(props: any)`** — without a typed interface the JSX call
   site has nothing to check against.
2. **Widened type-gate.** Temporarily strip `@ts-nocheck` from App.tsx, run
   `tsc --noEmit`, and diff errors against baseline. Tier B watched only **TS2304**
   (`Cannot find name` — deleted-but-referenced). Tier C adds the **prop-mismatch**
   failure mode (App.tsx passes `foo`, panel reads `bar`), so the gate must also
   catch **TS2322 / TS2741 / TS2739** (type / missing-property errors at the
   `<Panel .../>` call site). Restore the pragma with the **inverse edit (sed/Edit),
   never `git checkout`/`git stash`** (a checkpoint-revert wipes all uncommitted
   work — see skill-obs #11).
3. **Grep gate.** Per-symbol grep for moved/removed identifiers (decl + refs), as in
   Tier B. Necessary but not sufficient alone — see #2.
4. **Build + unit + e2e green.** `npm run build`, `npm test`, and the relevant
   Playwright spec. The undo/redo and reorder e2e specs guard the highest-risk
   interactions.
5. **Zero behavior change.** Visual/interaction parity per panel; the user spot-checks
   live where useful (`verify-prefer-show-live`).

---

## Why this reaches the long-term endpoint reversibly

Tier B's 14 hooks are already ~80% of a store — each owns a state slice. The only
thing separating that from a store is how components read it. Today App.tsx reads
every hook and drills values down. After Tier C, panels read via context. That
context boundary is the seam: a later, optional step can swap any hook's internals
for a `useReducer` or a store slice **without touching a single panel**. Tier C is
therefore the first reversible step of the store migration, taken one safe per-panel
PR at a time — not a competing architecture that locks it out.

## Risks

- **Context-as-god-object anti-pattern.** A single context holding all 79 values is
  just props-drilling with worse re-renders. Mitigated by the deliberate 4-way split
  above; the plan must not collapse it.
- **Hidden prop break.** The primary Tier C hazard; mitigated by gate #1 + #2.
- **Co-location misjudged.** A hook assumed single-consumer but actually feeding the
  gen pipeline. Mitigated by grep-verifying consumer count before each move.
- **Context churn during extraction.** Establishing providers mid-campaign risks a
  half-migrated state. Mitigated by landing providers + SectionCard in PR #1 before
  any panel.
