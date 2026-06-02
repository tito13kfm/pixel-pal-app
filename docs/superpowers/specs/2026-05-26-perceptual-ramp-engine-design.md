# Perceptual Ramp Engine — Design Spec

**Status:** Draft — revised after 3 advisor passes, pending user sign-off
**Date:** 2026-05-26
**Target release:** v0.6.0
**Author:** Tim Kurash + Claude (collaborative brainstorm)

## Summary

Replace the HSV-based ramp generator with a perceptual (OKLCH) engine. Punchy / Balanced / Muted style buttons stay; their constants are retuned in OKLCH space. Beginners see the same UI. Pros get a per-ramp `▸ Advanced` disclosure exposing curve preset and gamut strategy.

This is the first of three planned "deepen pro tools" subsystems. The other two — smarter image remap and constraint solver / auto-fix — are scheduled to follow in their own spec/plan/impl cycles and will reuse the perceptual distance and color-space utilities built here.

## Goals

- Produce visibly better-shaded ramps out of the box, with no UI learning curve for existing users.
- Expose perceptual depth (curve shape, gamut handling) for pros, behind a closed-by-default disclosure.
- Decouple ramp generation from React state — pure functions, testable.
- Reduce `App.tsx` size by extracting ramp logic.
- Preserve every existing feature: Harmonize, Hardware Lock, pins, hidden shades, AI Assist, GPL import, classic palettes, image extraction.

## Non-goals

- No perceptual Harmonize. (Harmonize stays HSL hue rotation. Possible follow-up spec.)
- No bezier curve editor. (Preset picker only.)
- No visual snapshot tests. (Numeric assertions only.)
- No web demo / cloud / sharing. (Separate strategic direction.)

## Architecture

```
src/lib/
├── color.ts          (existing — keep hex/rgb/hsv utilities used elsewhere)
├── oklch.ts          (NEW — sRGB ↔ OKLab ↔ OKLCH, gamut mapping, ΔE_OK)
├── ramp-engine.ts    (NEW — generateRamp(baseHex, opts) → Shade[])
└── palette.ts        (extend — engineVersion + curve/gamut/advancedOpen fields)
```

### `lib/oklch.ts`

Pure functions, no React, no globals.

```ts
export type Oklch = { L: number; C: number; H: number };  // L 0..1, C 0..0.4ish, H 0..360
export type GamutStrategy = 'auto' | 'clip' | 'chroma-preserve';

export function hexToOklch(hex: string): Oklch | null;
export function oklchToHex(c: Oklch): string;
export function gamutMap(c: Oklch, strategy: GamutStrategy): Oklch;
export function deltaEOK(a: Oklch, b: Oklch): number;
```

Conversion math follows the CSS Color Level 4 spec / Björn Ottosson's OKLab paper.

### `lib/ramp-engine.ts`

```ts
export type CurvePreset = 'linear' | 'eased' | 's-curve' | 'ease-in' | 'ease-out';
export type Style = 'punchy' | 'balanced' | 'muted';

export interface GenerateRampOpts {
  style: Style;
  size: number;                       // 4..8 today
  hueShiftStrength: number;           // 0..1
  satMultiplier?: number;             // per-ramp slider override
  curve?: CurvePreset;                // default 'eased'
  gamut?: GamutStrategy;              // default 'auto'
  pins?: Record<number, string>;      // slotIdx → hex
  hidden?: number[];                  // slot indices to drop
  hardwareLock?: string | null;       // e.g. 'nes', 'gb', null
}

export interface Shade {
  hex: string;
  oklch: Oklch;                       // diagnostic info, used by viz/polar plot
  pinned: boolean;
  gamutClipped: boolean;              // true if gamutMap had to reduce chroma
}

export function generateRamp(baseHex: string, opts: GenerateRampOpts): Shade[];
```

### Style constants (initial values, tune in implementation)

