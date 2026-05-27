# Curve Editor Design

**Date:** 2026-05-27
**Branch:** feature/curve-editor (to be created)
**Scope:** Lightness curve editor + saturation curve editor per ramp

---

## Overview

Replace the per-ramp lightness curve preset dropdown with an interactive SVG curve editor. Add a parallel saturation curve editor. Both live inline in the existing Advanced disclosure panel. Preset chips provide one-click defaults; users can click to add anchors and drag them for custom shapes.

---

## Scope

In: lightness curve editor, saturation curve editor.
Deferred: per-ramp hue shift strength override (noted in feature backlog).

---

## New Module: `src/lib/curve.ts`

Standalone, no React, no UI.

### Types

```ts
export type CurvePoints = { t: number; v: number }[];
```

`t` is position along the shade range, 0 = darkest shade, 1 = lightest shade.
`v` is the output value at that position.

For lightness curve: `v` is in [0, 1], endpoints fixed at (0, 0) and (1, 1).
For sat curve: `v` is a multiplier in [0, 2], 1.0 = neutral. Endpoints draggable, default both at 1.0.

### Preset Tables

```ts
export const LIGHTNESS_PRESETS: Record<string, CurvePoints> = {
  linear:     [{ t: 0.5, v: 0.5 }],
  eased:      [{ t: 0.5, v: 0.65 }],
  'ease-in':  [{ t: 0.5, v: 0.35 }],
  'ease-out': [{ t: 0.5, v: 0.72 }],
  's-curve':  [{ t: 0.25, v: 0.12 }, { t: 0.75, v: 0.88 }],
};

export const SAT_PRESETS: Record<string, CurvePoints> = {
  flat: [],                                              // midpoints only; endpoints injected by CurveEditor
  bell: [{ t: 0.5, v: 1.6 }],
  rise: [{ t: 0.5, v: 0.6 }, { t: 0.9, v: 1.5 }],
  dip:  [{ t: 0.5, v: 0.5 }],
};
```

Sat curve `points` in state always has the form `[endpoint0, ...midpoints, endpoint1]` where endpoints are `{ t: 0, v }` and `{ t: 1, v }`. Preset chips replace only the midpoints; clicking a preset resets endpoints to `(0, 1.0)` and `(1, 1.0)`.

### Functions

`evalCurve(points: CurvePoints, t: number, yMin: number, yMax: number): number`
Catmull-Rom spline with clamped endpoints. For lightness: prepends (0,0), appends (1,1) before interpolation. For sat: endpoints stored in `points` array (first and last elements). Clamps output to [yMin, yMax]. Sampled at t in [0,1].

`activePreset(points: CurvePoints, presets: Record<string, CurvePoints>, eps = 0.01): string | null`
Returns the key of the matching preset within epsilon tolerance, or null (custom).

`presetToPoints(preset: string): CurvePoints`
Migration helper. Converts old `CurvePreset` string values to `CurvePoints` using `LIGHTNESS_PRESETS`. Falls back to `LIGHTNESS_PRESETS.eased` for unknown strings.

---

## `src/lib/ramp-engine.ts` Changes

### `GenerateRampOpts` diff

```ts
// Removed
curve?: CurvePreset;

// Added
lightnessCurve?: CurvePoints;
satCurve?: CurvePoints;

// Unchanged
satMultiplier?: number;
```

`CurvePreset` type and `curveSample()` deleted. `evalCurve` imported from `lib/curve.ts`.

`STYLE_CONFIG` entries: `defaultCurve: CurvePreset` becomes `defaultLightnessCurve: CurvePoints` pointing at the equivalent preset array.

### Per-shade computation

```ts
// Lightness
const L = lMin + (lMax - lMin) * evalCurve(lightnessCurve, t, 0, 1);

// Chroma
const satCurveMult = evalCurve(satCurve, t, 0, 2);
const C = baseOklch.C * cfg.cMult * satMult * satCurveMult;
```

---

## New Component: `src/components/CurveEditor.tsx`

### Props

```ts
interface CurveEditorProps {
  points: CurvePoints;
  onChange: (pts: CurvePoints) => void;
  presets: Record<string, CurvePoints>;
  color: string;             // '#ffea00' lightness, '#ff9966' sat
  yMin?: number;             // default 0
  yMax?: number;             // default 1
  fixedEndpoints?: boolean;  // true for L curve, false for sat
  height?: number;           // px, default 80
}
```

