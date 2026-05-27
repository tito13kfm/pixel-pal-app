# Curve Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-ramp lightness curve dropdown with an interactive SVG curve editor inline in the Advanced panel, and add a parallel saturation curve editor.

**Architecture:** New `src/lib/curve.ts` provides pure math (CurvePoints type, Catmull-Rom interpolation, preset tables). New `src/components/CurveEditor.tsx` is a self-contained SVG drag component. `RampAdvancedPanel` hosts two CurveEditor instances. `App.tsx` gains two new curve state maps. `ramp-engine.ts` replaces `CurvePreset`/`curveSample` with `CurvePoints`/`evalCurve`.

**Implementation note on spec:** Both lightness and sat store full CurvePoints arrays including endpoints. Lightness fixed endpoints (0,0)→(1,1) are always present in state; CurveEditor enforces `fixedEndpoints=true` at the UI layer. This makes `evalCurve` fully generic with no lightness/sat mode flag.

**Tech Stack:** React 19, TypeScript, SVG pointer events (no drag library), Catmull-Rom spline.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/curve.ts` | Create | CurvePoints type, preset tables, evalCurve (Catmull-Rom), activePreset, presetToPoints |
| `src/components/CurveEditor.tsx` | Create | SVG curve editor: drag anchors, click-to-add, right-click delete, preset chips |
| `tests/test_curve.ts` | Create | Unit tests for curve math (node --experimental-strip-types) |
| `src/lib/ramp-engine.ts` | Modify | Remove CurvePreset/curveSample; add lightnessCurve/satCurve as CurvePoints; per-shade sat |
| `src/lib/palette.ts` | Modify | Add lightnessCurvePerRamp/satCurvePerRamp; keep curvePerRamp for legacy migration |
| `src/components/RampAdvancedPanel.tsx` | Modify | Replace curve dropdown with two CurveEditor instances + gamut row |
| `src/App.tsx` | Modify | New state, engine call updates, loadPalette migration, resetPaletteState |

---

### Task 1: `src/lib/curve.ts` — curve math module (TDD)

**Files:**
- Create: `tests/test_curve.ts`
- Create: `src/lib/curve.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/test_curve.ts`:

```typescript
// Run: node --experimental-strip-types tests/test_curve.ts
// Fallback if Node < 22.6: npx tsx tests/test_curve.ts

import { evalCurve, activePreset, presetToPoints, LIGHTNESS_PRESETS, SAT_PRESETS } from '../src/lib/curve.ts';

let pass = 0, fail = 0;

