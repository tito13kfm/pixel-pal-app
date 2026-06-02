# App.tsx Decomposition — Tier A: Pure-Helper Extraction

**Date:** 2026-06-02
**Status:** Design — pending user approval
**Scope:** Tier A of a 3-tier decomposition of `src/App.tsx` (8039 lines).

---

## Problem

`src/App.tsx` is 8039 lines and carries `// @ts-nocheck`. It hurts three
things: token cost when editing (large reads), readability, and ease of
expansion. Anatomy:

| Region | Lines | ~Size | Content |
|---|---|---|---|
| Imports + storage shim | 1–62 | 60 | — |
| **Top-level pure helpers** | 63–916 | ~850 (10%) | WCAG, image extract/remap, quantize, parsers, harmony, randomizer, panel state |
| Main component logic | 919–5840 | ~4900 (61%) | 208 hooks, 124 handlers, nested `Swatch`/`HarmonySwatch` |
| JSX return | 5841–8039 | ~2200 (27%) | per-panel/view markup |

The bulk is one god component. Decomposing it safely cannot happen in one
pass, so the work is split into three sequenced sub-projects, each with its
own spec → plan → execute cycle and a build+e2e verification gate between
them.

```
Tier A  Pure helpers → lib/ modules        ~850 lines out   low risk    ← THIS SPEC
Tier B  Domain logic → custom hooks         ~2-3k lines out  med risk    (own cycle)
Tier C  JSX return → per-panel components   ~2k lines out    high risk   (own cycle)
```

**Deferred to Tier B's spec** (noted, not decided here): the state-sharing
architecture for hooks/panels (context vs reducer vs prop objects). It is the
central fork for B and C and earns its own brainstorm. Tier A shrinks the
surface and proves the test net before that decision.

---

## Goal (Tier A)

Extract the ~850 lines of top-level **pure** helpers (lines 63–916) into typed
`lib/` modules, each with a unit spec, matching the existing convention (17
`lib/` modules, each with a `.spec.ts`; App.tsx already imports 14).

**Net result:** App.tsx ~8039 → ~7,200 lines; +10 typed, tested modules; zero
behavior change.

Tier A explicitly does **not** touch the god component's hooks, handlers, or
JSX. `PixelSprite` (line 636), though top-level, is a React component and
belongs to Tier C — it is **out of scope** here.

---

## Constraints & gotchas (verified)