| Style    | L* range        | C* multiplier | Default curve |
|----------|-----------------|---------------|---------------|
| Punchy   | 0.18 — 0.92     | 1.00          | `linear`      |
| Balanced | 0.25 — 0.85     | 0.80          | `eased`       |
| Muted    | 0.32 — 0.78     | 0.55          | `eased`       |

L* range is clamped to `[0.04, 0.96]` to keep endpoints visible for black/white bases.

Per-style default curves: Punchy stays linear so endpoint contrast doesn't get softened by an S-curve — matches the name. Balanced and Muted lean on `eased` for smoother midtone resolution. User can override per ramp via Advanced.

### Curve presets (sampling along L*)

- `linear` — uniform spacing.
- `eased` (default) — slight S-curve flattened, more midtone resolution.
- `s-curve` — pronounced S, more contrast at endpoints.
- `ease-in` — denser shadows.
- `ease-out` — denser highlights.

### Hue-shift application

Per-slot delta around base hue. Shadow slots (below midpoint) shift toward cool (−H), highlight slots shift toward warm (+H). Magnitude scales by slot distance from midpoint × `hueShiftStrength`. If base chroma `< 0.01`, skip hue shift entirely (grey-base ramps stay greyscale).

### Gamut handling

After per-slot OKLCH derivation, every shade passes through `gamutMap(c, strategy)`:

- `auto` (default): binary-search chroma toward 0 while keeping L*, H. Stop when in sRGB or chroma reaches 0.
- `clip`: convert with naïve clamp on linear RGB. Fast, can shift hue, mostly there for parity.
- `chroma-preserve`: nudge L* up/down until current C* fits. L* travel capped at `0.06` to prevent endpoint collision.

### Per-ramp H/S/V sliders — interaction model

The existing per-ramp H/S/V sliders and saturation multiplier stay with their current labels and current semantics: they adjust the **base color** in HSL space. The engine then derives perceptual shades from the adjusted base. This keeps user mental model intact ("I'm shifting the base hue") and avoids double-correction (engine never sees both an HSL delta and an OKLCH delta on the same axis).

Internally:
```
adjustedBase = applyHsvAdjustments(rawBase, hSliderDelta, sSliderDelta, vSliderDelta, satMultiplier)
shades = generateRamp(adjustedBase, opts)
```

No relabeling. No OKLCH-axis sliders in this spec. (Future spec could add LCH sliders inside Advanced.)

### Hardware Lock integration

Hardware Lock runs **after** engine output.

- For palettes with `engineVersion: 'oklch-v1'`: nearest legal hex chosen by `deltaEOK` (perceptual distance) — small quality bump.
- For palettes with `engineVersion: 'hsv-legacy'` (loaded but not yet migrated): keep current RGB-Euclidean snap to preserve the look the user expects on first reload. ΔE_OK kicks in only after the user clicks `Keep new look` or `Restore old look` (both promote the palette to `oklch-v1`).

### Pin and hidden integration

- Pins applied after engine, before Hardware Lock.
- Hidden slot indices dropped from final array.

## Upstream input isolation guarantee

Everything that produces `baseColors[]` is untouched. Each feeds the new engine through the same `baseColors[]` boundary:

- **Harmonize** — operates on `baseColors[]` via HSL hue rotation. `HARMONIZE_MODE_SLOTS`, `harmonyAnchor`, `harmonizeBaseline`, `restoreHarmonizeBaseline` unchanged.
- **AI Assist** — produces `baseColors[]` from prompt or surprise-me. Passthrough.
- **Image extraction** (drag/drop/paste + eyedropper) — produces `baseColors[]`. Passthrough.
- **GIMP .gpl import** — produces `baseColors[]`. Passthrough.
- **Classic palettes** (DawnBringer, PICO-8, etc.) — produce `baseColors[]`. Passthrough.
- **Random / pick / type hex** — produce `baseColors[]`. Passthrough.

All take effect at the base-color boundary. The new engine receives whatever bases these features emit and renders shades.

## UI changes