function assert(label: string, ok: boolean) {
  if (ok) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}`); fail++; }
}

function near(a: number, b: number, eps = 0.01) { return Math.abs(a - b) < eps; }

// --- evalCurve: linear preset ---
console.log('evalCurve — linear (2 interior segments, Catmull-Rom)');
{
  const pts = LIGHTNESS_PRESETS.linear; // [{t:0,v:0},{t:0.5,v:0.5},{t:1,v:1}]
  assert('t=0 → 0', near(evalCurve(pts, 0, 0, 1), 0));
  assert('t=1 → 1', near(evalCurve(pts, 1, 0, 1), 1));
  assert('t=0.5 → 0.5', near(evalCurve(pts, 0.5, 0, 1), 0.5));
  assert('t=0.25 ≈ 0.25', near(evalCurve(pts, 0.25, 0, 1), 0.25, 0.04));
}

// --- evalCurve: sat flat (2 points = linear interp) ---
console.log('evalCurve — sat flat (2 points)');
{
  const pts = SAT_PRESETS.flat; // [{t:0,v:1},{t:1,v:1}]
  assert('t=0 → 1', near(evalCurve(pts, 0, 0, 2), 1));
  assert('t=0.5 → 1', near(evalCurve(pts, 0.5, 0, 2), 1));
  assert('t=1 → 1', near(evalCurve(pts, 1, 0, 2), 1));
}

// --- evalCurve: sat bell (midpoint peak) ---
console.log('evalCurve — sat bell');
{
  const pts = SAT_PRESETS.bell; // [{t:0,v:1},{t:0.5,v:1.6},{t:1,v:1}]
  assert('endpoints at 1.0', near(evalCurve(pts, 0, 0, 2), 1) && near(evalCurve(pts, 1, 0, 2), 1));
  assert('peak at midpoint > 1', evalCurve(pts, 0.5, 0, 2) > 1.4);
}

// --- evalCurve: sat dip ---
console.log('evalCurve — sat dip');
{
  const pts = SAT_PRESETS.dip; // [{t:0,v:1},{t:0.5,v:0.5},{t:1,v:1}]
  assert('trough at midpoint < 1', evalCurve(pts, 0.5, 0, 2) < 0.7);
}

// --- evalCurve: yMin/yMax clamp ---
console.log('evalCurve — clamping');
{
  const pts = [{ t: 0, v: -0.5 }, { t: 1, v: 1.5 }];
  assert('below yMin clamped to 0', near(evalCurve(pts, 0, 0, 1), 0));
  assert('above yMax clamped to 1', near(evalCurve(pts, 1, 0, 1), 1));
}

// --- evalCurve: eased is non-linear ---
console.log('evalCurve — eased (non-linear)');
{
  const pts = LIGHTNESS_PRESETS.eased; // midpoint at v=0.65
  const mid = evalCurve(pts, 0.5, 0, 1);
  assert('eased midpoint > 0.5', mid > 0.55);
}

// --- activePreset ---
console.log('activePreset');
{
  assert('linear matches', activePreset(LIGHTNESS_PRESETS.linear, LIGHTNESS_PRESETS) === 'linear');
  assert('eased matches', activePreset(LIGHTNESS_PRESETS.eased, LIGHTNESS_PRESETS) === 'eased');
  assert("s-curve matches", activePreset(LIGHTNESS_PRESETS['s-curve'], LIGHTNESS_PRESETS) === 's-curve');

  const custom = [{ t: 0, v: 0 }, { t: 0.5, v: 0.3 }, { t: 1, v: 1 }];
  assert('custom → null', activePreset(custom, LIGHTNESS_PRESETS) === null);

  // Within epsilon (default 0.01)
  const nearLinear = [{ t: 0, v: 0.005 }, { t: 0.5, v: 0.505 }, { t: 1, v: 1.0 }];
  assert('within eps → linear', activePreset(nearLinear, LIGHTNESS_PRESETS) === 'linear');

  // Different length = no match
  const wrongLen = [{ t: 0, v: 0 }, { t: 1, v: 1 }];
  assert('wrong length → null', activePreset(wrongLen, LIGHTNESS_PRESETS) === null);

  // Sat presets
  assert('sat flat matches', activePreset(SAT_PRESETS.flat, SAT_PRESETS) === 'flat');
  assert('sat bell matches', activePreset(SAT_PRESETS.bell, SAT_PRESETS) === 'bell');
}

// --- presetToPoints ---
console.log('presetToPoints');
{
  const eased = presetToPoints('eased');
  assert('known preset returns array', Array.isArray(eased) && eased.length > 0);
  assert('starts at t=0', eased[0].t === 0);
  assert('ends at t=1', eased[eased.length - 1].t === 1);

  const fallback = presetToPoints('not-a-real-preset');
  const expected = LIGHTNESS_PRESETS.eased;
  assert('unknown → eased fallback', JSON.stringify(fallback) === JSON.stringify(expected));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
```

- [ ] **Step 2: Run test — expect failure**

```powershell
node --experimental-strip-types tests/test_curve.ts
```

Expected output: `Cannot find module` or `SyntaxError` — file doesn't exist yet. Confirms test runs.

- [ ] **Step 3: Implement `src/lib/curve.ts`**

Create `src/lib/curve.ts`:

