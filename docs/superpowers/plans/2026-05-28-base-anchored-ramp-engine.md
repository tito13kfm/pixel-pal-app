# Base-Anchored Ramp Engine + Editable Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the picked base color byte-for-byte identical across all three ramp styles and stable under shuffle, with styles reduced to two editable, per-palette-saved parameters (reach + chroma falloff).

**Architecture:** Rewrite the pure OKLCH engine in `src/lib/ramp-engine.ts` to anchor the base slot to the exact input hex and radiate shades outward (lightness-positioned distribution, base index clamped to `[1, N-2]`). `style` leaves the engine; the App resolves a style name + editable presets to `{reach, chromaFalloff}` and feeds a `hueJitter` scalar in place of the old HSL base pre-jitter. New per-palette `stylePresets` state persists in the palette payload.

**Tech Stack:** Vite + React 19 + TS, Vitest unit tests, Playwright e2e. `src/App.tsx` is `// @ts-nocheck` and ~7200 lines; the engine is fully unit-testable.

**Spec:** `docs/superpowers/specs/2026-05-28-base-anchored-ramp-design.md`

**Note:** `docs/` is gitignored, so this plan file is not committed. All commits below touch tracked `src/` and `tests/` files only.

---

## File Map

- `src/lib/ramp-engine.ts` — Rewrite. New `GenerateRampOpts` (`reach`, `chromaFalloff`, `hueJitter`; drop `style`), base-anchored math.
- `tests/unit/ramp-engine.spec.ts` — Rewrite to the new API + new behavioral guarantees.
- `src/lib/palette.ts` — Add `stylePresets?` to `SavedPalettePayload`.
- `src/App.tsx` — Module-level: `DEFAULT_STYLE_PRESETS`, `styleToScalars`, update `buildRampsForSnapshot`, `buildWorkingSnapshot`, `buildClassicSnapshot`. Component: `stylePresets` state, rewrite `generateRamp` adapter, memo deps, undo snapshot, save/load, style-tuning UI.

---

## Task 1: Rewrite the ramp engine (pure, unit-tested)

**Files:**
- Modify: `src/lib/ramp-engine.ts` (full rewrite)
- Test: `tests/unit/ramp-engine.spec.ts` (full rewrite)

- [ ] **Step 1: Rewrite the test file with the new API and guarantees**

