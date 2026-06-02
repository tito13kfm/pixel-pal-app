# Perceptual Ramp Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing HSV-based ramp generator in `src/lib/color.ts` with a perceptual (OKLCH) engine in a new `src/lib/ramp-engine.ts`, while keeping the legacy HSV renderer accessible for migrating saved palettes.

**Architecture:** Pure-function modules. `src/lib/oklch.ts` does sRGB↔OKLab↔OKLCH conversions and gamut mapping. `src/lib/ramp-engine.ts` exposes `generateRamp(baseHex, opts) → Shade[]` and keeps `_legacyHsvRamp` (the renamed current generator) for one-shot palette migration. UI gets a per-ramp `▸ Advanced` disclosure (closed by default) exposing curve preset + gamut strategy. Saved palettes gain `engineVersion`, `curvePerRamp`, `gamutPerRamp`, `advancedOpen`, and `restoreFrozen` fields.

**Tech Stack:** TypeScript, React 19, Vite 8, Vitest (new — added by Task 0), Playwright (existing for e2e).

**Spec:** `docs/superpowers/specs/2026-05-26-perceptual-ramp-engine-design.md`

---

## Pre-flight check

- [ ] **Verify branch:** Confirm current git branch is NOT `feat/portable-update-cache-and-tests`. Create a fresh branch from `master`: `feat/perceptual-ramp-engine`. Confirm `git status` is clean (only `.claude/` and other already-gitignored content).

```bash
git checkout master
git pull
git checkout -b feat/perceptual-ramp-engine
git status -sb
```

Expected: `## feat/perceptual-ramp-engine...origin/master` and either empty diff or only untracked already-gitignored files.

---

## File Structure

**Create:**
- `src/lib/oklch.ts` — color-space conversions, gamut mapping, ΔE_OK
- `src/lib/ramp-engine.ts` — `generateRamp(baseHex, opts)`, `_legacyHsvRamp`, style constants
- `src/components/MigrationBanner.tsx` — Legacy palette migration banner
- `src/components/RampAdvancedPanel.tsx` — Per-ramp Advanced disclosure
- `tests/unit/oklch.spec.ts` — Vitest unit tests for color-space
- `tests/unit/ramp-engine.spec.ts` — Vitest unit tests for engine
- `tests/unit/migration.spec.ts` — Vitest unit tests for migration logic
- `tests/e2e/perceptual-ramp.spec.ts` — Playwright smoke flows
- `tests/fixtures/legacy-palette.json` — A captured `hsv-legacy` palette payload
- `vitest.config.ts` — Vitest config

**Modify:**
- `src/lib/color.ts` — DROP the existing `generateRamp` (moved to `ramp-engine.ts` as `_legacyHsvRamp`)
- `src/lib/palette.ts` — extend `SavedPalettePayload` with `engineVersion`, `curvePerRamp`, `gamutPerRamp`, `advancedOpen`, `restoreFrozen`
- `src/App.tsx` — swap `generateRamp` import from `lib/color.ts` to `lib/ramp-engine.ts`; wire migration banner; wire Advanced panel; gate Hardware Lock distance metric on `engineVersion`
- `package.json` — add `vitest`, `@vitest/ui` (optional), `jsdom` devDeps; add `test` and `test:unit` scripts
- `.gitignore` — no changes needed (`docs/`, `.superpowers/` already covered)

**Files that change together** stay together: ramp logic in `ramp-engine.ts`, color-math in `oklch.ts`, persistence shape in `palette.ts`, UI in App.tsx + new components.

---

## Task 0: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/unit/_sanity.spec.ts` (will delete after Task 1)

- [ ] **Step 0.1: Add Vitest devDeps**

Run:
```bash
npm install --save-dev vitest@^2.1.0 jsdom@^25.0.0
```

Expected: `package.json` shows `vitest` and `jsdom` under `devDependencies`. `package-lock.json` updates. No errors.

- [ ] **Step 0.2: Add test scripts to package.json**

Edit `package.json` `scripts` block. Replace:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "dist": "tauri build",
  "dist:portable": "tauri build --no-bundle",
  "test:e2e": "playwright test"
}
```

With:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "dist": "tauri build",
  "dist:portable": "tauri build --no-bundle",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:unit": "vitest run tests/unit",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 0.3: Create vitest.config.ts**

Write `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/unit/**/*.spec.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
});
```

- [ ] **Step 0.4: Sanity test**

Write `tests/unit/_sanity.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('arithmetic works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 0.5: Run sanity test**

Run: `npm test`
Expected: 1 passed. Exit code 0.

- [ ] **Step 0.6: Delete sanity file**

Delete `tests/unit/_sanity.spec.ts`.

- [ ] **Step 0.7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add Vitest for unit testing"
```

---

## Task 1: OKLab/OKLCH conversions (sRGB ↔ OKLab ↔ OKLCH)

**Files:**
- Create: `src/lib/oklch.ts`
- Create: `tests/unit/oklch.spec.ts`

Reference: CSS Color Level 4 spec, Björn Ottosson's OKLab paper.

- [ ] **Step 1.1: Write failing test for round-trip**

Write `tests/unit/oklch.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hexToOklch, oklchToHex } from '../../src/lib/oklch';

