# Mood preset envelopes + one-click palette generator (#135 + backlog F)

**Date:** 2026-07-15
**Issue:** #135, Curated (non-AI) genre/mood preset envelopes to bias
generation and harmony
**Backlog:** item F, one-click "generate a palette" (harmonious, non-AI).
The issue explicitly sequences with F; both ship together in this spec.
**Approach:** two new pure lib modules (`mood.ts`, `palette-generator.ts`) +
a hand-authored `MOOD_PRESETS` table in `constants.ts`, wired into a new
generator button row in the Input panel and a mood clamp inside the existing
`harmonize()` handler. Zero AI involvement: deterministic math over
hand-tuned data, same spirit as `HARDWARE_PALETTES`.

---

## Problem

The app has single-hex input, a random-hex roll, and harmony derivation
(rotations around one anchor), but no **instant multi-base** generator: no
press-once → "a cohesive set of bases (not rotations of one), each ramped."
Since AI Assist was removed (0.22.0), there is no quick-fill path at all.
Independently, there is nothing between "raw harmony rotation" (no vibe
awareness) and "fully random roll" (no vibe control): no way to say "keep
everything cozy/cyberpunk/gothic" while generating or harmonizing.

## Resolved open questions

From backlog F:

1. **How many bases by default?** 5. Typical pixel-art working palettes run
   4-6 bases; 5 leaves room to delete or add one. No count selector in v1
   (follow-up), keeping the press-once promise.
2. **Does "random" bias toward pleasing ranges or full gamut?** Biased.
   Default envelope: OKLCH L ∈ [0.40, 0.78], C ∈ [0.07, 0.17], full hue
   wheel. Full-gamut rolls routinely produce near-black/near-white sludge;
   the existing `buildRandomHex` already biases (HSL S 55-95, L 35-60) for
   the same reason.
3. **Button placement?** A new row in the Input panel's Single Color tab,
   directly under the hex-input row: `[Mood ▾] [Surprise Me] [Around this]`.
   The mood dropdown sits immediately left of the buttons it biases.

From #135:

4. **Preset list + envelopes?** Six presets, envelopes in **OKLCH** (not
   HSL: reuses `gamutMap`/ΔE_OK machinery and matches the ramp engine).
   Values in the table below; each is hand-tuned data in `constants.ts`,
   sibling to `HARDWARE_PALETTES`.
5. **Compose with Hardware Lock or mutually exclusive?** **Compose.** They
   act at different pipeline stages: mood constrains *base-color
   generation/derivation* (input side); Hardware Lock quantizes *rendered
   shades* (output side, in `buildRamp`). Both active = "cozy palette on NES
   hardware", a perfectly meaningful request. No interaction code needed.
6. **Fixed table or user-definable?** Fixed built-in table. Custom presets
   deferred (follow-up).

Additional decisions:

- **Mood is session-level state** (like `hardwareLock`): persisted as
  `ui:moodPreset` via the standard load-on-mount + mountRef-guarded persist
  pattern. It is deliberately **NOT** in the undo snapshot and **NOT** in the
  saved-palette payload: it does not change any currently rendered output,
  it only biases *future* Generate/Harmonize actions. (`hardwareLock` is
  snapshotted because it changes rendered shades; mood does not.) It is
  therefore also NOT added to `resetPaletteState` (invariant 1 covers
  base-keyed/per-palette state only).
- **Grays pass through.** `applyMoodToHex` leaves inputs with C < 0.01
  chroma/hue-untouched (only lightness clamps). Forcing a gray up to a mood's
  chroma floor would colorize outlines/blacks via the meaningless H=0 of
  achromatic colors.
- **A seeded generation keeps the seed verbatim** at index 0 (never
  mood-clamped), per F: "single-color seed *locks* one base and derives the
  rest around it." The user's pick wins; mood shapes the companions.
- **Harmonize applies mood *after* the hue rotation**, per non-anchor target:
  rotate in HSL exactly as today, then clamp the result into the envelope
  with `applyMoodToHex`. The anchor is untouched (as today).
- **The dice roll (`buildRandomHex`) is NOT mood-biased** in v1 (out of
  #135's stated scope of generation + harmony; a follow-up).

## The preset table (the color-design core)

OKLCH: L 0-1, C 0-~0.32 (sRGB ceiling varies by hue; `gamutMap('auto')`
handles overshoot), H degrees. `hueArcs` = allowed arcs `[start, end]`,
start > end wraps through 360.

| id            | name              | hueArcs               | C            | L            | intent |
|---------------|-------------------|-----------------------|--------------|--------------|--------|
| `cozy-farm`   | Cozy Farm         | [30, 150]             | 0.04-0.12    | 0.45-0.82    | sunlit hay/leaf/soil warmth, soft sat |
| `cyberpunk`   | Cyberpunk Neon    | [190, 350]            | 0.10-0.32    | 0.30-0.80    | cyan→blue→purple→magenta, chroma pushed to the gamut edge |
| `gothic-horror` | Gothic Horror   | [240, 320], [15, 40]  | 0.02-0.08    | 0.12-0.50    | cold desaturated darks + a blood-red arc |
| `desert`      | Sun-Bleached Desert | [40, 95]            | 0.03-0.11    | 0.55-0.90    | sand/terracotta, washed-out highs |
| `deep-ocean`  | Deep Ocean        | [180, 270]            | 0.05-0.16    | 0.20-0.65    | teal→indigo depth column |
| `candy-pop`   | Candy Pop         | [0, 360]              | 0.10-0.22    | 0.62-0.88    | any hue, bright + sweet |

(OKLCH hue anchors for orientation: red ≈ 25°, orange ≈ 55°, yellow ≈ 100°,
green ≈ 140°, cyan ≈ 195°, blue ≈ 264°, purple ≈ 300°, magenta ≈ 330°.)

## Generator algorithm (`generatePalette`)

Pure function, injectable RNG for testability:

```ts
generatePalette({ count = 5, seedHex = null, mood = null, rng = Math.random }): string[]
```

1. Envelope = mood ?? the default envelope above. Hue arcs are walked as one
   concatenated "virtual" interval of total length Σ arc lengths, so
   multi-arc moods sample evenly across their allowed hue measure.
2. Anchor hue: from `seedHex`'s OKLCH H when given and chromatic (C ≥ 0.02),
   clamped into the arcs; otherwise uniform random in the virtual interval.
3. Hues: golden-angle walk (137.508°, scaled to the virtual interval length)
   from the anchor + small jitter. Golden-angle spacing stays well-distributed
   for any N and never collapses into near-duplicates the way independent
   uniform draws do. This is the "picking base colors that generally work
   together" mechanism, curated-offset-free.
4. Lightness: stratified across the envelope's L range (one stratum per
   base, shuffled order, jitter within stratum) so bases separate tonally.
   Chroma: uniform within range.