Replace the entire contents of `tests/unit/ramp-engine.spec.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { generateRamp } from '../../src/lib/ramp-engine';
import { hexToOklch } from '../../src/lib/oklch';

const PUNCHY   = { reach: 1.00, chromaFalloff: 0.10 };
const BALANCED = { reach: 0.575, chromaFalloff: 0.475 };
const MUTED    = { reach: 0.15, chromaFalloff: 0.85 };

const baseOpts = (extra: object) => ({ size: 5, hueShiftStrength: 1.0, ...extra });

describe('generateRamp base-anchored shape', () => {
  it('returns exactly `size` shades', () => {
    expect(generateRamp('#c45c3a', baseOpts(PUNCHY))).toHaveLength(5);
  });

  it('each shade has hex, oklch, pinned, gamutClipped', () => {
    for (const s of generateRamp('#c45c3a', baseOpts(PUNCHY))) {
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof s.oklch.L).toBe('number');
      expect(typeof s.pinned).toBe('boolean');
      expect(typeof s.gamutClipped).toBe('boolean');
    }
  });

  it('pure function: same opts -> same output', () => {
    const a = generateRamp('#c45c3a', baseOpts(PUNCHY));
    const b = generateRamp('#c45c3a', baseOpts(PUNCHY));
    expect(a).toEqual(b);
  });

  it('invalid hex: returns N copies of input, no throw', () => {
    const shades = generateRamp('not-a-hex', baseOpts(PUNCHY));
    expect(shades).toHaveLength(5);
    for (const s of shades) expect(s.hex).toBe('not-a-hex');
  });
});

describe('base fidelity (the core guarantee)', () => {
  const bases = ['#c45c3a', '#3a5fc4', '#00b3b3', '#7a3a8e', '#e8e2d0', '#1a1420'];

  for (const base of bases) {
    it(`base hex appears verbatim and identically across styles for ${base}`, () => {
      const found: string[] = [];
      for (const preset of [PUNCHY, BALANCED, MUTED]) {
        const shades = generateRamp(base, baseOpts(preset));
        const hit = shades.find(s => s.hex === base.toLowerCase());
        expect(hit, `base ${base} missing in ramp`).toBeTruthy();
        found.push(hit!.hex);
      }
      expect(new Set(found).size).toBe(1); // identical in all three styles
    });
  }

  it('shuffle (hueJitter) never moves the base slot', () => {
    const base = '#c45c3a';
    const plain = generateRamp(base, baseOpts({ ...PUNCHY }));
    const jittered = generateRamp(base, baseOpts({ ...PUNCHY, hueJitter: 8 }));
    const plainBase = plain.find(s => s.hex === base.toLowerCase());
    const jitterBase = jittered.find(s => s.hex === base.toLowerCase());
    expect(plainBase).toBeTruthy();
    expect(jitterBase).toBeTruthy();
  });
});

describe('distribution guarantees', () => {
  for (const n of [4, 5, 6, 7, 8]) {
    it(`near-white base keeps >=1 shade each side at size ${n}`, () => {
      const shades = generateRamp('#f4f0e8', baseOpts({ ...BALANCED, size: n }));
      const baseIdx = shades.findIndex(s => s.hex === '#f4f0e8');
      expect(baseIdx).toBeGreaterThanOrEqual(1);
      expect(baseIdx).toBeLessThanOrEqual(n - 2);
    });
    it(`near-black base keeps >=1 shade each side at size ${n}`, () => {
      const shades = generateRamp('#140f1a', baseOpts({ ...BALANCED, size: n }));
      const baseIdx = shades.findIndex(s => s.hex === '#140f1a');
      expect(baseIdx).toBeGreaterThanOrEqual(1);
      expect(baseIdx).toBeLessThanOrEqual(n - 2);
    });
  }

  it('lightness is non-decreasing across the ramp', () => {
    const shades = generateRamp('#c45c3a', baseOpts(BALANCED));
    for (let i = 1; i < shades.length; i++) {
      expect(shades[i].oklch.L).toBeGreaterThanOrEqual(shades[i - 1].oklch.L - 1e-6);
    }
  });
});

describe('style semantics', () => {
  const base = '#c45c3a';

  it('reach ordering: punchy span >= balanced >= muted', () => {
    const span = (preset: object) => {
      const s = generateRamp(base, baseOpts(preset));
      return s[s.length - 1].oklch.L - s[0].oklch.L;
    };
    expect(span(PUNCHY)).toBeGreaterThanOrEqual(span(BALANCED) - 1e-6);
    expect(span(BALANCED)).toBeGreaterThanOrEqual(span(MUTED) - 1e-6);
  });

  it('chroma falloff: muted ends grayer than balanced grayer than punchy', () => {
    const endChroma = (preset: object) => {
      const s = generateRamp(base, baseOpts(preset));
      return (s[0].oklch.C + s[s.length - 1].oklch.C) / 2;
    };
    expect(endChroma(PUNCHY)).toBeGreaterThan(endChroma(BALANCED));
    expect(endChroma(BALANCED)).toBeGreaterThan(endChroma(MUTED));
  });

  it('base chroma is identical across styles (anchor is full chroma)', () => {
    const baseC = hexToOklch(base)!.C;
    for (const preset of [PUNCHY, BALANCED, MUTED]) {
      const s = generateRamp(base, baseOpts(preset));
      const hit = s.find(x => x.hex === base.toLowerCase())!;
      expect(Math.abs(hit.oklch.C - baseC)).toBeLessThan(1e-6);
    }
  });

  it('achromatic base: no hue shift, no NaN, chroma stays tiny', () => {
    const shades = generateRamp('#808080', baseOpts({ ...PUNCHY, hueJitter: 8 }));
    for (const s of shades) {
      expect(Number.isNaN(s.oklch.H)).toBe(false);
      expect(s.oklch.C).toBeLessThan(0.02);
    }
  });
});

describe('pins and hidden', () => {
  it('pin overrides output at the pinned index', () => {
    const shades = generateRamp('#c45c3a', baseOpts({ ...PUNCHY, pins: { 1: '#abcdef' } }));
    expect(shades[1].hex).toBe('#abcdef');
    expect(shades[1].pinned).toBe(true);
  });

  it('hidden indices dropped from output', () => {
    const shades = generateRamp('#c45c3a', baseOpts({ ...PUNCHY, hidden: [0, 4] }));
    expect(shades).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ramp-engine`