```typescript
export type CurvePoints = { t: number; v: number }[];

// Full arrays: first point is t=0 endpoint, last is t=1 endpoint.
// Lightness fixed endpoints are (0,0)→(1,1). Sat endpoints default to (0,1.0)→(1,1.0).
export const LIGHTNESS_PRESETS: Record<string, CurvePoints> = {
  linear:     [{ t: 0, v: 0 }, { t: 0.5, v: 0.5 },  { t: 1, v: 1 }],
  eased:      [{ t: 0, v: 0 }, { t: 0.5, v: 0.65 }, { t: 1, v: 1 }],
  'ease-in':  [{ t: 0, v: 0 }, { t: 0.5, v: 0.35 }, { t: 1, v: 1 }],
  'ease-out': [{ t: 0, v: 0 }, { t: 0.5, v: 0.72 }, { t: 1, v: 1 }],
  's-curve':  [{ t: 0, v: 0 }, { t: 0.25, v: 0.12 }, { t: 0.75, v: 0.88 }, { t: 1, v: 1 }],
};

export const SAT_PRESETS: Record<string, CurvePoints> = {
  flat: [{ t: 0, v: 1 }, { t: 1, v: 1 }],
  bell: [{ t: 0, v: 1 }, { t: 0.5, v: 1.6 },  { t: 1, v: 1 }],
  rise: [{ t: 0, v: 1 }, { t: 0.5, v: 0.6 }, { t: 0.9, v: 1.5 }, { t: 1, v: 1 }],
  dip:  [{ t: 0, v: 1 }, { t: 0.5, v: 0.5 },  { t: 1, v: 1 }],
};

// Catmull-Rom spline interpolation.
// points must be sorted by t and include endpoints as first/last elements.
// Phantom endpoints are reflected through the real endpoints to give smooth tangents.
export function evalCurve(points: CurvePoints, t: number, yMin = 0, yMax = 1): number {
  const clamp = (v: number) => Math.max(yMin, Math.min(yMax, v));

  if (points.length === 0) return clamp((yMin + yMax) / 2);
  if (points.length === 1) return clamp(points[0].v);
  if (t <= points[0].t) return clamp(points[0].v);
  if (t >= points[points.length - 1].t) return clamp(points[points.length - 1].v);

  const n = points.length;
  // Reflect through first and last real points to create phantom endpoints
  const phantom0 = { t: 2 * points[0].t - points[1].t,         v: 2 * points[0].v - points[1].v };
  const phantomN = { t: 2 * points[n-1].t - points[n-2].t,     v: 2 * points[n-1].v - points[n-2].v };
  const all = [phantom0, ...points, phantomN];

  // Find segment in original points where points[i].t <= t < points[i+1].t
  let segIdx = n - 2;
  for (let i = 0; i < n - 1; i++) {
    if (t < points[i + 1].t) { segIdx = i; break; }
  }

  // In all[], points[segIdx] is at all[segIdx+1]
  const P0 = all[segIdx];
  const P1 = all[segIdx + 1];
  const P2 = all[segIdx + 2];
  const P3 = all[segIdx + 3];

  const s = (t - P1.t) / (P2.t - P1.t);
  const v = 0.5 * (
    2 * P1.v +
    (-P0.v + P2.v) * s +
    (2 * P0.v - 5 * P1.v + 4 * P2.v - P3.v) * s * s +
    (-P0.v + 3 * P1.v - 3 * P2.v + P3.v) * s * s * s
  );

  return clamp(v);
}

// Returns the preset key whose points match within epsilon, or null if custom.
export function activePreset(
  points: CurvePoints,
  presets: Record<string, CurvePoints>,
  eps = 0.01,
): string | null {
  for (const [key, preset] of Object.entries(presets)) {
    if (preset.length !== points.length) continue;
    if (preset.every((p, i) => Math.abs(p.t - points[i].t) < eps && Math.abs(p.v - points[i].v) < eps)) {
      return key;
    }
  }
  return null;
}

// Migration: convert old CurvePreset string to CurvePoints.
// Falls back to eased for unrecognised values.
export function presetToPoints(preset: string): CurvePoints {
  return LIGHTNESS_PRESETS[preset] ?? LIGHTNESS_PRESETS.eased;
}
```

- [ ] **Step 4: Run test — expect all pass**

```powershell
node --experimental-strip-types tests/test_curve.ts
```

Expected: all assertions pass, exit 0.
If `--experimental-strip-types` unavailable: `npx tsx tests/test_curve.ts`

- [ ] **Step 5: Commit**

```powershell
git add src/lib/curve.ts tests/test_curve.ts
git commit -m "feat(curve): add curve.ts with Catmull-Rom evalCurve, presets, activePreset"
```

---

### Task 2: `src/lib/ramp-engine.ts` — replace CurvePreset with CurvePoints

**Files:**
- Modify: `src/lib/ramp-engine.ts` (full rewrite — file is 99 lines)

- [ ] **Step 1: Rewrite ramp-engine.ts**

Replace the entire file with:

```typescript
import { hexToOklch, oklchToHex, gamutMap } from './oklch';
import type { Oklch, GamutStrategy } from './oklch';
import { evalCurve, LIGHTNESS_PRESETS, SAT_PRESETS } from './curve';
import type { CurvePoints } from './curve';

export type Style = 'punchy' | 'balanced' | 'muted';

export interface GenerateRampOpts {
  style: Style;
  size: number;
  hueShiftStrength: number;
  satMultiplier?: number;
  lightnessCurve?: CurvePoints;
  satCurve?: CurvePoints;
  gamut?: GamutStrategy;
  pins?: Record<number, string>;
  hidden?: number[];
  hardwareLock?: string | null;
}

export interface Shade {
  hex: string;
  oklch: Oklch;
  pinned: boolean;
  gamutClipped: boolean;
}

const STYLE_CONFIG: Record<Style, {
  lMin: number;
  lMax: number;
  cMult: number;
  defaultLightnessCurve: CurvePoints;
}> = {
  punchy:   { lMin: 0.18, lMax: 0.92, cMult: 1.00, defaultLightnessCurve: LIGHTNESS_PRESETS.linear },
  balanced: { lMin: 0.25, lMax: 0.85, cMult: 0.80, defaultLightnessCurve: LIGHTNESS_PRESETS.eased },
  muted:    { lMin: 0.32, lMax: 0.78, cMult: 0.55, defaultLightnessCurve: LIGHTNESS_PRESETS.eased },
};

const L_FLOOR = 0.04;
const L_CEIL  = 0.96;

function perSlotHueShift(slotIdx: number, totalSlots: number, baseH: number, strength: number, baseC: number): number {
  if (baseC < 0.01) return baseH;
  const mid = (totalSlots - 1) / 2;
  const dist = mid === 0 ? 0 : (slotIdx - mid) / mid;
  return (baseH + dist * 15 * strength + 360) % 360;
}

export function generateRamp(baseHex: string, opts: GenerateRampOpts): Shade[] {
  const baseOklch = hexToOklch(baseHex);
  if (!baseOklch) {
    return Array.from({ length: opts.size }, () => ({
      hex: baseHex, oklch: { L: 0, C: 0, H: 0 }, pinned: false, gamutClipped: false,
    }));
  }

  const cfg            = STYLE_CONFIG[opts.style];
  const lightnessCurve = opts.lightnessCurve ?? cfg.defaultLightnessCurve;
  const satCurve       = opts.satCurve ?? SAT_PRESETS.flat;
  const gamut          = opts.gamut ?? 'auto' as GamutStrategy;
  const satMult        = opts.satMultiplier ?? 1.0;
  const lMin           = Math.max(L_FLOOR, cfg.lMin);
  const lMax           = Math.min(L_CEIL,  cfg.lMax);

  const shades: Shade[] = [];

  for (let i = 0; i < opts.size; i++) {
    const t   = opts.size === 1 ? 0.5 : i / (opts.size - 1);
    const L   = lMin + (lMax - lMin) * evalCurve(lightnessCurve, t, 0, 1);
    const C   = baseOklch.C * cfg.cMult * satMult * evalCurve(satCurve, t, 0, 2);
    const H   = perSlotHueShift(i, opts.size, baseOklch.H, opts.hueShiftStrength, baseOklch.C);

    const ideal: Oklch = { L, C, H };
    const mapped       = gamutMap(ideal, gamut);
    const wasClipped   = mapped.C < ideal.C - 1e-4;

    const pin = opts.pins?.[i];
    shades.push(pin
      ? { hex: pin,              oklch: ideal,  pinned: true,  gamutClipped: false }
      : { hex: oklchToHex(mapped), oklch: mapped, pinned: false, gamutClipped: wasClipped },
    );
  }

  const hiddenSet = new Set(opts.hidden ?? []);
  return shades.filter((_, i) => !hiddenSet.has(i));
}
```

- [ ] **Step 2: Re-run curve tests to confirm no breakage**

```powershell
node --experimental-strip-types tests/test_curve.ts
```

Expected: all pass.

- [ ] **Step 3: Check TypeScript errors**

```powershell
npx tsc --noEmit 2>&1 | Select-String "ramp-engine|curve"
```

Expected: zero lines (no errors in the new files). Errors in App.tsx are expected and handled in Task 6.

- [ ] **Step 4: Commit**

```powershell
git add src/lib/ramp-engine.ts
git commit -m "feat(engine): replace CurvePreset with CurvePoints, per-shade sat curve"
```

---

### Task 3: `src/lib/palette.ts` — update SavedPalettePayload

**Files:**
- Modify: `src/lib/palette.ts`

- [ ] **Step 1: Add import and new fields**

At the top of the file, add after the existing imports:

```typescript
import type { CurvePoints } from './curve';
```

Inside `SavedPalettePayload`, replace the existing curve/gamut fields block:

```typescript
  // Legacy: read-only for migration, not written on save
  curvePerRamp?: Record<string, string | CurvePoints>

  // Current curve state
  lightnessCurvePerRamp?: Record<string, CurvePoints>
  satCurvePerRamp?: Record<string, CurvePoints>

  // Unchanged
  gamutPerRamp?: Record<string, GamutStrategySerialized>
  advancedOpen?: Record<string, boolean>
```

Leave `CurvePresetSerialized` type in place — it's still used by `RampAdvancedPanel` until Task 5 removes it.