### Per-ramp Advanced disclosure (closed by default)

```
RAMP 1 — ORANGE                              size 6 • locked? no
[shade strip — 6 swatches]
[Punchy] [Balanced] [Muted]
H ▮▮▮▯▯▯▯  S ▮▮▮▮▮▯▯  V ▮▮▮▮▯▯▯
- - - - - - - - - - - - - - - - - - - - - - -
▸ Advanced
```

Expanded:

```
▾ Advanced
  Curve preset    [ Eased ▾ ]
  Gamut strategy  [ Auto ▾ ]
  (hint text)
```

- Open/closed state persists per ramp in saved payload (`advancedOpen[slot]`).
- Defaults: curve = `eased`, gamut = `auto`. Out-of-box ramps look good with Advanced closed.

### Migration banner (legacy palettes only)

On loading a saved palette without `engineVersion`:

```
[!] This palette was made with the old engine. New ramps will look different.
    [Keep new look]  [Restore old look]
```

**Trigger behavior:**

- Banner appears on **every** load of a `hsv-legacy` palette until the user clicks `Keep new look` or `Restore old look`.
- No dismiss / close button. The two action buttons are the only way to clear the banner. Reason: the user must make a deliberate choice; silent dismissal would leave the palette permanently in an ambiguous "legacy schema but new look" state.
- Until either button is clicked: the palette is rendered with the **new engine** (cosmetic preview) but its stored `engineVersion` stays missing/`hsv-legacy`. Reload → banner returns.
- Undo / redo cannot promote a palette to `oklch-v1`. Only an explicit Keep/Restore click can.
- History snapshots inherit the source palette's `engineVersion` at the moment of capture.
- **Retroactive re-tag on Keep/Restore:** When the user clicks `Keep new look` or `Restore old look`, every existing in-memory undo/redo snapshot for THIS palette session is re-tagged `oklch-v1` (and, for Restore, given the same frozen `overrides` and `restoreFrozen` marker). Reason: the user made an explicit per-palette engine choice; allowing an Undo to silently revert that choice (and pop the banner back up on the next save/load) would be confusing. Only saved-to-disk payloads need a version flag for re-load behavior; in-memory history follows the user's most recent explicit decision.
- If the user navigates away (loads a different palette) without clicking, banner state for the un-acknowledged palette resets — next load shows banner again.

- `Keep new look` → save with `engineVersion: 'oklch-v1'`, banner gone. Hardware Lock (if active) re-runs with `deltaEOK` — shades may shift slightly.
- `Restore old look` → run legacy HSV renderer **three times per ramp** (once per style: Punchy, Balanced, Muted), freeze every resulting shade into the matching style slot of `overrides[rampSlot][shadeSlot] = { punchy, balanced, muted }`. Then save with `engineVersion: 'oklch-v1'`. Consequence: those ramps become **fully pinned across all three styles** — they will not respond to slider changes for shade derivation (slider changes still alter the base color, but pinned shades override engine output). User gets a one-line confirmation dialog before this commits.

**Restore + per-ramp size interaction:** When `restoreFrozen[rampSlot] === true`, the per-ramp size slider for THAT ramp is **disabled** with a tooltip: `"Size locked while old-engine shades are pinned. Clear pins to unlock."` Rationale: extending size beyond N would mix frozen-legacy slots with new-engine slots in the same ramp — a confusing visual mismatch. User unlocks by removing any override on that ramp (which also clears `restoreFrozen[rampSlot]`). The lock is per-ramp, not global; non-restored ramps keep their size slider. Manual user pins, even covering all slots, do NOT trigger this lock — only Restore freezes do.

Hardware Lock at migration time:
- `Keep new look` re-snaps shades using `deltaEOK`. Looks similar but not bit-identical to pre-migration.
- `Restore old look` runs legacy RGB-Euclidean snap inside the freeze step so the pinned hexes match exactly what the user had before.

## Data flow