Expected: FAIL — current engine takes `style`, has no `reach`/`chromaFalloff`, and does not place the base hex verbatim. Multiple assertions fail (base-fidelity especially).

- [ ] **Step 3: Replace the engine with the base-anchored implementation**

Replace the entire contents of `src/lib/ramp-engine.ts` with:

```ts
import { hexToOklch, oklchToHex, gamutMap } from './oklch';
import type { Oklch, GamutStrategy } from './oklch';
import { evalCurve, LIGHTNESS_PRESETS, SAT_PRESETS } from './curve';
import type { CurvePoints } from './curve';

export interface GenerateRampOpts {
  reach: number;          // 0..1, lightness spread from base (wider = more contrast)
  chromaFalloff: number;  // 0..1, gray-out rate toward the ends
  size: number;
  hueShiftStrength: number;
  hueJitter?: number;     // per-ramp hue offset (shuffle); default 0
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

const L_FLOOR = 0.04;
const L_CEIL  = 0.96;
const STEP_DELTA = 0.05; // min lightness gap so the base reads distinct from neighbors

const lerp  = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function reachToCaps(reach: number): { darkCap: number; lightCap: number } {
  const r = clamp(reach, 0, 1);
  return {
    // Caps are kept within a moderate range so gamut clipping at extremes
    // doesn't overwhelm the chromaFalloff ordering.
    darkCap:  clamp(lerp(0.33, 0.12, r), L_FLOOR, L_CEIL),
    lightCap: clamp(lerp(0.76, 0.935, r), L_FLOOR, L_CEIL),
  };
}

function falloffParams(chromaFalloff: number): { floorFrac: number; exp: number } {
  const f = clamp(chromaFalloff, 0, 1);
  // exp < 1 (concave) grays midtones near the base fast; high falloff -> lower exp.
  return { floorFrac: lerp(0.92, 0.12, f), exp: lerp(1.0, 0.55, f) };
}

export function generateRamp(baseHex: string, opts: GenerateRampOpts): Shade[] {
  const base = hexToOklch(baseHex);
  if (!base) {
    return Array.from({ length: opts.size }, () => ({
      hex: baseHex, oklch: { L: 0, C: 0, H: 0 }, pinned: false, gamutClipped: false,
    }));
  }

  const N              = opts.size;
  const lightnessCurve = opts.lightnessCurve ?? LIGHTNESS_PRESETS.eased;
  const satCurve       = opts.satCurve ?? SAT_PRESETS.flat;
  const gamut          = opts.gamut ?? ('auto' as GamutStrategy);
  const satMult        = opts.satMultiplier ?? 1.0;
  const hueJitter      = opts.hueJitter ?? 0;
  const baseHexLower   = baseHex.toLowerCase();

  const { darkCap, lightCap } = reachToCaps(opts.reach);
  const { floorFrac, exp }    = falloffParams(opts.chromaFalloff);

  const darkBottom = clamp(Math.min(darkCap,  base.L - STEP_DELTA), L_FLOOR, base.L);
  const lightTop   = clamp(Math.max(lightCap, base.L + STEP_DELTA), base.L, L_CEIL);

  let baseIndex: number;
  if (N <= 1) {
    baseIndex = 0;
  } else {
    const span = lightTop - darkBottom;
    const frac = span > 1e-6 ? (base.L - darkBottom) / span : 0.5;
    baseIndex = clamp(Math.round(frac * (N - 1)), 1, N - 2);
  }

  const maxArm = Math.max(baseIndex, N - 1 - baseIndex) || 1;
  const shades: Shade[] = [];

  for (let i = 0; i < N; i++) {
    const pin = opts.pins?.[i];
    if (pin) {
      shades.push({ hex: pin, oklch: base, pinned: true, gamutClipped: false });
      continue;
    }
    if (i === baseIndex) {
      // Anchor: byte-for-byte the picked color. No curve, falloff, hue shift, or gamut map.
      shades.push({ hex: baseHexLower, oklch: base, pinned: false, gamutClipped: false });
      continue;
    }

    let L: number;
    if (i < baseIndex) {
      // Curve anchored at the far dark end (t=0), reaching base at t=1: small
      // step next to the base, widening toward the extreme.
      const t = i / baseIndex;
      L = darkBottom + (base.L - darkBottom) * evalCurve(lightnessCurve, t, 0, 1);
    } else {
      // Mirror of the dark side: anchored at the far light end so the spacing
      // is symmetric about the base (small step next to base, big step at end).
      const u = (N - 1 - i) / (N - 1 - baseIndex);
      L = lightTop - (lightTop - base.L) * evalCurve(lightnessCurve, u, 0, 1);
    }

    const dist       = Math.abs(i - baseIndex) / maxArm;
    const chromaMult = 1 - (1 - floorFrac) * Math.pow(dist, exp);
    const tGlobal    = N === 1 ? 0.5 : i / (N - 1);
    const C          = base.C * satMult * chromaMult * evalCurve(satCurve, tGlobal, 0, 2);

    let H = base.H;
    if (base.C >= 0.01) {
      const signedDist = (i - baseIndex) / maxArm;
      H = (base.H + signedDist * 15 * opts.hueShiftStrength + signedDist * hueJitter + 360) % 360;
    }

    const ideal: Oklch = { L, C, H };
    const mapped       = gamutMap(ideal, gamut);
    const wasClipped   = mapped.C < ideal.C - 1e-4;
    shades.push({ hex: oklchToHex(mapped), oklch: mapped, pinned: false, gamutClipped: wasClipped });
  }

  const hiddenSet = new Set(opts.hidden ?? []);
  return shades.filter((_, i) => !hiddenSet.has(i));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- ramp-engine`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ramp-engine.ts tests/unit/ramp-engine.spec.ts