- [ ] **Step 2: Verify**

```powershell
npx tsc --noEmit 2>&1 | Select-String "palette.ts"
```

Expected: zero lines.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/palette.ts
git commit -m "feat(palette): add lightnessCurvePerRamp and satCurvePerRamp to SavedPalettePayload"
```

---

### Task 4: `src/components/CurveEditor.tsx` — SVG curve editor component

**Files:**
- Create: `src/components/CurveEditor.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/CurveEditor.tsx`:

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { evalCurve, activePreset } from '../lib/curve';
import type { CurvePoints } from '../lib/curve';

export interface CurveEditorProps {
  points: CurvePoints;
  onChange: (pts: CurvePoints) => void;
  presets: Record<string, CurvePoints>;
  color: string;
  yMin?: number;
  yMax?: number;
  fixedEndpoints?: boolean;
  height?: number;
}

const SAMPLES = 60;
const HIT_R   = 10;   // SVG units
const CLICK_D = 4;    // SVG units — squared = 16
const MAX_MID = 4;    // max interior (non-endpoint) anchors

export function CurveEditor({
  points,
  onChange,
  presets,
  color,
  yMin = 0,
  yMax = 1,
  fixedEndpoints = false,
  height = 80,
}: CurveEditorProps) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(200);
  const dragging = useRef<number | null>(null);
  const clickStart = useRef<{ sx: number; sy: number; t: number; v: number } | null>(null);

  const H      = height;
  const yRange = yMax - yMin;

  // Track actual rendered width to avoid viewBox distortion on anchor circles
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => setSvgW(entries[0].contentRect.width));
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  // Map curve coords → SVG pixel coords
  function toPx(t: number, v: number) {
    return { x: t * svgW, y: H - ((v - yMin) / yRange) * H };
  }

  // Map SVG pixel coords → curve coords
  function fromPx(sx: number, sy: number) {
    return {
      t: Math.max(0, Math.min(1, sx / svgW)),
      v: Math.max(yMin, Math.min(yMax, yMax - (sy / H) * yRange)),
    };
  }

  function clientToPx(clientX: number, clientY: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: clientX - r.left, sy: clientY - r.top };
  }

  function hitTest(sx: number, sy: number): number {
    for (let i = 0; i < points.length; i++) {
      if (fixedEndpoints && (i === 0 || i === points.length - 1)) continue;
      const { x, y } = toPx(points[i].t, points[i].v);
      const dx = sx - x, dy = sy - y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) return i;
    }
    return -1;
  }

  function buildPath(): string {
    return Array.from({ length: SAMPLES }, (_, i) => {
      const t      = i / (SAMPLES - 1);
      const v      = evalCurve(points, t, yMin, yMax);
      const { x, y } = toPx(t, v);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.preventDefault();
    const { sx, sy } = clientToPx(e.clientX, e.clientY);
    const idx = hitTest(sx, sy);
    if (idx >= 0) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = idx;
      clickStart.current = null;
    } else {
      const { t, v } = fromPx(sx, sy);
      clickStart.current = { sx, sy, t, v };
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragging.current === null) return;
    const { sx, sy } = clientToPx(e.clientX, e.clientY);
    const { t, v }   = fromPx(sx, sy);
    const idx        = dragging.current;
    const newPts     = [...points];
    const isEndpoint = idx === 0 || idx === points.length - 1;

    if (isEndpoint && !fixedEndpoints) {
      // Sat endpoints: v moves freely, t stays clamped to 0 or 1
      newPts[idx] = { t: idx === 0 ? 0 : 1, v };
    } else if (!isEndpoint) {
      // Off-edge drag → delete midpoint
      if (sy < -10 || sy > H + 10) {
        newPts.splice(idx, 1);
        dragging.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onChange(newPts);
        return;
      }
      // Stay sorted relative to neighbours
      const minT = points[idx - 1].t + 0.01;
      const maxT = points[idx + 1].t - 0.01;
      newPts[idx] = { t: Math.max(minT, Math.min(maxT, t)), v };
    }

    onChange(newPts);
    clickStart.current = null;
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    dragging.current = null;
    if (clickStart.current) {
      const { sx, sy } = clientToPx(e.clientX, e.clientY);
      const dx = sx - clickStart.current.sx;
      const dy = sy - clickStart.current.sy;
      if (dx * dx + dy * dy < CLICK_D * CLICK_D) {
        // Click on empty canvas: add midpoint if under cap
        const midCount = points.length - 2;
        const { t, v } = clickStart.current;
        if (midCount < MAX_MID && t > 0.01 && t < 0.99) {
          onChange([...points, { t, v }].sort((a, b) => a.t - b.t));
        }
      }
      clickStart.current = null;
    }
  }

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault();
    const { sx, sy } = clientToPx(e.clientX, e.clientY);
    const idx = hitTest(sx, sy);
    if (idx > 0 && idx < points.length - 1) {
      onChange(points.filter((_, i) => i !== idx));
    }
  }

  const currentPreset = activePreset(points, presets);
  const neutralSy     = H - ((1 - yMin) / yRange) * H; // y-position of v=1.0

  return (
    <div style={{ userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        style={{ display: 'block', background: '#0a0a0a', borderRadius: 3, border: '1px solid #333', cursor: 'crosshair', overflow: 'visible' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {/* Neutral reference line — only for sat curve (yMax=2) */}
        {yMax > 1 && (
          <line x1={0} y1={neutralSy} x2={svgW} y2={neutralSy}
            stroke="#2a2a2a" strokeWidth={0.5} strokeDasharray="4 4" />
        )}

        {/* Curve */}
        <path d={buildPath()} stroke={color} strokeWidth={1.5} fill="none" />

        {/* Anchors */}
        {points.map((p, i) => {
          const { x, y } = toPx(p.t, p.v);
          const isFixed  = fixedEndpoints && (i === 0 || i === points.length - 1);
          return (
            <circle key={i} cx={x} cy={y}
              r={isFixed ? 3 : 5}
              fill={isFixed ? 'none' : '#fff'}
              stroke={color}
              strokeWidth={1.5}
              opacity={isFixed ? 0.35 : 1}
              style={{ cursor: isFixed ? 'default' : 'grab', pointerEvents: isFixed ? 'none' : 'auto' }}
            />
          );
        })}
      </svg>

      {/* Preset chips */}
      <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
        {Object.keys(presets).map(key => {
          const active = currentPreset === key;
          return (
            <span key={key} onClick={() => onChange(presets[key])} style={{
              background:  active ? `${color}22` : '#222',
              border:      `1px solid ${active ? `${color}66` : '#444'}`,
              padding:     '2px 5px',
              borderRadius: 3,
              color:       active ? color : '#777',
              fontSize:    9,
              cursor:      'pointer',
              fontFamily:  'monospace',
            }}>
              {key}{active ? ' ✓' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-String "CurveEditor"
```