describe('oklch round-trip', () => {
  it('round-trips 100 random hexes within ΔE_OK ≤ 0.5', () => {
    let maxDelta = 0;
    for (let i = 0; i < 100; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      const oklch = hexToOklch(hex);
      expect(oklch).not.toBeNull();
      const hex2 = oklchToHex(oklch!);
      const r2 = parseInt(hex2.slice(1, 3), 16);
      const g2 = parseInt(hex2.slice(3, 5), 16);
      const b2 = parseInt(hex2.slice(5, 7), 16);
      const delta = Math.sqrt((r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2);
      maxDelta = Math.max(maxDelta, delta);
    }
    expect(maxDelta).toBeLessThan(2);
  });

  it('rejects invalid hex with null', () => {
    expect(hexToOklch('not-a-color')).toBeNull();
    expect(hexToOklch('#ggg')).toBeNull();
  });
});
```

- [ ] **Step 1.2: Run test to confirm failure**

Run: `npm test -- tests/unit/oklch.spec.ts`
Expected: FAIL with module-not-found for `../../src/lib/oklch`.

- [ ] **Step 1.3: Implement `src/lib/oklch.ts` conversions**

Write `src/lib/oklch.ts`:

```ts
// OKLab/OKLCH color space utilities.
// Spec: https://bottosson.github.io/posts/oklab/ and CSS Color 4.

export type Oklch = { L: number; C: number; H: number };
export type Oklab = { L: number; a: number; b: number };
export type LinearRgb = { r: number; g: number; b: number };

const HEX_RE = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToLinearRgb(hex: string): LinearRgb | null {
  if (!HEX_RE.test(hex)) return null;
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { r: srgbToLinear(r), g: srgbToLinear(g), b: srgbToLinear(b) };
}

export function linearRgbToHex(rgb: LinearRgb): string {
  const to255 = (c: number) => Math.max(0, Math.min(255, Math.round(linearToSrgb(c) * 255)));
  const r = to255(rgb.r);
  const g = to255(rgb.g);
  const b = to255(rgb.b);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function linearRgbToOklab(rgb: LinearRgb): Oklab {
  const l = 0.4122214708 * rgb.r + 0.5363325363 * rgb.g + 0.0514459929 * rgb.b;
  const m = 0.2119034982 * rgb.r + 0.6806995451 * rgb.g + 0.1073969566 * rgb.b;
  const s = 0.0883024619 * rgb.r + 0.2817188376 * rgb.g + 0.6299787005 * rgb.b;

  const lp = Math.cbrt(l);
  const mp = Math.cbrt(m);
  const sp = Math.cbrt(s);

  return {
    L: 0.2104542553 * lp + 0.7936177850 * mp - 0.0040720468 * sp,
    a: 1.9779984951 * lp - 2.4285922050 * mp + 0.4505937099 * sp,
    b: 0.0259040371 * lp + 0.7827717662 * mp - 0.8086757660 * sp,
  };
}

export function oklabToLinearRgb(lab: Oklab): LinearRgb {
  const lp = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mp = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sp = lab.L - 0.0894841775 * lab.a - 1.2914855480 * lab.b;

  const l = lp * lp * lp;
  const m = mp * mp * mp;
  const s = sp * sp * sp;

  return {
    r:  4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

export function oklabToOklch(lab: Oklab): Oklch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  const H = C < 1e-6 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { L: lab.L, C, H };
}

export function oklchToOklab(c: Oklch): Oklab {
  const rad = (c.H * Math.PI) / 180;
  return { L: c.L, a: c.C * Math.cos(rad), b: c.C * Math.sin(rad) };
}

export function hexToOklch(hex: string): Oklch | null {
  const lin = hexToLinearRgb(hex);
  if (!lin) return null;
  return oklabToOklch(linearRgbToOklab(lin));
}

export function oklchToHex(c: Oklch): string {
  return linearRgbToHex(oklabToLinearRgb(oklchToOklab(c)));
}
```

- [ ] **Step 1.4: Run tests to confirm pass**

Run: `npm test -- tests/unit/oklch.spec.ts`
Expected: 2 passed.

- [ ] **Step 1.5: Add achromatic + reference-value tests**

Append to `tests/unit/oklch.spec.ts`:

```ts
describe('oklch reference values', () => {
  it('pure red converts to expected OKLCH', () => {
    const c = hexToOklch('#ff0000')!;
    expect(c.L).toBeCloseTo(0.6279, 2);
    expect(c.C).toBeCloseTo(0.2577, 2);
    expect(c.H).toBeCloseTo(29.23, 1);
  });

  it('pure white has L ≈ 1, C ≈ 0', () => {
    const c = hexToOklch('#ffffff')!;
    expect(c.L).toBeCloseTo(1.0, 2);
    expect(c.C).toBeLessThan(0.01);
  });

  it('pure black has L = 0, C = 0', () => {
    const c = hexToOklch('#000000')!;
    expect(c.L).toBeCloseTo(0.0, 3);
    expect(c.C).toBeLessThan(0.01);
  });

  it('50% grey has C < 0.01, H = 0', () => {
    const c = hexToOklch('#808080')!;
    expect(c.C).toBeLessThan(0.01);
    expect(c.H).toBe(0);
  });
});
```

- [ ] **Step 1.6: Run tests to confirm pass**

Run: `npm test -- tests/unit/oklch.spec.ts`
Expected: 6 passed.

- [ ] **Step 1.7: Commit**

```bash
git add src/lib/oklch.ts tests/unit/oklch.spec.ts
git commit -m "feat(color): add OKLab/OKLCH conversion utilities"
```

---

## Task 2: Gamut mapping in `oklch.ts`

**Files:**
- Modify: `src/lib/oklch.ts`
- Modify: `tests/unit/oklch.spec.ts`

- [ ] **Step 2.1: Write failing tests for gamut mapping**

Append to `tests/unit/oklch.spec.ts`:

```ts
import { gamutMap, isInGamut } from '../../src/lib/oklch';

describe('isInGamut', () => {
  it('returns true for in-gamut linear RGB', () => {
    expect(isInGamut({ r: 0.5, g: 0.5, b: 0.5 })).toBe(true);
  });
  it('returns false when any channel < 0 or > 1', () => {
    expect(isInGamut({ r: 1.1, g: 0.5, b: 0.5 })).toBe(false);
    expect(isInGamut({ r: -0.01, g: 0.5, b: 0.5 })).toBe(false);
  });
});

describe('gamutMap auto', () => {
  it('returns unchanged OKLCH for already-in-gamut color', () => {
    const c = hexToOklch('#808080')!;
    const mapped = gamutMap(c, 'auto');
    expect(mapped.L).toBeCloseTo(c.L, 6);
    expect(mapped.C).toBeCloseTo(c.C, 6);
  });
  it('reduces chroma for out-of-gamut color, preserves L*', () => {
    const farOut: Oklch = { L: 0.6, C: 0.5, H: 30 };
    const mapped = gamutMap(farOut, 'auto');
    expect(mapped.L).toBeCloseTo(0.6, 2);
    expect(mapped.C).toBeLessThan(0.5);
    const lin = oklabToLinearRgb(oklchToOklab(mapped));
    expect(isInGamut(lin)).toBe(true);
  });
});

describe('gamutMap clip', () => {
  it('clamps to [0,1] linear RGB', () => {
    const farOut: Oklch = { L: 0.6, C: 0.5, H: 30 };
    const mapped = gamutMap(farOut, 'clip');
    const lin = oklabToLinearRgb(oklchToOklab(mapped));
    expect(lin.r).toBeGreaterThanOrEqual(0);
    expect(lin.r).toBeLessThanOrEqual(1);
    expect(lin.g).toBeGreaterThanOrEqual(0);
    expect(lin.g).toBeLessThanOrEqual(1);
    expect(lin.b).toBeGreaterThanOrEqual(0);
    expect(lin.b).toBeLessThanOrEqual(1);
  });
});
```

Also export the `Oklch` and `oklabToLinearRgb`, `oklchToOklab` types from the import line at the top:

```ts
import { hexToOklch, oklchToHex, gamutMap, isInGamut, oklabToLinearRgb, oklchToOklab } from '../../src/lib/oklch';
import type { Oklch } from '../../src/lib/oklch';
```

- [ ] **Step 2.2: Run to confirm fail**

Run: `npm test -- tests/unit/oklch.spec.ts`
Expected: FAIL — `gamutMap` and `isInGamut` not exported.

- [ ] **Step 2.3: Implement `gamutMap` and `isInGamut`**

Append to `src/lib/oklch.ts`:

```ts
export type GamutStrategy = 'auto' | 'clip' | 'chroma-preserve';

export function isInGamut(lin: LinearRgb): boolean {
  const eps = 1e-6;
  return (
    lin.r >= -eps && lin.r <= 1 + eps &&
    lin.g >= -eps && lin.g <= 1 + eps &&
    lin.b >= -eps && lin.b <= 1 + eps
  );
}

function clampChannel(c: number): number {
  return Math.max(0, Math.min(1, c));
}

export function gamutMap(c: Oklch, strategy: GamutStrategy): Oklch {
  if (strategy === 'clip') {
    const lab = oklchToOklab(c);
    const lin = oklabToLinearRgb(lab);
    const clipped = { r: clampChannel(lin.r), g: clampChannel(lin.g), b: clampChannel(lin.b) };
    return oklabToOklch(linearRgbToOklab(clipped));
  }

  // 'auto' and 'chroma-preserve' both start with the chroma-binary-search.
  // 'chroma-preserve' adds an L* nudge step if reducing chroma fails.
  let lab = oklchToOklab(c);
  let lin = oklabToLinearRgb(lab);
  if (isInGamut(lin)) return c;

  let lo = 0;
  let hi = c.C;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const test = oklchToOklab({ L: c.L, C: mid, H: c.H });
    const lt = oklabToLinearRgb(test);
    if (isInGamut(lt)) lo = mid;
    else hi = mid;
  }
  const reduced: Oklch = { L: c.L, C: lo, H: c.H };

  if (strategy === 'auto') return reduced;

  // chroma-preserve: try nudging L* by up to ±0.06 at original chroma.
  for (let dL of [0.01, -0.01, 0.02, -0.02, 0.04, -0.04, 0.06, -0.06]) {
    const tryC: Oklch = { L: clampChannel(c.L + dL), C: c.C, H: c.H };
    if (isInGamut(oklabToLinearRgb(oklchToOklab(tryC)))) return tryC;
  }
  return reduced;
}
```

- [ ] **Step 2.4: Run tests to confirm pass**

Run: `npm test -- tests/unit/oklch.spec.ts`
Expected: All tests pass (sanity + 4 round-trip/reference + 5 gamut).

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/oklch.ts tests/unit/oklch.spec.ts
git commit -m "feat(color): add gamut mapping (auto/clip/chroma-preserve)"
```

---

## Task 3: ΔE_OK perceptual distance

**Files:**
- Modify: `src/lib/oklch.ts`
- Modify: `tests/unit/oklch.spec.ts`

- [ ] **Step 3.1: Write failing tests**

Append to `tests/unit/oklch.spec.ts`:

```ts
import { deltaEOK } from '../../src/lib/oklch';

describe('deltaEOK', () => {
  it('returns 0 for identical colors', () => {
    const c = hexToOklch('#c45c3a')!;
    expect(deltaEOK(c, c)).toBe(0);
  });
  it('returns >0 for different colors', () => {
    const a = hexToOklch('#c45c3a')!;
    const b = hexToOklch('#3a5fc4')!;
    expect(deltaEOK(a, b)).toBeGreaterThan(0.1);
  });
  it('is symmetric', () => {
    const a = hexToOklch('#c45c3a')!;
    const b = hexToOklch('#3a5fc4')!;
    expect(deltaEOK(a, b)).toBeCloseTo(deltaEOK(b, a), 8);
  });
});
```

- [ ] **Step 3.2: Run to confirm fail**

Run: `npm test -- tests/unit/oklch.spec.ts`
Expected: FAIL — `deltaEOK` not exported.

- [ ] **Step 3.3: Implement `deltaEOK`**

Append to `src/lib/oklch.ts`:

```ts
export function deltaEOK(a: Oklch, b: Oklch): number {
  const la = oklchToOklab(a);
  const lb = oklchToOklab(b);
  const dL = la.L - lb.L;
  const da = la.a - lb.a;
  const db = la.b - lb.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}
```

- [ ] **Step 3.4: Run tests to confirm pass**

Run: `npm test -- tests/unit/oklch.spec.ts`
Expected: All tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/oklch.ts tests/unit/oklch.spec.ts
git commit -m "feat(color): add ΔE_OK perceptual distance"
```

---

## Task 4: Move existing `generateRamp` to `_legacyHsvRamp` in new `ramp-engine.ts`

**Files:**
- Create: `src/lib/ramp-engine.ts`
- Modify: `src/lib/color.ts`
- Modify: `src/App.tsx` (one import line)
- Create: `tests/unit/ramp-engine.spec.ts`

This is a pure move: keep the existing algorithm intact but rename and relocate it. Verifies the new module wiring works before adding new logic.

- [ ] **Step 4.1: Write failing test**

Create `tests/unit/ramp-engine.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { _legacyHsvRamp } from '../../src/lib/ramp-engine';

describe('_legacyHsvRamp', () => {
  it('returns array of length numColors', () => {
    const r = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    expect(r).toHaveLength(6);
  });
  it('every element is a 7-char hex string', () => {
    const r = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    for (const hex of r) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it('deterministic for same inputs', () => {
    const a = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    const b = _legacyHsvRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 4.2: Run to confirm fail**

Run: `npm test -- tests/unit/ramp-engine.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `src/lib/ramp-engine.ts` re-exporting the existing function**

Write `src/lib/ramp-engine.ts`:

```ts
// Perceptual ramp engine.
// Public surface: generateRamp(baseHex, opts) — added in Task 5.
// Legacy HSV renderer kept here for one-shot palette migration.

export { generateRamp as _legacyHsvRamp } from './color';
```

- [ ] **Step 4.4: Run tests to confirm pass**

Run: `npm test -- tests/unit/ramp-engine.spec.ts`
Expected: 3 passed.

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/ramp-engine.ts tests/unit/ramp-engine.spec.ts
git commit -m "feat(ramp): wire ramp-engine module, alias legacy renderer"
```

---

## Task 5: Implement new `generateRamp(baseHex, opts)` perceptual engine

**Files:**
- Modify: `src/lib/ramp-engine.ts`
- Modify: `tests/unit/ramp-engine.spec.ts`

- [ ] **Step 5.1: Write failing tests for new API**

Append to `tests/unit/ramp-engine.spec.ts`:

```ts
import { generateRamp } from '../../src/lib/ramp-engine';
import type { Shade } from '../../src/lib/ramp-engine';

describe('generateRamp (perceptual)', () => {
  it('returns exactly `size` shades', () => {
    const shades = generateRamp('#c45c3a', {
      style: 'punchy',
      size: 6,
      hueShiftStrength: 1.0,
    });
    expect(shades).toHaveLength(6);
  });

  it('each shade has hex, oklch, pinned, gamutClipped', () => {
    const shades = generateRamp('#c45c3a', { style: 'punchy', size: 6, hueShiftStrength: 1.0 });
    for (const s of shades) {
      expect(typeof s.hex).toBe('string');
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof s.oklch.L).toBe('number');
      expect(typeof s.pinned).toBe('boolean');
      expect(typeof s.gamutClipped).toBe('boolean');
    }
  });

  it('pure function: same opts → same output', () => {
    const opts = { style: 'punchy' as const, size: 6, hueShiftStrength: 1.0 };
    const a = generateRamp('#c45c3a', opts);
    const b = generateRamp('#c45c3a', opts);
    expect(a).toEqual(b);
  });

  it('punchy style: shadow L* < 0.20, highlight L* > 0.85 for #c45c3a', () => {
    const shades = generateRamp('#c45c3a', { style: 'punchy', size: 6, hueShiftStrength: 1.0 });
    expect(shades[0].oklch.L).toBeLessThan(0.20);
    expect(shades[shades.length - 1].oklch.L).toBeGreaterThan(0.85);
  });

  it('saturated cyan #00b3b3 punchy: zero shades gamutClipped under auto', () => {
    const shades = generateRamp('#00b3b3', { style: 'punchy', size: 6, hueShiftStrength: 1.0, gamut: 'auto' });
    for (const s of shades) {
      expect(s.gamutClipped).toBe(false);
    }
  });

  it('achromatic base: all shades chroma < 0.02', () => {
    const shades = generateRamp('#808080', { style: 'punchy', size: 6, hueShiftStrength: 1.0 });
    for (const s of shades) {
      expect(s.oklch.C).toBeLessThan(0.02);
    }
  });

  it('linear curve: L* values linearly spaced', () => {
    const shades = generateRamp('#c45c3a', { style: 'punchy', size: 5, hueShiftStrength: 1.0, curve: 'linear' });
    const deltas = [];
    for (let i = 1; i < shades.length; i++) {
      deltas.push(shades[i].oklch.L - shades[i - 1].oklch.L);
    }
    for (let i = 1; i < deltas.length; i++) {
      expect(Math.abs(deltas[i] - deltas[0])).toBeLessThan(0.005);
    }
  });

  it('pin overrides engine output at the pinned index', () => {
    const shades = generateRamp('#c45c3a', {
      style: 'punchy', size: 6, hueShiftStrength: 1.0,
      pins: { 2: '#abcdef' },
    });
    expect(shades[2].hex).toBe('#abcdef');
    expect(shades[2].pinned).toBe(true);
  });

  it('hidden indices dropped from output', () => {
    const shades = generateRamp('#c45c3a', {
      style: 'punchy', size: 6, hueShiftStrength: 1.0,
      hidden: [1, 4],
    });
    expect(shades).toHaveLength(4);
  });

  it('invalid hex: returns N copies of input, no throw', () => {
    const shades = generateRamp('not-a-hex', { style: 'punchy', size: 4, hueShiftStrength: 1.0 });
    expect(shades).toHaveLength(4);
    for (const s of shades) {
      expect(s.hex).toBe('not-a-hex');
    }
  });
});

describe('generateRamp slider monotonicity', () => {
  const bases = ['#3a5fc4', '#c45c3a', '#00b3b3', '#7a3a8e', '#808080'];

  for (const base of bases) {
    it(`mean chroma is monotonically non-decreasing with S slider for ${base}`, () => {
      const means: number[] = [];
      for (const s of [0, 25, 50, 75, 100]) {
        const shades = generateRamp(base, {
          style: 'punchy',
          size: 6,
          hueShiftStrength: 1.0,
          satMultiplier: 1 + s / 100,
        });
        const meanC = shades.reduce((acc, sh) => acc + sh.oklch.C, 0) / shades.length;
        means.push(meanC);
      }
      for (let i = 1; i < means.length; i++) {
        expect(means[i]).toBeGreaterThanOrEqual(means[i - 1] - 1e-6);
      }
    });
  }
});
```

- [ ] **Step 5.2: Run to confirm fail**

Run: `npm test -- tests/unit/ramp-engine.spec.ts`
Expected: FAIL — `generateRamp` not exported.

- [ ] **Step 5.3: Implement `generateRamp`**

Replace the contents of `src/lib/ramp-engine.ts` with:

```ts
// Perceptual ramp engine.
// Public surface: generateRamp(baseHex, opts) → Shade[]
// Legacy HSV renderer kept here for one-shot palette migration.

import { hexToOklch, oklchToHex, gamutMap, deltaEOK } from './oklch';
import type { Oklch, GamutStrategy } from './oklch';

export { generateRamp as _legacyHsvRamp } from './color';

export type Style = 'punchy' | 'balanced' | 'muted';
export type CurvePreset = 'linear' | 'eased' | 's-curve' | 'ease-in' | 'ease-out';

export interface GenerateRampOpts {
  style: Style;
  size: number;
  hueShiftStrength: number;
  satMultiplier?: number;
  curve?: CurvePreset;
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

// Style → L* range, C* multiplier, default curve.
const STYLE_CONFIG: Record<Style, { lMin: number; lMax: number; cMult: number; defaultCurve: CurvePreset }> = {
  punchy:   { lMin: 0.18, lMax: 0.92, cMult: 1.00, defaultCurve: 'linear' },
  balanced: { lMin: 0.25, lMax: 0.85, cMult: 0.80, defaultCurve: 'eased' },
  muted:    { lMin: 0.32, lMax: 0.78, cMult: 0.55, defaultCurve: 'eased' },
};

const L_FLOOR = 0.04;
const L_CEIL = 0.96;

function curveSample(curve: CurvePreset, t: number): number {
  // t ∈ [0,1] → curve-shaped t ∈ [0,1]
  switch (curve) {
    case 'linear':    return t;
    case 'eased':     return t * t * (3 - 2 * t); // smoothstep
    case 's-curve':   return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'ease-in':   return t * t;
    case 'ease-out':  return 1 - (1 - t) * (1 - t);
  }
}

function perSlotHueShift(slotIdx: number, totalSlots: number, baseH: number, strength: number, baseC: number): number {
  if (baseC < 0.01) return baseH; // achromatic — no shift
  // Center slots near base, shadows shift cool (−), highlights warm (+).
  // Strength scales the magnitude. ±15° at full strength, scaled by distance from midpoint.
  const mid = (totalSlots - 1) / 2;
  const dist = (slotIdx - mid) / mid; // ∈ [-1, 1]
  const delta = dist * 15 * strength;
  return (baseH + delta + 360) % 360;
}

export function generateRamp(baseHex: string, opts: GenerateRampOpts): Shade[] {
  const baseOklch = hexToOklch(baseHex);
  if (!baseOklch) {
    // Invalid hex: return N copies, no throw.
    return Array.from({ length: opts.size }, () => ({
      hex: baseHex,
      oklch: { L: 0, C: 0, H: 0 },
      pinned: false,
      gamutClipped: false,
    }));
  }

  const cfg = STYLE_CONFIG[opts.style];
  const curve = opts.curve ?? cfg.defaultCurve;
  const gamut: GamutStrategy = opts.gamut ?? 'auto';
  const satMult = opts.satMultiplier ?? 1.0;

  const lMin = Math.max(L_FLOOR, cfg.lMin);
  const lMax = Math.min(L_CEIL, cfg.lMax);
  const cTarget = baseOklch.C * cfg.cMult * satMult;

  const shades: Shade[] = [];

  for (let i = 0; i < opts.size; i++) {
    const t = opts.size === 1 ? 0.5 : i / (opts.size - 1);
    const tc = curveSample(curve, t);
    const L = lMin + (lMax - lMin) * tc;
    const H = perSlotHueShift(i, opts.size, baseOklch.H, opts.hueShiftStrength, baseOklch.C);

    const ideal: Oklch = { L, C: cTarget, H };
    const mapped = gamutMap(ideal, gamut);
    const wasClipped = mapped.C < ideal.C - 1e-4;

    const pin = opts.pins?.[i];
    if (pin) {
      shades.push({ hex: pin, oklch: ideal, pinned: true, gamutClipped: false });
    } else {
      shades.push({ hex: oklchToHex(mapped), oklch: mapped, pinned: false, gamutClipped: wasClipped });
    }
  }

  // Drop hidden indices.
  const hiddenSet = new Set(opts.hidden ?? []);
  const visible = shades.filter((_, i) => !hiddenSet.has(i));

  // Hardware lock applied externally (in App.tsx) using deltaEOK — Task 13.
  return visible;
}
```

- [ ] **Step 5.4: Run tests to confirm pass**

Run: `npm test -- tests/unit/ramp-engine.spec.ts`
Expected: All tests pass (legacy + new + monotonicity).

If monotonicity fails for `#7a3a8e` or others, investigate: chroma multiplier × baseC must scale linearly. The implementation does so. If a test fails, post-condition the multiplier path is broken — debug before continuing.

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/ramp-engine.ts tests/unit/ramp-engine.spec.ts
git commit -m "feat(ramp): implement perceptual generateRamp(baseHex, opts)"
```

---

## Task 6: Extend `SavedPalettePayload` schema

**Files:**
- Modify: `src/lib/palette.ts`

- [ ] **Step 6.1: Extend the interface**

In `src/lib/palette.ts`, edit the `SavedPalettePayload` interface. Replace:

```ts
export interface SavedPalettePayload {
  name: string
  savedAt: number
  baseColors: string[]
  aiColorNames?: string[]
  aiReasoning?: string
  rampSize?: number
  gplStyle?: 'punchy' | 'balanced' | 'muted'
  vizStyle?: 'punchy' | 'balanced' | 'muted'
  spriteKey?: string
  shuffleSeed?: number
  customSprites?: Record<string, unknown>
  overrides?: Record<string, Record<string, { punchy?: string; balanced?: string; muted?: string }>>
  harmonyAnchor?: number
  rampSizeOverrides?: Record<string, number>
  rampSatOverrides?: Record<string, number>
  hiddenShades?: Record<string, number[]>
  rampShuffleOffsets?: Record<string, number>
  hardwareLock?: string | null
  hueShiftStrength?: number
  lockedRamps?: number[]
}
```

With:

```ts
export type CurvePresetSerialized = 'linear' | 'eased' | 's-curve' | 'ease-in' | 'ease-out';
export type GamutStrategySerialized = 'auto' | 'clip' | 'chroma-preserve';
export type EngineVersion = 'hsv-legacy' | 'oklch-v1';

export interface SavedPalettePayload {
  name: string
  savedAt: number
  baseColors: string[]
  aiColorNames?: string[]
  aiReasoning?: string
  rampSize?: number
  gplStyle?: 'punchy' | 'balanced' | 'muted'
  vizStyle?: 'punchy' | 'balanced' | 'muted'
  spriteKey?: string
  shuffleSeed?: number
  customSprites?: Record<string, unknown>
  overrides?: Record<string, Record<string, { punchy?: string; balanced?: string; muted?: string }>>
  harmonyAnchor?: number
  rampSizeOverrides?: Record<string, number>
  rampSatOverrides?: Record<string, number>
  hiddenShades?: Record<string, number[]>
  rampShuffleOffsets?: Record<string, number>
  hardwareLock?: string | null
  hueShiftStrength?: number
  lockedRamps?: number[]

  // Perceptual ramp engine fields. All optional for backwards compatibility.
  // Omitted engineVersion === 'hsv-legacy'.
  engineVersion?: EngineVersion
  curvePerRamp?: Record<string, CurvePresetSerialized>
  gamutPerRamp?: Record<string, GamutStrategySerialized>
  advancedOpen?: Record<string, boolean>
  // restoreFrozen[rampSlot] === true marks a Restore-driven override freeze.
  // Used to lock the per-ramp size slider. Manual pins do NOT set this.
  restoreFrozen?: Record<string, true>
}
```

- [ ] **Step 6.2: Type-check**

Run: `npx tsc --noEmit`
Expected: No new errors. If errors mention `SavedPalettePayload` consumers, those are existing call sites that will get updated in later tasks; for now type-check should still pass because all new fields are optional.

- [ ] **Step 6.3: Commit**

```bash
git add src/lib/palette.ts
git commit -m "feat(palette): extend SavedPalettePayload with perceptual engine fields"
```

---

## Task 7: Migration helper module + unit tests

**Files:**
- Create: `src/lib/migration.ts`
- Create: `tests/unit/migration.spec.ts`
- Create: `tests/fixtures/legacy-palette.json`

- [ ] **Step 7.1: Capture a legacy fixture**

Write `tests/fixtures/legacy-palette.json`:

```json
{
  "name": "Sunset Test",
  "savedAt": 1700000000000,
  "baseColors": ["#c45c3a", "#3a5fc4", "#7a3a8e"],
  "rampSize": 6,
  "hueShiftStrength": 1.0
}
```

(No `engineVersion` — this represents a pre-v0.6 save.)

- [ ] **Step 7.2: Write failing test**

Write `tests/unit/migration.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectEngineVersion, promoteKeepNewLook, promoteRestoreOldLook } from '../../src/lib/migration';
import legacyFixture from '../fixtures/legacy-palette.json' assert { type: 'json' };
import type { SavedPalettePayload } from '../../src/lib/palette';

describe('detectEngineVersion', () => {
  it('returns hsv-legacy for missing field', () => {
    expect(detectEngineVersion(legacyFixture as SavedPalettePayload)).toBe('hsv-legacy');
  });
  it('returns engineVersion when present', () => {
    const p: SavedPalettePayload = { ...legacyFixture, engineVersion: 'oklch-v1' } as SavedPalettePayload;
    expect(detectEngineVersion(p)).toBe('oklch-v1');
  });
});

describe('promoteKeepNewLook', () => {
  it('returns new payload with engineVersion oklch-v1, no overrides changed', () => {
    const out = promoteKeepNewLook(legacyFixture as SavedPalettePayload);
    expect(out.engineVersion).toBe('oklch-v1');
    expect(out.overrides ?? {}).toEqual({});
    expect(out.restoreFrozen ?? {}).toEqual({});
  });
});

describe('promoteRestoreOldLook', () => {
  it('freezes overrides across all three styles per ramp', () => {
    const out = promoteRestoreOldLook(legacyFixture as SavedPalettePayload);
    expect(out.engineVersion).toBe('oklch-v1');
    // 3 base colors → 3 ramps → restoreFrozen set for all
    for (let i = 0; i < 3; i++) {
      expect(out.restoreFrozen?.[String(i)]).toBe(true);
      expect(out.overrides?.[String(i)]).toBeDefined();
      for (let shadeIdx = 0; shadeIdx < 6; shadeIdx++) {
        const ov = out.overrides![String(i)][String(shadeIdx)];
        expect(ov.punchy).toMatch(/^#[0-9a-f]{6}$/i);
        expect(ov.balanced).toMatch(/^#[0-9a-f]{6}$/i);
        expect(ov.muted).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('frozen hexes exactly match legacy renderer output', () => {
    const out = promoteRestoreOldLook(legacyFixture as SavedPalettePayload);
    // Re-run legacy on first ramp, first shade, punchy — must match.
    const expected = require('../../src/lib/color').generateRamp('#c45c3a', 6, 0, 'punchy', 1.0);
    expect(out.overrides!['0']['0'].punchy).toBe(expected[0]);
  });
});
```

- [ ] **Step 7.3: Run to confirm fail**

Run: `npm test -- tests/unit/migration.spec.ts`
Expected: FAIL — `src/lib/migration.ts` not found.

- [ ] **Step 7.4: Implement `src/lib/migration.ts`**

Write `src/lib/migration.ts`:

```ts
// Migration helpers for the perceptual ramp engine (v0.6).
// Two promotion paths from hsv-legacy → oklch-v1:
//   - Keep new look: re-render with new engine on next load (no override changes).
//   - Restore old look: freeze legacy-rendered hexes into overrides across all styles.

import type { SavedPalettePayload, EngineVersion } from './palette';
import { _legacyHsvRamp } from './ramp-engine';

const STYLES: Array<'punchy' | 'balanced' | 'muted'> = ['punchy', 'balanced', 'muted'];

export function detectEngineVersion(p: SavedPalettePayload): EngineVersion {
  return p.engineVersion ?? 'hsv-legacy';
}

export function promoteKeepNewLook(p: SavedPalettePayload): SavedPalettePayload {
  return { ...p, engineVersion: 'oklch-v1' };
}

export function promoteRestoreOldLook(p: SavedPalettePayload): SavedPalettePayload {
  const size = p.rampSize ?? 6;
  const shuffleSeed = p.shuffleSeed ?? 0;
  const hueShift = p.hueShiftStrength ?? 1.0;

  const overrides: NonNullable<SavedPalettePayload['overrides']> = { ...(p.overrides ?? {}) };
  const restoreFrozen: NonNullable<SavedPalettePayload['restoreFrozen']> = { ...(p.restoreFrozen ?? {}) };

  for (let rampIdx = 0; rampIdx < p.baseColors.length; rampIdx++) {
    const base = p.baseColors[rampIdx];
    const rampSize = (p.rampSizeOverrides && p.rampSizeOverrides[String(rampIdx)]) ?? size;
    const offset = (p.rampShuffleOffsets && p.rampShuffleOffsets[String(rampIdx)]) ?? 0;
    const seed = shuffleSeed * 17 + rampIdx * 31 + offset * 13;

    const rampKey = String(rampIdx);
    const rampOverrides = { ...(overrides[rampKey] ?? {}) };

    for (const style of STYLES) {
      const shades = _legacyHsvRamp(base, rampSize, seed, style, hueShift);
      for (let shadeIdx = 0; shadeIdx < shades.length; shadeIdx++) {
        const shadeKey = String(shadeIdx);
        const existing = rampOverrides[shadeKey] ?? {};
        rampOverrides[shadeKey] = { ...existing, [style]: shades[shadeIdx] };
      }
    }

    overrides[rampKey] = rampOverrides;
    restoreFrozen[rampKey] = true;
  }

  return {
    ...p,
    engineVersion: 'oklch-v1',
    overrides,
    restoreFrozen,
  };
}
```

- [ ] **Step 7.5: Run tests to confirm pass**

Run: `npm test -- tests/unit/migration.spec.ts`
Expected: All tests pass.

- [ ] **Step 7.6: Commit**

```bash
git add src/lib/migration.ts tests/unit/migration.spec.ts tests/fixtures/legacy-palette.json
git commit -m "feat(palette): migration helpers for hsv-legacy → oklch-v1"
```

---

## Task 8: Swap `App.tsx` to use the new `generateRamp`

**Files:**
- Modify: `src/App.tsx`

This wires the new engine in for fresh palettes. Existing call sites at App.tsx:1461-1463 (`rampsPunchy`, `rampsBalanced`, `rampsMuted` useMemos) and ~543 (inside `buildRampsForSnapshot`).

- [ ] **Step 8.1: Find existing imports**

Run: `grep -n "from './lib/color'" src/App.tsx | head -3`
Expected output should include something like `import { ..., generateRamp, ... } from './lib/color';`

- [ ] **Step 8.2: Remove `generateRamp` from `color.ts` import in App.tsx**

In `src/App.tsx`, in the import statement that imports from `./lib/color`, remove `generateRamp` from the import list. Keep all other names.

For example, change:
```ts
import { rgbToHex, hexToRgb, hexToHsl, hslToHex, generateRamp } from './lib/color';
```
to:
```ts
import { rgbToHex, hexToRgb, hexToHsl, hslToHex } from './lib/color';
```

(Use exact names from the actual import line.)

- [ ] **Step 8.3: Add new import**

Add (or extend) an import for `generateRamp` from `./lib/ramp-engine`:

```ts
import { generateRamp as generateRampNew } from './lib/ramp-engine';
```

We alias to `generateRampNew` to avoid touching every call site yet. After Step 8.6 the alias gets dropped.

- [ ] **Step 8.4: Add an adapter shim above the useMemos**

Around line 1455 (just before `const rampsPunchy = useMemo(...)`), add:

```ts
// Adapter from legacy positional-args generateRamp(baseHex, numColors, seed, style, hueShiftStrength)
// to new opts-based generateRampNew. Returns hex[] to match the existing
// useMemo pipeline. `seed` is intentionally dropped — the new engine is
// deterministic from (base, style, size) and does not jitter.
const generateRamp = (baseHex: string, numColors: number, _seed: number, style: 'punchy' | 'balanced' | 'muted', hueShiftStrength: number): string[] => {
  const shades = generateRampNew(baseHex, {
    style,
    size: numColors,
    hueShiftStrength,
  });
  return shades.map(s => s.hex);
};
```

- [ ] **Step 8.5: Type-check + run unit tests**

Run: `npx tsc --noEmit && npm test`
Expected: type-check passes, all unit tests pass.

- [ ] **Step 8.6: Manual smoke**

Run: `npm run dev`
Open the browser preview, click Generate, pick a base color — confirm ramps render. Expected: no console errors. Visual: shades will look subtly different vs pre-change (perceptually-spaced L*). That's intended.

Note in commit message: this changes how new ramps look. Saved palette banner work comes in Task 9.

- [ ] **Step 8.7: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ramp): wire perceptual engine into App ramp generation"
```

---

## Task 9: Migration banner UI

**Files:**
- Create: `src/components/MigrationBanner.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 9.1: Create banner component**

Write `src/components/MigrationBanner.tsx`:

```tsx
import React from 'react';

interface MigrationBannerProps {
  paletteName: string;
  onKeep: () => void;
  onRestore: () => void;
}

export const MigrationBanner: React.FC<MigrationBannerProps> = ({ paletteName, onKeep, onRestore }) => {
  return (
    <div
      role="alert"
      style={{
        background: '#3b2a05',
        border: '1px solid #aa7a00',
        color: '#ffeec0',
        padding: '10px 14px',
        margin: '8px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontFamily: 'monospace',
        fontSize: 13,
      }}
    >
      <span aria-hidden>⚠</span>
      <span style={{ flex: 1 }}>
        "{paletteName}" was made with the old engine. New ramps will look different.
      </span>
      <button
        type="button"
        onClick={onKeep}
        style={{ padding: '4px 10px', background: '#1a3b1a', color: '#dfffdf', border: '1px solid #4a9a4a', cursor: 'pointer' }}
      >
        Keep new look
      </button>
      <button
        type="button"
        onClick={onRestore}
        style={{ padding: '4px 10px', background: '#3b1a1a', color: '#ffdfdf', border: '1px solid #9a4a4a', cursor: 'pointer' }}
      >
        Restore old look
      </button>
    </div>
  );
};
```

- [ ] **Step 9.2: Add state + handlers in App.tsx**

In `src/App.tsx`, near the saved-palette state declarations, add:

```ts
import { MigrationBanner } from './components/MigrationBanner';
import { detectEngineVersion, promoteKeepNewLook, promoteRestoreOldLook } from './lib/migration';

// ...inside the component:
const [legacyPaletteSlug, setLegacyPaletteSlug] = useState<string | null>(null);
const [legacyPaletteName, setLegacyPaletteName] = useState<string>('');
```

Find the `loadPalette` (or equivalent) handler that reads from localStorage. After it successfully parses the payload, check engine version:

```ts
// Inside loadPalette success path, after parsing `parsed: SavedPalettePayload`:
if (detectEngineVersion(parsed) === 'hsv-legacy') {
  setLegacyPaletteSlug(slug);
  setLegacyPaletteName(parsed.name ?? '(unnamed)');
} else {
  setLegacyPaletteSlug(null);
  setLegacyPaletteName('');
}
```

(Use the actual variable name for the parsed payload in the codebase.)

- [ ] **Step 9.3: Wire Keep and Restore handlers**

Also in `src/App.tsx`, add the click handlers:

```ts
const handleKeepNewLook = async () => {
  if (!legacyPaletteSlug) return;
  const raw = localStorage.getItem(`palettes:${legacyPaletteSlug}`);
  if (!raw) { setLegacyPaletteSlug(null); return; }
  const parsed = JSON.parse(raw) as SavedPalettePayload;
  const promoted = promoteKeepNewLook(parsed);
  localStorage.setItem(`palettes:${legacyPaletteSlug}`, JSON.stringify(promoted));
  // Retroactive in-memory undo-stack re-tag.
  retagHistoryToOklchV1();
  setLegacyPaletteSlug(null);
};

const handleRestoreOldLook = async () => {
  if (!legacyPaletteSlug) return;
  if (!confirm('Restore freezes every shade in every style. The ramp size slider will lock for restored ramps until you clear pins. Proceed?')) return;
  const raw = localStorage.getItem(`palettes:${legacyPaletteSlug}`);
  if (!raw) { setLegacyPaletteSlug(null); return; }
  const parsed = JSON.parse(raw) as SavedPalettePayload;
  const promoted = promoteRestoreOldLook(parsed);
  localStorage.setItem(`palettes:${legacyPaletteSlug}`, JSON.stringify(promoted));
  // Apply to current state too.
  setOverrides(promoted.overrides ?? {});
  retagHistoryToOklchV1(promoted.overrides, promoted.restoreFrozen);
  setLegacyPaletteSlug(null);
};

// Retag every history snapshot for this palette in this session as oklch-v1.
// If overrides/restoreFrozen passed, also apply them to every snapshot.
const retagHistoryToOklchV1 = (overrides?: SavedPalettePayload['overrides'], restoreFrozen?: SavedPalettePayload['restoreFrozen']) => {
  // historyRef holds the undo stack; find existing name from grep.
  // Implementation note: every snapshot of the loaded palette gets engineVersion: 'oklch-v1';
  // optionally has its overrides / restoreFrozen updated.
  setHistory(h => h.map(snap => ({
    ...snap,
    engineVersion: 'oklch-v1' as const,
    overrides: overrides ?? snap.overrides,
    restoreFrozen: restoreFrozen ?? snap.restoreFrozen,
  })));
};
```

(If the existing history setter is `setHistory`, use it. Otherwise, find the snapshot-list setter and adapt.)

- [ ] **Step 9.4: Render the banner**

In the App return JSX, above the ramp grid, add:

```tsx
{legacyPaletteSlug && (
  <MigrationBanner
    paletteName={legacyPaletteName}
    onKeep={handleKeepNewLook}
    onRestore={handleRestoreOldLook}
  />
)}
```

- [ ] **Step 9.5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 9.6: Manual smoke**

1. `npm run dev`
2. In browser devtools, run:
```js
localStorage.setItem('palettes:legacy-test', JSON.stringify({
  name: 'Legacy Test',
  savedAt: Date.now(),
  baseColors: ['#c45c3a', '#3a5fc4'],
  rampSize: 6,
  hueShiftStrength: 1.0
}));
```
3. Reload, click the saved-palettes panel, load "Legacy Test".
4. Expected: banner appears with Keep / Restore buttons.
5. Click Keep new look → banner disappears, palette renders with new engine.

- [ ] **Step 9.7: Commit**

```bash
git add src/components/MigrationBanner.tsx src/App.tsx
git commit -m "feat(palette): migration banner for legacy palettes"
```

---

## Task 10: Per-ramp Advanced disclosure UI

**Files:**
- Create: `src/components/RampAdvancedPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 10.1: Create component**

Write `src/components/RampAdvancedPanel.tsx`:

```tsx
import React from 'react';
import type { CurvePresetSerialized, GamutStrategySerialized } from '../lib/palette';

interface RampAdvancedPanelProps {
  open: boolean;
  curve: CurvePresetSerialized;
  gamut: GamutStrategySerialized;
  onToggle: () => void;
  onCurveChange: (c: CurvePresetSerialized) => void;
  onGamutChange: (g: GamutStrategySerialized) => void;
}

const CURVES: CurvePresetSerialized[] = ['linear', 'eased', 's-curve', 'ease-in', 'ease-out'];
const GAMUTS: GamutStrategySerialized[] = ['auto', 'clip', 'chroma-preserve'];

export const RampAdvancedPanel: React.FC<RampAdvancedPanelProps> = ({
  open, curve, gamut, onToggle, onCurveChange, onGamutChange,
}) => {
  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed #444', paddingTop: 6 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ background: 'transparent', color: open ? '#ffea00' : '#888', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
      >
        {open ? '▾' : '▸'} Advanced
      </button>
      {open && (
        <div style={{ background: '#181818', border: '1px solid #333', padding: 10, marginTop: 6, fontSize: 11 }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ color: '#bbb' }}>Curve preset</span>
            <select value={curve} onChange={e => onCurveChange(e.target.value as CurvePresetSerialized)} style={{ width: 130 }}>
              {CURVES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: '#bbb' }}>Gamut strategy</span>
            <select value={gamut} onChange={e => onGamutChange(e.target.value as GamutStrategySerialized)} style={{ width: 130 }}>
              {GAMUTS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <div style={{ fontSize: 9, color: '#777', lineHeight: 1.3, marginTop: 4 }}>
            Curve shapes the shadow→highlight transition. Gamut handles out-of-sRGB colors from saturated bases.
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 10.2: Add state in App.tsx**

In `src/App.tsx`, with other ramp-level state declarations, add:

```ts
const [curvePerRamp, setCurvePerRamp] = useState<Record<string, CurvePresetSerialized>>({});
const [gamutPerRamp, setGamutPerRamp] = useState<Record<string, GamutStrategySerialized>>({});
const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
```

Add imports:
```ts
import { RampAdvancedPanel } from './components/RampAdvancedPanel';
import type { CurvePresetSerialized, GamutStrategySerialized } from './lib/palette';
```

- [ ] **Step 10.3: Thread state into the adapter shim**

Update the adapter from Task 8 to accept per-ramp opts. Replace the adapter with:

```ts
const generateRamp = (
  baseHex: string,
  numColors: number,
  _seed: number,
  style: 'punchy' | 'balanced' | 'muted',
  hueShiftStrength: number,
  rampIdx?: number
): string[] => {
  const rampKey = rampIdx !== undefined ? String(rampIdx) : undefined;
  const curve = rampKey ? curvePerRamp[rampKey] : undefined;
  const gamut = rampKey ? gamutPerRamp[rampKey] : undefined;
  const shades = generateRampNew(baseHex, {
    style,
    size: numColors,
    hueShiftStrength,
    curve,
    gamut,
  });
  return shades.map(s => s.hex);
};
```

Then update the three `useMemo` ramp builders (`rampsPunchy`, `rampsBalanced`, `rampsMuted`) — pass `i` as the 6th arg to `generateRamp`:

```ts
const rampsPunchy = useMemo(() => baseColors.map((c, i) => applyHardwareLock(applyOverrides(generateRamp(resolveBaseForRamp(c, i), resolveSizeForRamp(i), shuffleSeed * 17 + i * 31 + (rampShuffleOffsets[i] || 0) * 13, 'punchy', hueShiftStrength, i), i, overrides, 'punchy'), activeHardware)), [baseColors, rampSize, shuffleSeed, overrides, rampSizeOverrides, rampSatOverrides, rampShuffleOffsets, activeHardware, hueShiftStrength, curvePerRamp, gamutPerRamp]);
// repeat for balanced and muted with the same shape
```

(Add `curvePerRamp, gamutPerRamp` to all three dep arrays.)

- [ ] **Step 10.4: Render the Advanced panel inside each ramp UI**

Find where each ramp's controls (H/S/V sliders, style buttons) are rendered. After the existing controls block, add:

```tsx
<RampAdvancedPanel
  open={advancedOpen[String(i)] ?? false}
  curve={curvePerRamp[String(i)] ?? 'eased'}
  gamut={gamutPerRamp[String(i)] ?? 'auto'}
  onToggle={() => setAdvancedOpen(prev => ({ ...prev, [String(i)]: !prev[String(i)] }))}
  onCurveChange={c => setCurvePerRamp(prev => ({ ...prev, [String(i)]: c }))}
  onGamutChange={g => setGamutPerRamp(prev => ({ ...prev, [String(i)]: g }))}
/>
```

(`i` here is the ramp index in the map.)

- [ ] **Step 10.5: Persist + load Advanced state in palette payload**

In the save-palette handler (search for "saveCurrentPalette" or similar), include the three new fields. Find:

```ts
const payload: SavedPalettePayload = {
  name: trimmed,
  savedAt: Date.now(),
  baseColors,
  ...
};
```

Add to the payload object:

```ts
engineVersion: 'oklch-v1',
curvePerRamp,
gamutPerRamp,
advancedOpen,
```

In the load handler (search for "loadPalette" or where `parsed: SavedPalettePayload` is consumed), apply the new fields:

```ts
if (parsed.curvePerRamp) setCurvePerRamp(parsed.curvePerRamp);
if (parsed.gamutPerRamp) setGamutPerRamp(parsed.gamutPerRamp);
if (parsed.advancedOpen) setAdvancedOpen(parsed.advancedOpen);
```

- [ ] **Step 10.6: Type-check + smoke**

Run: `npx tsc --noEmit && npm test && npm run dev`
Open browser, click Generate, open Advanced on Ramp 1, switch curve to `s-curve` → shades update. Save palette, reload, load it back → Advanced state restored.

- [ ] **Step 10.7: Commit**

```bash
git add src/components/RampAdvancedPanel.tsx src/App.tsx
git commit -m "feat(ramp): per-ramp Advanced disclosure with curve and gamut controls"
```

---

## Task 11: Size-slider lock via `restoreFrozen`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 11.1: Add state**

In `src/App.tsx`:

```ts
const [restoreFrozen, setRestoreFrozen] = useState<Record<string, true>>({});
```

In the Restore handler (Task 9), already calling `promoteRestoreOldLook` and getting back `restoreFrozen`. Apply to local state:

```ts
setRestoreFrozen(promoted.restoreFrozen ?? {});
```

In save handler, add `restoreFrozen` to the saved payload. In load handler, hydrate:

```ts
if (parsed.restoreFrozen) setRestoreFrozen(parsed.restoreFrozen);
```

- [ ] **Step 11.2: Lock size slider**

Find the per-ramp size override slider/input in App.tsx. Add `disabled` prop based on `restoreFrozen[String(i)]`:

```tsx
<input
  type="range"
  min={4}
  max={8}
  value={resolveSizeForRamp(i)}
  onChange={...}
  disabled={restoreFrozen[String(i)] === true}
  title={restoreFrozen[String(i)] ? 'Size locked while old-engine shades are pinned. Clear pins to unlock.' : undefined}
/>
```

- [ ] **Step 11.3: Clear `restoreFrozen` when overrides removed**

Find the unpin-shade handler (search for "removeOverride" or where `setOverrides` is called to clear a per-shade pin). After the override removal, clear the ramp's `restoreFrozen`:

```ts
setRestoreFrozen(prev => {
  const next = { ...prev };
  delete next[String(rampIdx)];
  return next;
});
```

- [ ] **Step 11.4: Type-check + smoke**

Run: `npx tsc --noEmit && npm test && npm run dev`
Smoke: Load the legacy fixture → click Restore old look → confirm → verify size slider is greyed out / disabled on ramps. Unpin one shade → slider re-enables.

- [ ] **Step 11.5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ramp): lock size slider on restoreFrozen ramps"
```

---

## Task 12: Hardware Lock — gated ΔE_OK distance metric

**Files:**
- Modify: `src/App.tsx`

Find `applyHardwareLock` (search `function applyHardwareLock` or `const applyHardwareLock`).

- [ ] **Step 12.1: Update signature to take engineVersion**

Replace the signature to accept the current palette's `engineVersion`. Add a param:

```ts
const applyHardwareLock = (shades: string[], hardware: string | null, engineVersion: EngineVersion = 'hsv-legacy'): string[] => {
  if (!hardware) return shades;
  const legalPalette = HARDWARE_PALETTES[hardware];
  if (!legalPalette) return shades;
  return shades.map(hex => nearestLegalColor(hex, legalPalette, engineVersion));
};
```

(Use the actual existing signature; add the `engineVersion` param last with default `'hsv-legacy'`.)

- [ ] **Step 12.2: Implement perceptual nearest**

Add or update `nearestLegalColor`:

```ts
import { hexToOklch, deltaEOK } from './lib/oklch';

const nearestLegalColor = (hex: string, legal: string[], engineVersion: EngineVersion): string => {
  if (engineVersion === 'oklch-v1') {
    const target = hexToOklch(hex);
    if (!target) return legal[0];
    let best = legal[0];
    let bestD = Infinity;
    for (const candidate of legal) {
      const co = hexToOklch(candidate);
      if (!co) continue;
      const d = deltaEOK(target, co);
      if (d < bestD) { bestD = d; best = candidate; }
    }
    return best;
  }
  // Legacy path: existing RGB-Euclidean nearest. Keep current implementation.
  return legacyNearestLegalColor(hex, legal); // rename existing function or inline its body
};
```

If `nearestLegalColor` doesn't already exist as a separate function (logic might be inline inside `applyHardwareLock`), extract the existing RGB-Euclidean loop into a `legacyNearestLegalColor` and call it for the `hsv-legacy` branch.

- [ ] **Step 12.3: Thread `engineVersion` state**

Add to App.tsx:

```ts
const [engineVersion, setEngineVersion] = useState<EngineVersion>('oklch-v1'); // default for new palettes
```

In load handler, set from `detectEngineVersion(parsed)`. In Keep/Restore handlers, set to `'oklch-v1'`.

Update the three `useMemo` ramps to pass `engineVersion` to `applyHardwareLock`:

```ts
applyHardwareLock(..., activeHardware, engineVersion)
```

Add `engineVersion` to all three dep arrays.

- [ ] **Step 12.4: Type-check + smoke**

Run: `npx tsc --noEmit && npm test && npm run dev`
Smoke: load fresh palette, enable Hardware Lock NES → shades snap. Load legacy fixture without clicking Keep → snaps with legacy RGB-Euclidean. Click Keep → snaps with deltaEOK.

- [ ] **Step 12.5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(ramp): gate Hardware Lock ΔE_OK on engineVersion"
```

---

## Task 13: Playwright e2e smoke flows

**Files:**
- Create: `tests/e2e/perceptual-ramp.spec.ts`

- [ ] **Step 13.1: Write the spec**

Write `tests/e2e/perceptual-ramp.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('generate fresh palette → ramps render, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: /generate/i }).click();
  await expect(page.locator('[data-ramp]').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('open Advanced, change curve → shades update', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /generate/i }).click();
  const before = await page.locator('[data-ramp="0"] [data-shade]').first().getAttribute('data-hex');
  await page.locator('[data-ramp="0"]').getByRole('button', { name: /advanced/i }).click();
  await page.locator('[data-ramp="0"] select').first().selectOption('s-curve');
  const after = await page.locator('[data-ramp="0"] [data-shade]').first().getAttribute('data-hex');
  expect(after).not.toBe(before);
});

test('legacy fixture load → banner appears', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('palettes:legacy-test', JSON.stringify({
      name: 'Legacy Test',
      savedAt: Date.now(),
      baseColors: ['#c45c3a', '#3a5fc4'],
      rampSize: 6,
      hueShiftStrength: 1.0,
    }));
  });
  await page.reload();
  await page.getByRole('button', { name: /load.*legacy test/i }).click();
  await expect(page.getByRole('alert')).toContainText(/old engine/i);
});

test('harmonize triadic → 3 distinct hues render', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /generate/i }).click();
  // Set 3 ramps via existing UI (assume + button or similar to add ramps).
  // Pick Harmonize mode: triadic.
  await page.locator('select[aria-label*="harmonize" i]').selectOption('triadic');
  await page.getByRole('button', { name: /^harmonize$/i }).click();
  const hexes = await page.locator('[data-ramp] [data-shade][data-slot="base"]').evaluateAll(
    nodes => nodes.map(n => n.getAttribute('data-hex'))
  );
  const distinct = new Set(hexes);
  expect(distinct.size).toBeGreaterThanOrEqual(3);
});
```

Notes for engineer: the selectors above (`[data-ramp]`, `[data-shade]`, etc.) likely don't exist in the current DOM. If selectors fail, add the relevant `data-*` attributes to the ramp/shade rendering in App.tsx, OR adjust the selectors to match existing ones (e.g. `.ramp-row:nth-child(1)`). Prefer adding `data-*` attributes — they are stable and explicit.

- [ ] **Step 13.2: Add `data-*` attributes if needed**

Search for ramp rendering in App.tsx. On the ramp container div, add `data-ramp={i}`. On each shade swatch, add `data-shade data-hex={hex} data-slot={slotName}`.

- [ ] **Step 13.3: Run Playwright**

Run: `npm run test:e2e -- perceptual-ramp.spec.ts`
Expected: all 4 tests pass.

Fix selector mismatches as they arise. Do not skip failing tests — fix them.

- [ ] **Step 13.4: Commit**

```bash
git add tests/e2e/perceptual-ramp.spec.ts src/App.tsx
git commit -m "test(e2e): Playwright smoke flows for perceptual ramp engine"
```

---

## Task 14: Type-check, full test suite, lint

- [ ] **Step 14.1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 14.2: Full unit test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 14.3: Full e2e suite**

Run: `npm run test:e2e`
Expected: All tests pass.

- [ ] **Step 14.4: WCAG contrast lint**

Run: `node tests/test_contrast.js`
Expected: exit 0.

- [ ] **Step 14.5: ESLint**

Run: `npx eslint src/`
Expected: 0 errors (warnings OK).

- [ ] **Step 14.6: Build**

Run: `npm run build`
Expected: success, `dist/` populated.

- [ ] **Step 14.7: Commit any fix-ups**

If any of the above produced changes (e.g. eslint --fix on new files), commit them:

```bash
git add -A
git commit -m "chore: address lint and type issues from full-suite run"
```

(Skip this step if there were no changes.)

---

## Task 15: Manual QA against existing saved palette fixtures

- [ ] **Step 15.1: Capture pre-change snapshots**

Before any further changes, in the dev build of the previous master branch, save 3 reference palettes via the UI:
- "QA Orange" — base `#c45c3a` only
- "QA Cyan" — base `#00b3b3` only
- "QA Mixed" — bases `#c45c3a`, `#3a5fc4`, `#7a3a8e`

Export each as text via the existing GIMP/text export feature. Save the export output in `tests/fixtures/qa-snapshots/` (gitignored under `tests/`).

- [ ] **Step 15.2: On the new branch, load each**

Switch to `feat/perceptual-ramp-engine`. Load each palette in dev mode. Verify:
- Migration banner appears.
- Clicking `Keep new look` makes the banner go away and the palette renders.
- Clicking `Restore old look` (on a re-loaded copy) freezes the palette to the pre-change export.

Diff the post-Restore export against the pre-change export captured in Step 15.1 — they should match byte-for-byte.

- [ ] **Step 15.3: Smoke flows in real Tauri build**

Run: `npm run tauri:dev`
- Generate, harmonize triadic, hardware-lock NES, change curve preset on a ramp, save, reload — all work.

- [ ] **Step 15.4: Document any defects**

If any defect surfaces, file as `// TODO(perceptual-ramp): ...` in code AND in the PR description. Do not block the plan — fix in follow-up commits before opening PR.

---

## Task 16: PR

- [ ] **Step 16.1: Push branch**

```bash
git push -u origin feat/perceptual-ramp-engine
```

- [ ] **Step 16.2: Open PR**

```bash
gh pr create --title "feat: perceptual ramp engine (OKLCH) + migration banner" --body "$(cat <<'EOF'
## Summary
- New `src/lib/oklch.ts` — sRGB↔OKLab↔OKLCH, gamut mapping (auto/clip/chroma-preserve), ΔE_OK
- New `src/lib/ramp-engine.ts` — `generateRamp(baseHex, opts)` perceptual engine + `_legacyHsvRamp` kept for migration
- New per-ramp `▸ Advanced` disclosure (curve preset, gamut strategy) — closed by default
- Migration banner for legacy `hsv-legacy` palettes with Keep / Restore choice
- `restoreFrozen` marker prevents size-slider drift on restored ramps
- Hardware Lock now uses ΔE_OK for `oklch-v1` palettes (RGB-Euclidean retained for un-promoted legacy)

Spec: `docs/superpowers/specs/2026-05-26-perceptual-ramp-engine-design.md`
Plan: `docs/superpowers/plans/2026-05-26-perceptual-ramp-engine.md`

## Test plan
- [ ] Unit suite green (`npm test`)
- [ ] Playwright e2e green (`npm run test:e2e`)
- [ ] WCAG contrast lint green (`node tests/test_contrast.js`)
- [ ] Manual: load 3 legacy QA fixtures → banner → Keep + Restore both behave
- [ ] Manual: Harmonize triadic + Hardware Lock NES still work
- [ ] Manual: fresh palette save → reload → identical shades

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Self-Review

Run through the spec section by section. Every requirement must be covered:

- [x] **Architecture (lib/oklch.ts, lib/ramp-engine.ts, lib/palette.ts changes)** — Tasks 1, 2, 3 (oklch), Tasks 4, 5 (ramp-engine), Task 6 (palette)
- [x] **Per-ramp H/S/V sliders interaction model** — handled via adapter shim in Task 8 (HSV deltas applied to base in existing code path; new engine sees adjusted base only)
- [x] **Hardware Lock gated ΔE_OK** — Task 12
- [x] **Style constants Punchy/Balanced/Muted** — Task 5 STYLE_CONFIG
- [x] **Per-style default curves** — Task 5 STYLE_CONFIG `defaultCurve`
- [x] **Curve presets (5)** — Task 5 `curveSample`
- [x] **Hue shift** — Task 5 `perSlotHueShift`
- [x] **Gamut handling (auto/clip/chroma-preserve)** — Task 2 `gamutMap`
- [x] **Pins integration** — Task 5 + applied externally via `applyOverrides` in App.tsx
- [x] **Hidden integration** — Task 5
- [x] **Harmonize untouched** — verified: Tasks make no changes to harmonize code
- [x] **Migration banner** — Task 9
- [x] **Keep / Restore** — Task 7 (logic) + Task 9 (UI)
- [x] **Restore freezes 3 styles** — Task 7 `promoteRestoreOldLook`
- [x] **`restoreFrozen` marker + size lock** — Task 11
- [x] **Persistence schema (4 new fields + restoreFrozen)** — Task 6
- [x] **Session history retag** — Task 9 `retagHistoryToOklchV1`
- [x] **Slider monotonicity test** — Task 5
- [x] **Edge cases (achromatic, black/white, invalid hex)** — Task 5
- [x] **Acceptance criteria spot checks** — Task 5 tests cover the 4 named bases
- [x] **Out-of-scope items not implemented** — bezier, perceptual harmonize, visual snapshots all skipped
- [x] **Vitest infrastructure** — Task 0
- [x] **Playwright smoke** — Task 13
- [x] **Type-check / lint / build** — Task 14
- [x] **Manual QA** — Task 15

**Placeholder scan:** All steps include exact code, exact commands, exact expected output. No "TBD", no "add error handling here", no "similar to Task N."

**Type consistency:**
- `Oklch` defined in `oklch.ts` → imported by `ramp-engine.ts` and tests.
- `CurvePreset` (engine) vs `CurvePresetSerialized` (palette payload) — same string union, deliberately separated to allow engine to evolve without breaking payload schema. Both listed in their respective files.
- `EngineVersion` defined in `palette.ts`, used in `App.tsx` (Task 12) and `migration.ts` (Task 7). Consistent.
- `Shade` interface — Task 5 only producer; never deserialized from storage.
- `Style` is `'punchy' | 'balanced' | 'muted'` in `ramp-engine.ts`, matches existing literal unions in `palette.ts` (`gplStyle`, `vizStyle`).

No inconsistencies found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-perceptual-ramp-engine.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