git commit -m "feat(engine): base-anchored ramp generation with reach + chroma falloff"
```

---

## Task 2: App module-level — presets, snapshot builders, jitter relocation

**Files:**
- Modify: `src/App.tsx` (module scope, ~line 225 and ~line 515-623, ~line 3556-3578, ~line 3582-3600)

- [ ] **Step 1: Add module-level presets + style resolver**

Immediately after the `seededHueDelta` definition (ends ~line 230), add:

```ts
// Editable style presets: each style is two scalars consumed by the engine.
// Defaults reproduce the approved Punchy/Balanced/Muted look.
const DEFAULT_STYLE_PRESETS = {
  punchy:   { reach: 1.00, chromaFalloff: 0.10 },
  balanced: { reach: 0.575, chromaFalloff: 0.475 },
  muted:    { reach: 0.15, chromaFalloff: 0.85 },
};

const styleToScalars = (style, presets) => {
  const p = (presets && presets[style]) || DEFAULT_STYLE_PRESETS[style] || DEFAULT_STYLE_PRESETS.punchy;
  return { reach: p.reach, chromaFalloff: p.chromaFalloff };
};
```

- [ ] **Step 2: Update `buildRampsForSnapshot` destructure + engine call**

In the destructure block at `src/App.tsx:519-532`, add three fields so the helper can read shuffle inputs and presets. Change:

```ts
    gamutPerRamp = {},
  } = snapshot;
```

to:

```ts
    gamutPerRamp = {},
    shuffleSeed = 0,
    rampShuffleOffsets = {},
    stylePresets = DEFAULT_STYLE_PRESETS,
  } = snapshot;