Expected: zero lines.

- [ ] **Step 3: Commit**

```powershell
git add src/components/CurveEditor.tsx
git commit -m "feat(ui): CurveEditor SVG component with drag anchors, preset chips"
```

---

### Task 5: `src/components/RampAdvancedPanel.tsx` — wire in CurveEditor

**Files:**
- Modify: `src/components/RampAdvancedPanel.tsx` (full rewrite — 64 lines)

- [ ] **Step 1: Rewrite RampAdvancedPanel.tsx**

Replace the entire file:

```typescript
import React from 'react';
import { CurveEditor } from './CurveEditor';
import { LIGHTNESS_PRESETS, SAT_PRESETS } from '../lib/curve';
import type { CurvePoints } from '../lib/curve';
import type { GamutStrategySerialized } from '../lib/palette';

interface RampAdvancedPanelProps {
  open: boolean;
  lightnessCurve: CurvePoints;
  satCurve: CurvePoints;
  gamut: GamutStrategySerialized;
  sizeLocked?: boolean;
  onToggle: () => void;
  onLightnessCurveChange: (pts: CurvePoints) => void;
  onSatCurveChange: (pts: CurvePoints) => void;
  onGamutChange: (g: GamutStrategySerialized) => void;
}

const GAMUTS: GamutStrategySerialized[] = ['auto', 'clip', 'chroma-preserve'];

export const RampAdvancedPanel: React.FC<RampAdvancedPanelProps> = ({
  open, lightnessCurve, satCurve, gamut, sizeLocked,
  onToggle, onLightnessCurveChange, onSatCurveChange, onGamutChange,
}) => {
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: 6 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ background: 'transparent', color: open ? '#ffea00' : '#888', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: 'monospace' }}
      >
        {open ? '▾' : '▸'} Advanced
      </button>

      {open && (
        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', padding: 8, marginTop: 6, fontSize: 11, fontFamily: 'monospace' }}>

          <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>LIGHTNESS CURVE</div>
          <CurveEditor
            points={lightnessCurve}
            onChange={onLightnessCurveChange}
            presets={LIGHTNESS_PRESETS}
            color="#ffea00"
            yMin={0}
            yMax={1}
            fixedEndpoints={true}
            height={80}
          />

          <div style={{ color: '#666', fontSize: 10, marginBottom: 4, marginTop: 10 }}>SATURATION CURVE</div>
          <CurveEditor
            points={satCurve}
            onChange={onSatCurveChange}
            presets={SAT_PRESETS}
            color="#ff9966"
            yMin={0}
            yMax={2}
            fixedEndpoints={false}
            height={65}
          />

          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#bbb' }}>Gamut strategy</span>
              <select value={gamut} onChange={e => onGamutChange(e.target.value as GamutStrategySerialized)} style={{ minWidth: 120 }}>
                {GAMUTS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>

          {sizeLocked && (
            <div style={{ fontSize: 10, color: '#ff9966', marginTop: 4 }}>
              Size locked while old-engine shades are pinned. Clear pins to unlock.
            </div>
          )}
          <div style={{ fontSize: 9, color: '#777', lineHeight: 1.3, marginTop: 6 }}>
            Drag curve anchors. Click empty area to add. Right-click or drag off-edge to delete.
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify TypeScript**

```powershell
npx tsc --noEmit 2>&1 | Select-String "RampAdvancedPanel"
```

Expected: errors only from App.tsx call sites (old prop shape) — handled in Task 6.

- [ ] **Step 3: Commit**

```powershell
git add src/components/RampAdvancedPanel.tsx
git commit -m "feat(ui): RampAdvancedPanel — two CurveEditors replace preset dropdown"
```

---

### Task 6: `src/App.tsx` — state, engine calls, migration

**Files:**
- Modify: `src/App.tsx` (~7215 lines, @ts-nocheck)

App.tsx uses `// @ts-nocheck` so TypeScript won't catch errors in it. Search by string pattern, not line number — these patterns are unique in the file.