```
User action  →  baseColors[] state  →  ramp-engine.generateRamp(base, opts)
                                            │
                                            1. hexToOklch
                                            2. style preset (L* range, C* mult)
                                            3. curve sampling
                                            4. hue shift
                                            5. gamut map
                                            6. oklchToHex
                                            7. pins + hidden + hardware lock
                                            ▼
                                       Shade[] → swatches, sprite preview,
                                                 image remap, GPL export
```

Engine is pure. No global state, no React. Component calls it inside `useMemo` keyed on its inputs.

## Persistence

### Extend `SavedPalettePayload`

```ts
engineVersion?: 'hsv-legacy' | 'oklch-v1';   // omitted = hsv-legacy
curvePerRamp?: Record<string, CurvePreset>;
gamutPerRamp?: Record<string, GamutStrategy>;
advancedOpen?: Record<string, boolean>;
restoreFrozen?: Record<string, true>;        // ramp slugs whose overrides were written by Restore old look
```

`restoreFrozen` is the explicit marker that disambiguates a Restore-driven full pin from a user's manual full pin. Set only by the `Restore old look` action; cleared when the user removes any override from that ramp via the unpin UI. The per-ramp size-slider lock fires when AND ONLY when `restoreFrozen[rampSlot] === true`. Manual full-pinning every shade in a ramp does NOT lock its size slider.

All four fields are optional. New saves write `engineVersion: 'oklch-v1'`. The three records are lazy-written (only stored when the user changes a value).

### Session history (undo/redo)

Each history snapshot already stores `baseColors[]` and recipe params. Re-derive shades through the new engine on undo. No legacy-vs-new banner for history steps — banner only fires on `palettes:{slug}` load.

## Edge cases

| Case | Behavior |
|------|----------|
| Saturated base + Punchy → out-of-gamut highlight | `auto` reduces chroma, L* preserved |
| Achromatic base (`#808080`) | Hue shift skipped, returns grey ramp |
| `#000` / `#fff` base | L* range clamped to keep endpoints visible |
| Invalid hex base | Engine returns N copies of input, logs once |
| Hue-shifted slot worse than un-shifted | Fall back to un-shifted for that slot |
| Hardware Lock NES | Snap by `deltaEOK`, perceptually nearest |
| Pinned shade outside perceptual sweep | Honored as-is, marked `pinned: true` |

No exceptions thrown from engine. All paths deterministic.

## Performance

Engine call cost: 2 matrix multiplies + 1 binary-search gamut probe (≤12 iterations) per shade. For 6 ramps × 8 shades × 60fps slider drag ≈ 3000 evals/sec. Well within budget. Profile in implementation phase to confirm.

## Testing strategy

### `tests/oklch.spec.ts` (Vitest)
- Round-trip `hexToOklch → oklchToHex` for 100 random hexes, ΔE_OK ≤ 0.5.
- 10 fixed reference values vs CSS Color 4 spec table.
- `gamutMap('auto')`: out-of-gamut input → in `[0,1]^3`, L* preserved within 0.5%.
- `gamutMap('clip')`: matches naïve clamp for in-gamut input.
- C=0 input: hue param ignored.

### `tests/ramp-engine.spec.ts`
- Pure function: same opts → same output (snapshot).
- Returns exactly `size` shades.
- Style L* ranges hit expected bounds.
- Curve `linear` → linearly spaced L* values.
- Hue shift > 0 → shadow H sign consistent.
- Pin: shade at pinned index equals pinned hex.
- Hidden: array length = `size − hidden.length`.
- Hardware Lock NES: every hex ∈ NES palette set.
- Invalid hex: returns N copies, no throw.
- **Slider monotonicity:** for each of 5 reference bases (`#3a5fc4`, `#c45c3a`, `#00b3b3`, `#7a3a8e`, `#808080`), S-slider sweep {0,25,50,75,100} → mean shade chroma is non-decreasing.