```

Then replace the engine call at `src/App.tsx:609-617`:

```ts
  return baseColors.map((c, i) => {
    const shades = generateRampNew(resolveBase(c, i), {
      style,
      size: resolveSize(i),
      hueShiftStrength,
      lightnessCurve: effectiveLightnessCurves[i] ?? effectiveLightnessCurves[String(i)] ?? LIGHTNESS_PRESETS.eased,
      satCurve: satCurvePerRamp[i] ?? satCurvePerRamp[String(i)] ?? SAT_PRESETS.flat,
      gamut: gamutPerRamp[i] ?? gamutPerRamp[String(i)],
    });
```

with:

```ts
  return baseColors.map((c, i) => {
    const { reach, chromaFalloff } = styleToScalars(style, stylePresets);
    const effectiveSeed = (shuffleSeed || 0) + (rampShuffleOffsets[i] || 0);
    const hueJitter = effectiveSeed !== 0 ? seededHueDelta(effectiveSeed, i) : 0;
    const shades = generateRampNew(resolveBase(c, i), {
      reach,
      chromaFalloff,
      size: resolveSize(i),
      hueShiftStrength,
      hueJitter,
      lightnessCurve: effectiveLightnessCurves[i] ?? effectiveLightnessCurves[String(i)] ?? LIGHTNESS_PRESETS.eased,
      satCurve: satCurvePerRamp[i] ?? satCurvePerRamp[String(i)] ?? SAT_PRESETS.flat,
      gamut: gamutPerRamp[i] ?? gamutPerRamp[String(i)],
    });
```

- [ ] **Step 3: Stop baking jitter into base colors in `buildWorkingSnapshot`**

Replace `src/App.tsx:3556-3578` (`buildWorkingSnapshot`). Change the body from baking jitter into `baseColors` to passing raw `baseColors` plus the shuffle inputs and presets:

```ts
  const buildWorkingSnapshot = () => {
    return {
      baseColors,
      rampSize,
      shuffleSeed,
      overrides,
      rampSizeOverrides,
      rampSatOverrides,
      rampShuffleOffsets,
      hiddenShades,
      hardwareLock,
      hueShiftStrength,
      lightnessCurvePerRamp,
      satCurvePerRamp,
      gamutPerRamp,
      stylePresets,
    };
  };
```

(The `jitteredBaseColors` map and the now-unused local are removed; jitter is applied inside `buildRampsForSnapshot` via `hueJitter`, keeping the base anchored.)

- [ ] **Step 4: Add `stylePresets` to `buildClassicSnapshot`**

In `buildClassicSnapshot` (the returned object starting ~line 3585), add `stylePresets,` alongside the other live fields (so the side-by-side classic comparison uses the same tuned styles as the working palette). Add the line near `rampSize`:

```ts
      rampSize,
      stylePresets,
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: tsc passes (App is `@ts-nocheck`, so this checks the rest of the project) and Vite builds. No runtime test yet.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "refactor(app): module-level style presets + snapshot jitter relocation"
```

---

## Task 3: App component — state, adapter rewrite, memo deps

**Files:**
- Modify: `src/App.tsx` (component scope, ~line 1266, ~line 1568-1593)

- [ ] **Step 1: Add `stylePresets` state + reset**

Next to the other per-ramp state (after `gamutPerRamp` useState at ~line 1268), add:

```ts
  const [stylePresets, setStylePresets] = useState(DEFAULT_STYLE_PRESETS);
  const resetStylePresets = () => setStylePresets(DEFAULT_STYLE_PRESETS);
```

- [ ] **Step 2: Rewrite the `generateRamp` adapter (remove HSL pre-jitter, add hueJitter + presets)**

Replace `src/App.tsx:1568-1589` with:

```ts
  const generateRamp = (baseHex: string, numColors: number, style: 'punchy' | 'balanced' | 'muted', hueShiftStrength: number, rampIdx?: number): string[] => {
    const rampKey = rampIdx !== undefined ? String(rampIdx) : undefined;
    const gamut = rampKey !== undefined ? gamutPerRamp[rampKey] : undefined;
    const { reach, chromaFalloff } = styleToScalars(style, stylePresets);
    let hueJitter = 0;
    if (rampIdx !== undefined) {
      const effectiveSeed = shuffleSeed + (rampShuffleOffsets[rampIdx] || 0);
      if (effectiveSeed !== 0) hueJitter = seededHueDelta(effectiveSeed, rampIdx);
    }
    const shades = generateRampNew(baseHex, {
      reach,
      chromaFalloff,
      size: numColors,
      hueShiftStrength,
      hueJitter,
      lightnessCurve: rampKey !== undefined ? (lightnessCurvePerRamp[rampKey] ?? LIGHTNESS_PRESETS.eased) : LIGHTNESS_PRESETS.eased,
      satCurve: rampKey !== undefined ? (satCurvePerRamp[rampKey] ?? SAT_PRESETS.flat) : SAT_PRESETS.flat,
      gamut,
    });
    return shades.map(s => s.hex);
  };
```

(The old `jitteredBase` block using `hexToHsl`/`hslToHex` is gone. Leave the `hexToHsl`/`hslToHex` imports — they are still used by `resolveBase`, `buildWorkingSnapshot` removal notwithstanding, and `resolveBaseForRamp`.)

- [ ] **Step 3: Add `stylePresets` to the three ramp memo dependency arrays**

In each of the three memos at `src/App.tsx:1591`, `1592`, `1593`, add `stylePresets` to the dependency array. For example, change the `rampsPunchy` deps tail:

```ts
  ], [baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, activeHardware, hueShiftStrength, hueShiftStrengthPerRamp, lightnessCurvePerRamp, satCurvePerRamp, gamutPerRamp, shuffleSeed, rampShuffleOffsets]);
```

to:

```ts
  ], [baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, activeHardware, hueShiftStrength, hueShiftStrengthPerRamp, lightnessCurvePerRamp, satCurvePerRamp, gamutPerRamp, shuffleSeed, rampShuffleOffsets, stylePresets]);