- [ ] **Step 1: Add import**

Find the line that imports from `'./lib/ramp-engine'`. Add to that import block:

```typescript
import { LIGHTNESS_PRESETS, SAT_PRESETS, presetToPoints } from './lib/curve';
import type { CurvePoints } from './lib/curve';
```

- [ ] **Step 2: Replace curvePerRamp state**

Search for: `const [curvePerRamp, setCurvePerRamp]`

Replace that line with:

```typescript
const [lightnessCurvePerRamp, setLightnessCurvePerRamp] = useState({});
const [satCurvePerRamp, setSatCurvePerRamp] = useState({});
```

- [ ] **Step 3: Update useMemo dependency arrays**

Search for the three `useMemo` blocks that compute `rampsPunchy`, `rampsBalanced`, `rampsMuted`. Each has a dependency array. Find `curvePerRamp` in those arrays and replace with `lightnessCurvePerRamp, satCurvePerRamp`.

Pattern to find in each useMemo's dep array: `curvePerRamp`
Replace with: `lightnessCurvePerRamp, satCurvePerRamp`

- [ ] **Step 4: Update engine calls inside each useMemo**

Inside each useMemo that calls `generateRamp(...)`, find the options object. It currently has a `curve:` field. Replace the `curve:` line with:

```typescript
lightnessCurve: lightnessCurvePerRamp[rampId] ?? LIGHTNESS_PRESETS.eased,
satCurve: satCurvePerRamp[rampId] ?? SAT_PRESETS.flat,
```

Note: `rampId` is whatever identifier the code uses to look up per-ramp state. Check the surrounding code — it may be `ramp.id`, `String(i)`, or a string key. Use the same pattern already used for `gamutPerRamp` lookups.

- [ ] **Step 5: Update resetPaletteState**

Search for `setCurvePerRamp(`. Replace with:

```typescript
setLightnessCurvePerRamp({});
setSatCurvePerRamp({});
```

- [ ] **Step 6: Update loadPalette — migration**

Search for where `saved.curvePerRamp` is read in loadPalette. Replace that block with:

```typescript
// Migrate legacy curvePerRamp (string values) to lightnessCurvePerRamp
const migratedLightness = {};
if (saved.lightnessCurvePerRamp) {
  Object.assign(migratedLightness, saved.lightnessCurvePerRamp);
} else if (saved.curvePerRamp) {
  for (const [id, val] of Object.entries(saved.curvePerRamp)) {
    migratedLightness[id] = typeof val === 'string' ? presetToPoints(val) : val;
  }
}
setLightnessCurvePerRamp(migratedLightness);
setSatCurvePerRamp(saved.satCurvePerRamp ?? {});
```

- [ ] **Step 7: Update saveCurrentPalette**

