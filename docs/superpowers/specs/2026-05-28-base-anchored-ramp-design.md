# Base-Anchored Ramp Engine + Editable Styles

Date: 2026-05-28
Status: Design approved, pending spec review

## Problem

The current perceptual ramp engine (`src/lib/ramp-engine.ts`) throws away the
picked base color's lightness. Each slot's L comes from a fixed per-style band
(`lMin`/`lMax`), and chroma is flattened by a per-style multiplier (`cMult`).
Consequences:

- The base swatch you picked is never actually in the ramp. Its hue and chroma
  survive; its lightness does not.
- Switching Punchy/Balanced/Muted changes the base swatch (different lMin/lMax
  band + different cMult), so the "anchor" color drifts with style.
- Shuffle rotates the base hue ±8° in HSL before generation, drifting the base
  color on every reshuffle (the original trigger for this redesign).

## Goal

The picked base color is sacred: byte-for-byte identical across all three
styles and unaffected by shuffle. Style controls only how the darker and
lighter shades radiate out from that fixed base. Additionally, the three styles
become editable presets over two intuitive parameters.

## Locked decisions

1. **Base is byte-for-byte identical across styles.** The base slot is hard-set
   to the exact input hex string. No round-trip through OKLCH, no curve, no
   falloff, no gamut map on that slot.
2. **Lightness-positioned distribution.** Shades distribute by lightness around
   the base; the base index is clamped to `[1, N-2]` so there is always at least
   one darker and one lighter shade.
3. **Style = reach + chroma falloff.** Two scalars fully define a style:
   `reach` (how far the darkest/lightest shades push from base) and
   `chromaFalloff` (how fast shades desaturate toward the ends). Base untouched.
4. **Single engine, no migration.** Old saved palettes re-render under the new
   engine (they store recipes, not resolved hexes). No migration shim. Precedent:
   v0.6 already changed how old HSV palettes render (`App.tsx` comment ~4048).
5. **Editable presets, persisted per-palette.** Punchy/Balanced/Muted are
   editable starting points. Each palette carries its own `{reach, falloff}` per
   style; absent = approved defaults. Reset-to-default available. No new style row
   (the three-row simultaneous display is preserved).

## Engine model (`src/lib/ramp-engine.ts`)

Work entirely in OKLCH. Let `base = hexToOklch(baseHex)` give `{L, C, H}`.

### 1. Reach to lightness caps

`reach ∈ [0,1]`. Wider reach = darker floor and lighter ceiling.

```
darkCap  = lerp(0.34, 0.10, reach)   // reach 0 → 0.34, reach 1 → 0.10
lightCap = lerp(0.76, 0.96, reach)
```

Clamp both into `[L_FLOOR, L_CEIL]` = `[0.04, 0.96]`.

### 2. Base position and span

```
δ          = 0.05                                 // min step so base is distinct
darkBottom = clamp(min(darkCap,  base.L - δ), L_FLOOR, base.L)
lightTop   = clamp(max(lightCap, base.L + δ), base.L, L_CEIL)
frac       = (base.L - darkBottom) / (lightTop - darkBottom)
baseIndex  = clamp(round(frac * (N - 1)), 1, N - 2)
```

`min`/`max` against `base.L ∓ δ` handle extreme bases: a near-white base still
gets a lighter shade squeezed into the sliver above it; a near-black base still
gets a darker one. The `[1, N-2]` clamp guarantees ≥1 shade each side.

### 3. Per-slot lightness (curve applied per side)

For slot `i`:

- `i == baseIndex`: `L = base.L` exactly (slot is hard-set to baseHex; see step 6).
- `i < baseIndex` (dark side): `t = i / baseIndex`,
  `L = darkBottom + (base.L - darkBottom) * evalCurve(lightnessCurve, t)`
- `i > baseIndex` (light side): `t = (i - baseIndex) / (N - 1 - baseIndex)`,
  `L = base.L + (lightTop - base.L) * evalCurve(lightnessCurve, t)`