```

Apply the identical `, stylePresets` addition to `rampsBalanced` (1592) and `rampsMuted` (1593).

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): per-palette editable style presets feed the ramp adapter"
```

---

## Task 4: Undo + persistence wiring

**Files:**
- Modify: `src/lib/palette.ts` (type)
- Modify: `src/App.tsx` (history snapshot ~3794, applyUndoSnapshot ~3825, save payload ~3974, loadPalette ~4219)

- [ ] **Step 1: Add `stylePresets` to the payload type**

In `src/lib/palette.ts`, inside `SavedPalettePayload` (after `advancedOpen?` at line 53), add:

```ts
  stylePresets?: {
    punchy:   { reach: number; chromaFalloff: number };
    balanced: { reach: number; chromaFalloff: number };
    muted:    { reach: number; chromaFalloff: number };
  };
```

- [ ] **Step 2: Track style presets in undo history**

In the history snapshot object (the `makeHistorySnapshot`/`getWorkingSnapshot` literal ending at `src/App.tsx:3794-3796`), add `stylePresets,` after `satCurvePerRamp,`:

```ts
    lightnessCurvePerRamp,
    satCurvePerRamp,
    stylePresets,
  });
```

In `applyUndoSnapshot` at `src/App.tsx:3826` (after `setSatCurvePerRamp(...)`), add:

```ts
    setStylePresets(snap.stylePresets ?? DEFAULT_STYLE_PRESETS);
```

- [ ] **Step 3: Save style presets into the palette payload**

In the save payload literal at `src/App.tsx:3974-3977` (after `gamutPerRamp,` / `advancedOpen,`), add:

```ts
      gamutPerRamp,
      advancedOpen,
      stylePresets,
```

- [ ] **Step 4: Restore style presets on load**

In `loadPalette`, next to where `gamutPerRamp` is restored (`setGamutPerRamp(...)` at `src/App.tsx:4219`), add a validated restore:

```ts
      const sp = parsed.stylePresets;
      const validPreset = (x) => x && typeof x.reach === 'number' && typeof x.chromaFalloff === 'number';
      setStylePresets(
        sp && validPreset(sp.punchy) && validPreset(sp.balanced) && validPreset(sp.muted)
          ? { punchy: sp.punchy, balanced: sp.balanced, muted: sp.muted }
          : DEFAULT_STYLE_PRESETS
      );
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/lib/palette.ts
git commit -m "feat(persist): save/restore editable style presets per palette + undo"
```

---

## Task 5: Style tuning UI (sliders + reset)

**Files:**
- Modify: `src/App.tsx` (Color Ramps section header area, near the per-ramp list ~line 6116-6131)

- [ ] **Step 1: Add the tuning panel above the ramp list**

Locate the Color Ramps section header controls (the `flex` button row containing `Expand All`/`Reset to Defaults`, ~line 6116-6131). Immediately AFTER that controls row's closing `</div>` (before the `activeHardware` banner at ~line 6133), insert a collapsible tuning block. Use the existing button styling tokens (`t.controlBtnDefault`, `t.controlBtnHover`) and `RotateCcw` icon (already imported):