### Interactions

| Action | Result |
|--------|--------|
| Click empty canvas | Add anchor at position (max 4 midpoints) |
| Drag anchor | Reposition |
| Right-click anchor | Delete |
| Drag anchor off edge >10px | Delete (secondary path) |
| Sat endpoints | Drag only, no delete |

### Rendering

- Curve line: `evalCurve` sampled at 60 points, drawn as SVG `<path>`
- Anchor dots: 6px radius circles, `color` prop fill, pointer cursor
- Fixed endpoints (L curve): 4px radius, lower opacity
- Sat y=1.0 reference line: faint horizontal at neutral
- Preset chips: below SVG canvas, active chip highlighted by `activePreset()` match

### Implementation notes

- `width="100%"` SVG fills panel column (~180-220px)
- Pointer events only: `onPointerDown`, `onPointerMove`, `onPointerUp` on SVG
- No drag library dependency

---

## `src/components/RampAdvancedPanel.tsx` Changes

### New props

```ts
lightnessCurve: CurvePoints;
onLightnessCurveChange: (pts: CurvePoints) => void;
satCurve: CurvePoints;
onSatCurveChange: (pts: CurvePoints) => void;
```

### Layout

```
▾ Advanced
  LIGHTNESS CURVE
  [CurveEditor h=80, fixedEndpoints=true]
  [linear] [eased] [s-curve] [ease-in] [ease-out]

  SATURATION CURVE
  [CurveEditor h=65, fixedEndpoints=false, yMin=0, yMax=2]
  [flat] [bell] [rise] [dip]

  Gamut strategy    [auto ▾]
```

Curve preset dropdown removed.

---

## `src/App.tsx` State Changes

### State

```ts
// Removed
const [curvePerRamp, setCurvePerRamp] = useState<Record<string, CurvePresetSerialized>>({});

// Added
const [lightnessCurvePerRamp, setLightnessCurvePerRamp] = useState<Record<string, CurvePoints>>({});
const [satCurvePerRamp, setSatCurvePerRamp] = useState<Record<string, CurvePoints>>({});
```

`rampSatOverrides` flat slider unchanged.

### useMemo deps

`rampsPunchy`, `rampsBalanced`, `rampsMuted`: add `lightnessCurvePerRamp`, `satCurvePerRamp` to dependency arrays.

### Engine call per ramp

```ts
lightnessCurve: lightnessCurvePerRamp[rampId] ?? cfg.defaultLightnessCurve,
satCurve: satCurvePerRamp[rampId] ?? SAT_PRESETS.flat,
```

### `resetPaletteState`

Clear both new maps.

### `loadPalette` migration

```ts
if (saved.curvePerRamp) {
  for (const [id, val] of Object.entries(saved.curvePerRamp)) {
    lightnessCurvePerRamp[id] = typeof val === 'string'
      ? presetToPoints(val)
      : (val as CurvePoints);
  }
}
// satCurvePerRamp: load from saved.satCurvePerRamp if present, else default flat
```

---

## `src/lib/palette.ts` Changes

```ts
// SavedPalettePayload additions
lightnessCurvePerRamp?: Record<string, CurvePoints>;
satCurvePerRamp?: Record<string, CurvePoints>;

// Keep for migration read
curvePerRamp?: Record<string, string | CurvePoints>;
```

`curvePerRamp` not written on save (legacy read only).

---

## Sat Curve Relationship to Flat Slider

Sat multipliers stack: `finalC = base * cMult * satMultiplier * satCurveMult`.

`satMultiplier` (flat slider, 0.5-2.0x) applies uniform scaling across all shades.
`satCurveMult` (curve, per-shade 0.0-2.0x) applies shaped scaling on top.
Default sat curve is flat at 1.0, so zero change when curve unused.

---

## Migration

Old saved palettes with `curvePerRamp: { rampId: 'eased' }` migrate automatically on load via `presetToPoints`. No user action required. Re-saving writes the new format.

---

## Out of Scope

- lMin/lMax sliders
- Chroma envelope curve
- Per-ramp hue shift strength override (backlog)
- Adding/removing anchors via keyboard