`lightnessCurve` is the existing per-ramp curve (default `eased`). Monotonic
presets keep the whole ramp monotonically increasing in L. The per-style
`defaultLightnessCurve` coupling is removed; distribution shaping is now solely
the user's lightness curve.

### 4. Per-slot chroma (falloff from base)

`chromaFalloff ∈ [0,1]`.

```
chromaFloorFrac = lerp(0.92, 0.12, chromaFalloff)  // fraction of base.C kept at the far end
falloffExp      = lerp(1.0, 2.2, chromaFalloff)     // higher = grays out faster near base
maxArm          = max(baseIndex, N - 1 - baseIndex)
distFromBase(i) = |i - baseIndex| / maxArm          // 0 at base, 1 at farthest end
chromaMult(i)   = 1 - (1 - chromaFloorFrac) * distFromBase(i) ^ falloffExp
C(i)            = base.C * satMultiplier * chromaMult(i) * evalCurve(satCurve, tGlobal, 0, 2)
```

`tGlobal = i / (N-1)`, matching the existing `satCurve` domain. The user's
`satCurve` (bell/dip/rise) composes multiplicatively on top of the style's
symmetric falloff. The old flat `cMult` is gone.

### 5. Per-slot hue (measured from base, jitter is distance-proportional)

```
if (base.C < 0.01) H = base.H                      // achromatic base: no shift
else {
  signedDist = (i - baseIndex) / maxArm            // negative on dark side
  H = base.H + signedDist * 15 * hueShiftStrength + signedDist * hueJitter
}
```

`hueJitter` replaces the old base pre-jitter. Because it scales with distance
from base, the base hue stays exact (`signedDist = 0`) and shuffle varies the
hue fan of the surrounding shades instead of moving the base. Shuffle now
produces base-stable variation, which is the entire point of the redesign.

### 6. Base slot hard-set, gamut, pins, hidden, order

- Slot `baseIndex`: `{ hex: baseHex, oklch: base, pinned: false, gamutClipped: false }`.
  This is the byte-for-byte guarantee; it bypasses curve, falloff, hue shift,
  and gamut map.
- Every other slot: build `ideal = {L, C, H}`, `gamutMap(ideal, gamut)`, set hex.
- `pins[i]` overrides any slot by index (including `baseIndex` if the user
  explicitly pins it — explicit user action overrides the anchor).
- `hidden` indices filtered out last.
- Output is naturally ordered dark→light by construction; no sort step.

### Engine signature

```ts
export interface GenerateRampOpts {
  reach: number;          // 0..1  (was: style band)
  chromaFalloff: number;  // 0..1  (was: cMult)
  size: number;
  hueShiftStrength: number;
  hueJitter?: number;     // NEW: per-ramp hue offset, default 0
  satMultiplier?: number;
  lightnessCurve?: CurvePoints;
  satCurve?: CurvePoints;
  gamut?: GamutStrategy;
  pins?: Record<number, string>;
  hidden?: number[];
  hardwareLock?: string | null;
}
```

`style: Style` is removed from the engine. The caller resolves a style name to
`{reach, chromaFalloff}` and passes the scalars.

### Approved default presets

```
punchy:   reach 1.00, chromaFalloff 0.10   // L ~0.10→0.96, ends ~84% chroma
balanced: reach 0.55, chromaFalloff 0.45   // L ~0.21→0.87, ends ~56% chroma
muted:    reach 0.15, chromaFalloff 0.85   // L ~0.30→0.79, ends ~24% chroma
```

These reproduce the approved visual (style-feel-v2). Treat the lerp endpoints in
steps 1 and 4 as tuning constants: calibrate so muted neighbors read ~60% chroma
and ends ~16-24% while the base stays full chroma.

## App integration (`src/App.tsx`)

### Style-to-scalars + jitter (the `generateRamp` adapter, ~line 1568)

Replace the HSL pre-jitter block with a `hueJitter` scalar, and resolve the
style name + per-palette editable presets to `{reach, chromaFalloff}`:

```ts
const preset = stylePresets[style];          // editable, per-palette state (see below)
let hueJitter = 0;
if (rampIdx !== undefined) {
  const effectiveSeed = shuffleSeed + (rampShuffleOffsets[rampIdx] || 0);
  if (effectiveSeed !== 0) hueJitter = seededHueDelta(effectiveSeed, rampIdx);
}
const shades = generateRampNew(baseHex, {
  reach: preset.reach,
  chromaFalloff: preset.chromaFalloff,
  size: numColors,
  hueShiftStrength,
  hueJitter,
  lightnessCurve, satCurve, gamut,
});
```

The preview call site (~line 610) passes no `hueJitter` (baseline = deterministic).
`hexToHsl`/`hslToHex` pre-jitter usage in the adapter is deleted.

### Editable presets state

New per-palette state:

```ts
const DEFAULT_STYLE_PRESETS = {
  punchy:   { reach: 1.00, chromaFalloff: 0.10 },
  balanced: { reach: 0.55, chromaFalloff: 0.45 },
  muted:    { reach: 0.15, chromaFalloff: 0.85 },
};
const [stylePresets, setStylePresets] = useState(DEFAULT_STYLE_PRESETS);
const resetStylePresets = () => setStylePresets(DEFAULT_STYLE_PRESETS);
```

`rampsPunchy`/`rampsBalanced`/`rampsMuted` memos add `stylePresets` to their
dependency arrays so edits re-render live across all three rows.

### Style tuning UI

A compact tuning panel near the Color Ramps section header: for each of the
three styles, a Reach slider and a Chroma Falloff slider (0-100%), plus a
"Reset styles" button (shown only when `stylePresets` differs from default,
mirroring the existing Reset Layout pattern). Sliders edit the global preset;
all ramp cards update live.

### Persistence (`src/lib/palette.ts`)

Add to `SavedPalettePayload`:

```ts
stylePresets?: {
  punchy:   { reach: number; chromaFalloff: number };
  balanced: { reach: number; chromaFalloff: number };
  muted:    { reach: number; chromaFalloff: number };
};
```

`saveCurrentPalette` writes it; `loadPalette` reads it and falls back to
`DEFAULT_STYLE_PRESETS` when absent (older payloads). No migration needed.

### Labels (`labelsForRamp`, ~line 1383)

No change required. It already finds the base hex in the ramp and positions the
`base` label there; with the base slot hard-set, the match always succeeds at
`baseIndex` (off-center is fine — the existing dark/light label rebuild handles
it). Pin/hardware-lock fallbacks remain.

## Testing

Unit tests for the new engine (`tests/unit/ramp-engine.spec.ts`, extend
existing):

- **Base fidelity**: for a spread of bases and all three styles + custom
  presets, `ramp[baseIndex] === baseHex` exactly. Same base hex across styles.
- **Shuffle stability**: varying `hueJitter` never changes `ramp[baseIndex]`.
- **Guarantee each side**: for near-black and near-white bases at N=4..8,
  `baseIndex ∈ [1, N-2]`.
- **Monotonic lightness**: ramp L is non-decreasing for all monotonic curves.
- **Chroma falloff ordering**: ends of muted are grayer than balanced, grayer
  than punchy, for the same base; base chroma is identical across all three.
- **Reach ordering**: punchy span (lightTop - darkBottom) ≥ balanced ≥ muted.
- **Achromatic base**: gray base produces no hue shift, no NaN.

Existing JS unit tests in `tests/test_*.js` parse `pixel-pal.tsx` (the frozen
artifact) and are unaffected. Run `npm test`, `npm run build` (tsc), and the
Playwright suites after implementation.

## Out of scope

- No 4th custom style row (decided: editable presets instead).
- No per-ramp-per-style reach/falloff override (presets are global, tuned values
  saved per palette).
- No change to harmony, hardware lock, CVD, export formats beyond what the new
  engine output feeds them.