```tsx
          <div className="mb-4 p-3 rounded border-2 border-cyan-700/40 bg-black/30">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Style Tuning</span>
              {JSON.stringify(stylePresets) !== JSON.stringify(DEFAULT_STYLE_PRESETS) && (
                <button
                  onClick={resetStylePresets}
                  title="Restore Punchy/Balanced/Muted to their default reach and chroma falloff"
                  className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${t.controlBtnDefault} ${t.controlBtnHover}`}
                >
                  <RotateCcw size={14} /> Reset Styles
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['punchy', 'balanced', 'muted'] as const).map((sk) => (
                <div key={sk} className="p-2 rounded bg-purple-900/30 border border-purple-700/40">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-100 mb-1">{sk}</div>
                  <label className="block text-[10px] text-cyan-300 uppercase tracking-wider">Reach: {Math.round(stylePresets[sk].reach * 100)}%</label>
                  <input
                    type="range" min={0} max={100} value={Math.round(stylePresets[sk].reach * 100)}
                    onChange={(e) => setStylePresets(prev => ({ ...prev, [sk]: { ...prev[sk], reach: Number(e.target.value) / 100 } }))}
                    className="w-full"
                  />
                  <label className="block text-[10px] text-cyan-300 uppercase tracking-wider mt-1">Chroma falloff: {Math.round(stylePresets[sk].chromaFalloff * 100)}%</label>
                  <input
                    type="range" min={0} max={100} value={Math.round(stylePresets[sk].chromaFalloff * 100)}
                    onChange={(e) => setStylePresets(prev => ({ ...prev, [sk]: { ...prev[sk], chromaFalloff: Number(e.target.value) / 100 } }))}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>
```

- [ ] **Step 2: Run dev server and verify the UI manually**

Run: `npm run dev`
Open the app. Confirm:
- Style Tuning panel shows three columns (Punchy/Balanced/Muted), each with two sliders.
- Dragging a slider live-updates the corresponding ramp rows in every ramp card.
- "Reset Styles" appears only after a slider moves off default and restores defaults when clicked.
- The picked base swatch (gold-outlined `base` label) stays the same hex while you drag sliders or shuffle a ramp.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ui): per-style reach + chroma falloff sliders with reset"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit + type build**

Run: `npm test` then `npm run build`
Expected: all vitest suites pass; tsc + Vite build clean.

- [ ] **Step 2: Desktop e2e**

Run: `npm run test:e2e`
Expected: Playwright desktop suite passes. If a test asserted old per-style band lightness values for a ramp, update the assertion to the new base-anchored output (the base hex now appears verbatim in the ramp).

- [ ] **Step 3: Web e2e**

Run: `npm run build:web` then `npx playwright test --config=playwright.web.config.ts`
Expected: web suite passes.

- [ ] **Step 4: Manual base-fidelity check (the whole point)**

In `npm run dev`: pick a vivid base, eyedrop or read the `base`-labeled swatch hex in Punchy, Balanced, and Muted — all three must equal the picked hex exactly. Shuffle the ramp; the base swatch hex must not change. Save the palette, reload it; tuned style sliders and base must restore.

- [ ] **Step 5: Final commit (only if Step 2/3 required test edits)**

```bash
git add tests
git commit -m "test: update e2e expectations for base-anchored ramps"
```

---

## Self-Review

- **Spec coverage:** Engine model (steps 1-6) → Task 1. Engine signature → Task 1. Approved presets → Tasks 1-2 (`DEFAULT_STYLE_PRESETS`). App adapter + jitter removal → Task 3. Editable presets state + UI → Tasks 3, 5. Persistence (`SavedPalettePayload`) → Task 4. Labels (no change) → noted, no task. Testing (7 cases) → Task 1 test file + Task 6. No migration → Task 4 (`?? DEFAULT_STYLE_PRESETS` fallbacks). All spec sections covered.
- **Placeholders:** none — every code step shows full code; no TBD/TODO.
- **Type consistency:** `reach`/`chromaFalloff`/`hueJitter` names match across engine, adapter, snapshot builder, payload type, and UI. `styleToScalars(style, presets)` and `DEFAULT_STYLE_PRESETS` referenced consistently. `stylePresets[sk].reach`/`.chromaFalloff` match the payload type shape.