1. **`strict: true` + `noUnusedParameters: true`** (tsconfig.json /
   tsconfig.app.json). New `lib/` modules build under the app tsconfig, so
   untyped params *and* unused params both fail `tsc`. "Type them properly"
   therefore includes: add real types, and silence unused params by
   **underscore-prefixing** them (`_param`) — **not** deleting them. Removing a
   param changes arity and can break positional call sites; underscore-prefix
   satisfies the linter while preserving the signature (this is what "zero
   behavior change" requires). This is the source of most Tier A effort.

2. **TDD, pinned to current App.tsx output — not the artifact.**
   `tests/pixel-pal.tsx` is gitignored / may be absent and is *not* the source
   of truth. For each helper, write the `.spec.ts` first, pinning the values
   the **current `src/App.tsx`** code produces, then extract. The spec is the
   behavior contract that catches any type-fix that changes output.

3. **`ImageData` fixtures cost real test-authoring time.**
   `extractDominantColors` and `remapImageToPalette` take `ImageData`. Their
   specs must construct small synthetic `ImageData` fixtures (e.g. a 2×2 or
   4×4 buffer) and assert on output. Budget for this on the two "heavy"
   modules — they are not one-line tests.

4. **No orphaned modules.** Each step creates `lib/<name>.ts` +
   `lib/<name>.spec.ts` **and** swaps the App.tsx inline definition for an
   import in the **same commit**. The module never lands without its consumer
   (avoids a false "dead code" review flag — logged process lesson).

5. **`generateRampNew` is external and safe.** App.tsx line 8 already does
   `import { generateRamp as generateRampNew } from './lib/ramp-engine'`.
   Modules that build ramps import `generateRamp` from `ramp-engine` directly.
   ramp-engine/constants do not import back → no cycles.

---

## Module map

Ten modules from lines 63–916. Dependencies are intra-Tier-A unless marked
*(external)*.

| New module | Helpers | Source lines | Depends on |
|---|---|---|---|
| `lib/wcag.ts` | `wcagRelativeLuminance`, `wcagContrast`, `wcagAaTier` | 67–108 | — |
| `lib/randomizer.ts` | `pickRandom`, `buildRandomDescription`, `buildRandomHex` | 881–906 | `constants` (WORD_POOL) *(external)* |
| `lib/panel-state.ts` | `PANEL_STORAGE_KEY`, `PANEL_DEFAULTS`, `loadPanelState` | 908–915 | — |
| `lib/harmony.ts` | `generateHarmony` (incl. its local `tone`) | 849–880 | `color` (hexToHsl, hslToHex) *(external)* |
| `lib/palette-import.ts` | `parsePiskelC`, `parseGpl`, `subsetGplColors` | 672–848 | `color` (hexToHsl) *(external)* |
| `lib/style-presets.ts` | `DEFAULT_STYLE_PRESETS`, `styleToScalars` | 218–232 | — |
| `lib/hardware-quantize.ts` | `quantizeToHardware` | 233–295 | `constants` (HARDWARE_PALETTES), `oklch` *(external)* |
| `lib/image-extract.ts` | `extractDominantColors`, `quantizeToPalette` | 110–209 | `color` (hexToHsl) *(external)* |
| `lib/image-remap.ts` | `remapImageToPalette`, `computeRemapScaleOptions`, `estimateRemapCost` | 296–516 | **`image-extract`** (quantizeToPalette), `ramp-engine` *(external)* |
| `lib/snapshot-ramps.ts` | `buildRampsForSnapshot`, `seededHueDelta` | 517–635, 210–217 | **`style-presets`**, **`hardware-quantize`**, `ramp-engine` *(external)* |

**`panel-state` — move definitions only:** lines 908–915 are the
`PANEL_*` consts + `loadPanelState` definition. Line 916
(`const _panels = loadPanelState()`) is an *invocation* — a consumer — and
**stays in App.tsx** (it gets `loadPanelState` from the new import). Only the
definitions move.

**`seededHueDelta` placement:** its signature (`effectiveSeed, rampIdx →
number`) is seeded hue jitter for ramp generation, *not* Punchy/Balanced/Muted
preset logic. Its only consumers are `buildRampsForSnapshot` (line 617) and the
App-internal ramp adapter (line 1595). It is co-located in
`lib/snapshot-ramps.ts` and exported so both consumers import it from there.

---

## Extraction order (DAG — leaves first)

Step 3 of each helper (swap App.tsx to import) breaks if a module is extracted
before a module it depends on. Order:

**Wave 1 — leaves (no intra-A deps):**
`wcag`, `randomizer`, `panel-state`, `harmony`, `palette-import`,
`style-presets`, `hardware-quantize`, `image-extract`

**Wave 2 — dependents:**
`image-remap` (needs `image-extract`), `snapshot-ramps` (needs
`style-presets`, `hardware-quantize`)

Within a wave, order is free. Each module is a self-contained commit.

---

## Per-module procedure (TDD)

For each module, in dependency order:

1. **Write `tests/unit/<name>.spec.ts` first** (where every existing spec
   lives). Pin current outputs using values produced by the *current*
   `src/App.tsx` code. For `image-extract` / `image-remap`, construct
   synthetic `ImageData` fixtures.
2. **Create typed `lib/<name>.ts`.** Move the helper(s) verbatim in logic;
   add real types; prune unused params; import deps from existing lib modules.
3. **Swap App.tsx** — delete the inline definition, add
   `import { ... } from './lib/<name>'`.
4. **Verify:** `npm run build` (tsc --noEmit + vite) and `npm test` both green.
5. **Commit** module + spec + App.tsx edit together.

---

## Testing

- **Unit:** one `tests/unit/<name>.spec.ts` per module (vitest), behavior
  pinned before extraction. Heavy modules use `ImageData` fixtures.
- **Regression net:** existing e2e suite (`app.spec.ts`, `onboarding.spec.ts`,
  tour specs, `ai-settings.spec.ts`) must stay green — Tier A changes no
  behavior, so any e2e break signals a bad extraction. Run
  `npm run test:e2e` once at the end of Tier A (not per-commit).
- **Build gate:** `npm run build` green after every commit (tsc is the
  type-safety net the god component lacks).

---

## Out of scope (Tier A)

- `PixelSprite` component (→ Tier C).
- Any hook, handler, or JSX change (→ Tier B / C).
- **Consolidating the duplicate WCAG `contrast()` in `tests/test_contrast.js`**
  (line 122) with the new `lib/wcag.ts`. Logged as a follow-up; that test file
  is a tracked exception and consolidating it is a separate, optional change.

---

## Success criteria

- 10 new `lib/*.ts` modules, each typed (no `@ts-nocheck`) and with a passing
  `.spec.ts`.
- App.tsx reduced by ~850 lines (~8039 → ~7,200), inline helper definitions
  replaced by imports.
- `npm run build`, `npm test`, `npm run test:e2e` all green.
- No behavior change observable in the app.

---

## Follow-ups (not this spec)

- Tier B spec: domain custom-hooks + the state-architecture decision.
- Tier C spec: JSX → per-panel components (depends on B's architecture).
- Optional: fold `tests/test_contrast.js`'s local `contrast()` onto
  `lib/wcag.ts`.