Search for `curvePerRamp` in the object passed to `savePaletteToStorage` (or the save function). Replace with:

```typescript
lightnessCurvePerRamp,
satCurvePerRamp,
// do NOT write curvePerRamp — legacy read-only
```

- [ ] **Step 8: Update RampAdvancedPanel call sites**

Search for all `<RampAdvancedPanel` in App.tsx. Each will have old props `curve={...}` and `onCurveChange={...}`. Replace with the new prop shape:

```tsx
<RampAdvancedPanel
  open={advancedOpen[rampId] ?? false}
  lightnessCurve={lightnessCurvePerRamp[rampId] ?? LIGHTNESS_PRESETS.eased}
  satCurve={satCurvePerRamp[rampId] ?? SAT_PRESETS.flat}
  gamut={gamutPerRamp[rampId] ?? 'auto'}
  sizeLocked={sizeLocked}
  onToggle={() => setAdvancedOpen(prev => ({ ...prev, [rampId]: !prev[rampId] }))}
  onLightnessCurveChange={pts => setLightnessCurvePerRamp(prev => ({ ...prev, [rampId]: pts }))}
  onSatCurveChange={pts => setSatCurvePerRamp(prev => ({ ...prev, [rampId]: pts }))}
  onGamutChange={g => setGamutPerRamp(prev => ({ ...prev, [rampId]: g }))}
/>
```

Use the same `rampId` and `sizeLocked` variables already in that render context. The `onToggle` and `onGamutChange` patterns should match what was there before — only the curve props change.

- [ ] **Step 9: Build check**

```powershell
npm run build 2>&1 | Select-Object -Last 20
```

Expected: build succeeds. If there are errors, they will name the file and line — fix those before committing.

- [ ] **Step 10: Run all unit tests**

```powershell
node --experimental-strip-types tests/test_curve.ts
foreach ($f in Get-ChildItem tests\test_*.js) { node $f }
```

Expected: all pass.

- [ ] **Step 11: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(app): wire curve editor state, engine calls, loadPalette migration"
```

---

### Task 7: Browser smoke test

- [ ] **Step 1: Start dev server**

```powershell
npm run dev
```

Open browser to `http://localhost:5173` (or whatever port Vite reports).

- [ ] **Step 2: Verify lightness curve editor**

1. Open any ramp's Advanced panel.
2. Confirm lightness curve SVG renders with curve line and two fixed endpoint dots.
3. Click "s-curve" chip — curve shape changes to S.
4. Click canvas interior — new anchor appears.
5. Drag the anchor — curve updates live.
6. Right-click the anchor — anchor removed.
7. Drag anchor off top edge — anchor removed.
8. Confirm no more than 4 midpoints can be added (5th click does nothing).

- [ ] **Step 3: Verify sat curve editor**

1. Open Advanced panel.
2. Sat curve renders with two draggable endpoints.
3. Click "bell" chip — curve peaks at midtones.
4. Drag endpoint up — endpoint v changes, ramp saturation at that end changes.
5. Click interior — midpoint added.
6. Right-click midpoint — removed.
7. Sat multiplier slider (flat slider on main ramp card) still works independently.

- [ ] **Step 4: Verify migration**

1. If there is a saved palette from before this branch, load it.
2. Lightness curve should show the old preset shape (migrated from string → CurvePoints).
3. Sat curve should default to flat.

- [ ] **Step 5: Verify preset chip highlighting**

1. Click any lightness preset chip — chip highlights with ✓.
2. Drag an anchor — chip stays highlighted only if still within epsilon of that preset.
3. Drag far off-preset — no chip highlighted (custom state).

- [ ] **Step 6: Final commit**

If any cosmetic fixes were needed during testing, commit them. Then tag completion:

```powershell
git add -A
git commit -m "fix(curve-editor): smoke test adjustments"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** lib/curve.ts, CurveEditor, ramp-engine, palette, RampAdvancedPanel, App.tsx state + migration + save + load — all spec sections covered.
- [x] **No placeholders:** All code steps have real code. Engine call in Task 2 notes rampId lookup pattern. No TBD.
- [x] **Type consistency:** `CurvePoints` used throughout. `evalCurve(points, t, yMin, yMax)` signature identical in Tasks 1, 2, 4. `LIGHTNESS_PRESETS`/`SAT_PRESETS` imported from `./lib/curve` in Tasks 2, 4, 5, 6 consistently. `presetToPoints` imported in Tasks 1 and 6.
- [x] **Deferred features not included:** per-ramp hue shift, lMin/lMax sliders, chroma envelope — absent.