### `tests/migration.spec.ts`
- Legacy payload (no `engineVersion`) → loader marks `hsv-legacy`, banner state set.
- Keep new look → resaves `oklch-v1`, no overrides added.
- Restore old look → resaves `oklch-v1`, `overrides` populated with frozen hexes.

### `tests/e2e/` (Playwright smoke)
- Generate → ramps render, no console errors.
- Open Advanced, change curve to S-curve → shades update.
- Save, reload → identical shades.
- Load legacy fixture → banner appears.
- Harmonize triadic → 3 base hues rotate, shades regenerate via new engine.
- Hardware Lock NES → all shades snap to NES hexes.

### Existing tests
- WCAG theme-token contrast lint stays green (engine swap should not affect tokens).

## Out of scope (explicit YAGNI)

- Visual pixel-snapshot tests.
- Cross-browser engine differences (no engine-specific code).
- Perceptual Harmonize.
- Bezier curve editor.
- "Restore old look" availability past v0.6 — legacy renderer is one-shot per palette; full removal of the legacy HSV code planned for v0.7.

## Implementation sequencing (preview for plan phase)

1. Add `oklch.ts` with conversions + gamut + ΔE_OK. Land alone with unit tests.
2. Add `ramp-engine.ts` with `generateRamp`, no UI wiring yet. Unit tests.
3. Extend `SavedPalettePayload` schema, add migration logic + banner UI.
4. Replace HSV ramp code path in `App.tsx` with `generateRamp` call. Remove dead HSV ramp code, keep `_legacyHsvRamp` accessible for Restore old look.
5. Wire per-ramp `▸ Advanced` disclosure, curve preset dropdown, gamut strategy dropdown.
6. Update Hardware Lock nearest-color search to use `deltaEOK`.
7. Add Playwright smoke flows.
8. Manual QA against existing saved palette fixtures.

## Open questions for plan phase

- Exact L*/C* constants per style — initial table above is a starting point; tune by visual inspection on a fixture set of bases.
- Should `Restore old look` show a "this freezes the palette" confirmation? (Lean: yes, one-line warning.)
- Should the legacy renderer also be available via a hidden debug command for QA? (Lean: yes, dev-only.)

## Acceptance criteria

Behavior:

- All existing tests pass.
- New unit + migration tests pass.
- Playwright smoke flows pass.
- Generate a fresh palette from `#c45c3a` (warm orange): highlight shade L* > 0.85, shadow shade L* < 0.20, all shades `gamutClipped === false`, no console errors.
- Generate from `#00b3b3` (saturated cyan) under Punchy: zero shades report `gamutClipped === true` (`auto` strategy keeps every shade in sRGB), highlight L* > 0.85.
- Generate from `#0d1b4a` (deep navy): shadow shade L* equals the clamp floor exactly (no NaN, no undefined), and the 6 returned hexes are mutually distinct.
- Generate from `#808080` (achromatic): all shades have chroma < 0.02, hues either undefined or stable across slots (no artifacts).
- **Slider monotonicity:** for each of `#3a5fc4`, `#c45c3a`, `#00b3b3`, `#7a3a8e`, `#808080`, setting the S slider to +0, +25, +50, +75, +100 yields ramps whose mean shade chroma is monotonically non-decreasing. Catches HSL→OKLCH non-monotonic edge cases on the slider path.
- Load a legacy fixture palette: banner shown, `Keep new look` and `Restore old look` both behave as specified. After `Restore old look`, all three styles render identical hexes to the pre-migration capture.
- Harmonize triadic on a 3-ramp palette: 3 distinct hues, each renders without errors.
- Hardware Lock NES: all 8 shades of a Punchy ramp from `#c45c3a` snap to legal NES hexes.

Non-binding goals (track but do not block release):

- `App.tsx` ramp-generation code extracted into `lib/ramp-engine.ts`. (LOC reduction is a side-effect, not a target.)
- Engine perf: full 6-ramp × 8-shade regeneration under 5ms on dev machine.