5. Each OKLCH candidate → `gamutMap('auto')` → hex.
6. Perceptual spacing repair: any base closer than ΔE_OK 0.09 to an
   already-accepted one is resampled (up to 8 attempts, keeping the
   best-separated candidate). Best-effort by design: a tight mood envelope
   at high N cannot always reach the target, and that's fine.
7. Seeded path: `result[0] = seedHex` verbatim; companions derive around it.

## What already exists (verified 2026-07-15)

- `src/lib/oklch.ts`: `hexToOklch`, `oklchToHex`, `gamutMap`, `deltaEOK`:
  everything the mood clamp and spacing check need.
- `src/App.tsx` `harmonize()` (~line 1488): the exact insertion point is the
  `newBaseColors[i] = hslToHex(...)` line inside the targets loop.
- Full-palette-replace contract: `resetPaletteState()` + direct
  `setShuffleSeed(s => s + 1)` (NOT `bumpShuffleSeed`) + `tagNextLabel`
  (ARCHITECTURE.md rules 1-2). The new handlers are replace paths #8/#9.
- `ui:rampSize` persistence pattern in App.tsx (~line 1693), copied verbatim
  for `ui:moodPreset`.
- `InputPanel.tsx` single-color row + `HarmonyPanel.tsx` harmonize controls
  column: both props-only panels with existing specs/conventions.

## Files

- **NEW** `src/lib/mood.ts`: `MoodPreset`/`MoodEnvelope` types,
  `arcLength`, `hueInArc`, `clampHueToArcs`, `applyMoodToHex`.
- **NEW** `src/lib/palette-generator.ts`: `generatePalette` + virtual-arc
  hue sampling helpers + `DEFAULT_GENERATOR_ENVELOPE`.
- `src/lib/constants.ts`: `MOOD_PRESETS` table (type-only import from
  `./mood`; no cycle: `mood.ts` imports only from `oklch.ts`).
- `src/App.tsx`: `moodPreset` state + `activeMood` memo + `ui:moodPreset`
  persistence + `surpriseMe`/`buildAroundColor` handlers + mood clamp in
  `harmonize` + new props to both panels.
- `src/components/panels/InputPanel.tsx`: generator row (mood select +
  Surprise Me + Around this) in Single Color mode.
- `src/components/panels/HarmonyPanel.tsx`: sibling mood select in the
  harmonize controls (same bound state), status line mentions the active
  mood.
- **NEW** `tests/unit/mood.spec.ts`, `tests/unit/palette-generator.spec.ts`;
  additions to `tests/unit/HarmonyPanel.spec.tsx`.
- Docs: `docs/ARCHITECTURE.md` file map, FEATURE-BACKLOG.md F resolution
  note, `CHANGELOG.md` Unreleased.

## Test plan

- `mood.spec.ts`: hue-arc math (inside/outside/wrap-around/nearest-edge);
  `applyMoodToHex` clamps out-of-envelope colors in, leaves in-envelope
  colors byte-stable, leaves grays' hue/chroma alone, tolerates invalid hex;
  `MOOD_PRESETS` structural validation (unique ids, ordered ranges, arcs in
  [0, 360], 4-6 entries).
- `palette-generator.spec.ts` (seeded mulberry32 RNG, no `Math.random` in
  assertions): shape (N valid lowercase hexes, default 5); determinism (same
  seed → same output); seeded path keeps `seedHex` verbatim at [0]; pairwise
  ΔE_OK separation ≥ 0.05 across many seeds (default envelope); mood runs
  land inside the envelope (H in arcs, L in range with small epsilon, C ≤
  max + epsilon; the C floor is best-effort because `gamutMap` only ever
  *reduces* chroma).
- `HarmonyPanel.spec.tsx`: mood select renders with the preset names, change
  event calls `setMoodPreset` (null for the empty option).
- No new `InputPanel` spec in v1 (the panel has no spec today and needs a
  ~54-prop fixture; the behavior is covered at the lib layer). Follow-up.
- jsdom-safe throughout: everything under test is pure math or DOM text.

## Versioning

Substantial user-facing feature (a whole generation subsystem + mood layer)
→ propose **MINOR** per CLAUDE.md pre-1.0 rules. Do NOT run `npm version` or
tag; CHANGELOG entries stay under `[Unreleased]` until the user OKs a
release.

## Follow-ups (out of scope)

- Base-count selector (3-8) next to Surprise Me.
- Mood-biasing the dice roll (`buildRandomHex`) and image-extract quantize.
- User-definable/savable mood presets.
- Mood-aware sprite preview ordering / mood chips in saved palettes.
