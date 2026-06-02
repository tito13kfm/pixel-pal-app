# App.tsx Tier A — Pure-Helper Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ~850 lines of pure top-level helpers out of `src/App.tsx` (lines 63–916) into 10 typed, unit-tested `lib/` modules, with zero behavior change.

**Architecture:** Per module: write a vitest spec pinning current behavior (TDD), create a typed `src/lib/<name>.ts`, replace the inline definition in `App.tsx` with an import. Module + spec + import-swap land in one commit. Modules are extracted leaves-first so each import-swap compiles against already-extracted deps. App.tsx stays `@ts-nocheck`; the new modules are fully typed under `strict: true`.

**Tech Stack:** TypeScript 6 (strict, `noUnusedParameters`), Vite 8, React 19, vitest. Existing `lib/` deps reused: `lib/color` (hexToRgb, rgbToHex, hexToHsl, hslToHex, rgbToHsl), `lib/oklch` (hexToOklch, deltaEOK), `lib/ramp-engine` (generateRamp), `lib/curve` (presetToPoints), `lib/constants` (WORD_POOL, HARDWARE_PALETTES).

**Reference spec:** `docs/superpowers/specs/2026-06-02-app-tsx-tier-a-helper-extraction-design.md`

---

## Conventions for every task

- **Test location:** `tests/unit/<name>.spec.ts`. Header: `import { describe, it, expect } from 'vitest';` and import the module under test from `'../../src/lib/<name>'`.
- **Run one spec:** `npx vitest run tests/unit/<name>.spec.ts`
- **Build gate (every task):** `npm run build` (runs `tsc --noEmit` + vite) must pass before commit. **Caveat — build does NOT validate App.tsx.** App.tsx is `@ts-nocheck`, so `tsc` skips it and vite won't error on a reference to a now-deleted *local* (only on a bad `import`). The build green-lights the new typed module, not the App.tsx edit. Use the App.tsx grep check below as the real safety net for the consumer side.
- **App.tsx grep check (every task, after the import-swap):** run `grep -n '<helperName>' src/App.tsx` for each extracted symbol. It must appear **only** in the new `import` line plus its existing call sites — never as a `const`/`function` redefinition — and the call-site count must be **> 0** (zero means a wrong/dead import name). A leftover redefinition or a free-variable reference to a deleted local will pass `npm run build` and only surface at the final e2e run, 10 commits later. Catch it here.
- **Hex-string case in test fixtures:** the fixtures below assert **lowercase** hex (`'#ff0000'`). If `lib/color`'s `rgbToHex` emits uppercase, a step-5 failure that is *case-only* is a fixture issue — normalize the literal to match, it is **not** a regression. Verify `rgbToHex`'s output case once before Task 6/8/9 to save churn.
- **Typing rule:** move the helper body **verbatim in logic**. Add type annotations only as needed to satisfy `tsc`. Satisfy `noUnusedParameters` by **underscore-prefixing** the param (`_param`), never by deleting it (deletion changes arity). Do **not** alter runtime behavior.
- **Import-swap:** delete the inline `const`/`function` definition from `App.tsx` and add the new `import` near the other `./lib/*` imports (top of file, ~lines 5–31). The helper's **call sites stay unchanged**.
- **Commit message:** `refactor(applib): extract <name> helpers to lib/<name>`

---

## Task 1: lib/wcag.ts

**Files:**
- Create: `src/lib/wcag.ts`
- Modify: `src/App.tsx:67-96` (remove defs), import region near `src/App.tsx:5`
- Test: `tests/unit/wcag.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { wcagRelativeLuminance, wcagContrast, wcagAaTier } from '../../src/lib/wcag';

describe('wcagRelativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(wcagRelativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(wcagRelativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('wcagContrast', () => {
  it('is 21 for black vs white and 1 for identical colors', () => {
    expect(wcagContrast('#000000', '#ffffff')).toBeCloseTo(21, 4);
    expect(wcagContrast('#123456', '#123456')).toBeCloseTo(1, 5);
  });
  it('is order-independent', () => {
    expect(wcagContrast('#000000', '#ffffff')).toBeCloseTo(wcagContrast('#ffffff', '#000000'), 6);
  });
});

describe('wcagAaTier', () => {
  it('classifies by WCAG AA thresholds', () => {
    expect(wcagAaTier(21)).toBe('AA');
    expect(wcagAaTier(4.5)).toBe('AA');
    expect(wcagAaTier(3.0)).toBe('AA Large');
    expect(wcagAaTier(4.49)).toBe('AA Large');
    expect(wcagAaTier(2.99)).toBe('fail');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/wcag.spec.ts`
Expected: FAIL — cannot resolve `../../src/lib/wcag`.

- [ ] **Step 3: Create `src/lib/wcag.ts`**

```ts
import { hexToRgb } from './color';

// WCAG 2.1 relative luminance — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
export const wcagRelativeLuminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

// WCAG 2.1 contrast ratio in [1, 21]. Argument order does not matter.
export const wcagContrast = (hex1: string, hex2: string): number => {
  const L1 = wcagRelativeLuminance(hex1);
  const L2 = wcagRelativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
};

// Strongest AA tier the ratio satisfies, or 'fail'. Thresholds: 4.5 normal text, 3.0 large/UI.
export const wcagAaTier = (ratio: number): 'AA' | 'AA Large' | 'fail' => {
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3.0) return 'AA Large';
  return 'fail';
};
```

- [ ] **Step 4: Swap App.tsx**

Delete lines 67–96 (the three `wcag*` const definitions and their comments). Add near the other lib imports:

```ts
import { wcagRelativeLuminance, wcagContrast, wcagAaTier } from './lib/wcag';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/wcag.spec.ts`
Expected: PASS (3 describe blocks green).

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS — no tsc errors, vite build completes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/wcag.ts tests/unit/wcag.spec.ts src/App.tsx
git commit -m "refactor(applib): extract wcag helpers to lib/wcag"
```

---

## Task 2: lib/style-presets.ts

**Files:**
- Create: `src/lib/style-presets.ts`
- Modify: `src/App.tsx:216-227` (remove defs; note `seededHueDelta` at 210–214 stays for now — Task 10 moves it), import region
- Test: `tests/unit/style-presets.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_STYLE_PRESETS, styleToScalars } from '../../src/lib/style-presets';

describe('DEFAULT_STYLE_PRESETS', () => {
  it('holds the approved punchy/balanced/muted scalars', () => {
    expect(DEFAULT_STYLE_PRESETS.punchy).toEqual({ reach: 1.0, chromaFalloff: 0.1 });
    expect(DEFAULT_STYLE_PRESETS.balanced).toEqual({ reach: 0.575, chromaFalloff: 0.475 });
    expect(DEFAULT_STYLE_PRESETS.muted).toEqual({ reach: 0.15, chromaFalloff: 0.85 });
  });
});

describe('styleToScalars', () => {
  it('returns default scalars when no override map is given', () => {
    expect(styleToScalars('balanced', null)).toEqual({ reach: 0.575, chromaFalloff: 0.475 });
  });
  it('prefers the override map when present', () => {
    const presets = { balanced: { reach: 0.4, chromaFalloff: 0.6 } };
    expect(styleToScalars('balanced', presets)).toEqual({ reach: 0.4, chromaFalloff: 0.6 });
  });
  it('falls back to punchy for an unknown style', () => {
    expect(styleToScalars('nonsense', null)).toEqual({ reach: 1.0, chromaFalloff: 0.1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/style-presets.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/style-presets.ts`**

```ts
export interface StyleScalars {
  reach: number;
  chromaFalloff: number;
}

export type StylePresets = Record<string, StyleScalars>;

// Defaults reproduce the approved Punchy/Balanced/Muted look.
export const DEFAULT_STYLE_PRESETS: StylePresets = {
  punchy:   { reach: 1.0,   chromaFalloff: 0.1 },
  balanced: { reach: 0.575, chromaFalloff: 0.475 },
  muted:    { reach: 0.15,  chromaFalloff: 0.85 },
};

export const styleToScalars = (style: string, presets: StylePresets | null): StyleScalars => {
  const p = (presets && presets[style]) || DEFAULT_STYLE_PRESETS[style] || DEFAULT_STYLE_PRESETS.punchy;
  return { reach: p.reach, chromaFalloff: p.chromaFalloff };
};
```

- [ ] **Step 4: Swap App.tsx**

Delete lines 216–227 (`DEFAULT_STYLE_PRESETS` + `styleToScalars`). Leave `seededHueDelta` (210–214) in place. Add import:

```ts
import { DEFAULT_STYLE_PRESETS, styleToScalars } from './lib/style-presets';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/style-presets.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/style-presets.ts tests/unit/style-presets.spec.ts src/App.tsx
git commit -m "refactor(applib): extract style presets to lib/style-presets"
```

---

## Task 3: lib/panel-state.ts

**Files:**
- Create: `src/lib/panel-state.ts`
- Modify: `src/App.tsx:908-915` (remove defs; line 916 `const _panels = loadPanelState()` STAYS — it is a consumer), import region
- Test: `tests/unit/panel-state.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PANEL_STORAGE_KEY, PANEL_DEFAULTS, loadPanelState } from '../../src/lib/panel-state';

describe('loadPanelState', () => {
  beforeEach(() => localStorage.clear());

  it('returns defaults when nothing is stored', () => {
    expect(loadPanelState()).toEqual(PANEL_DEFAULTS);
  });

  it('merges stored partial state over defaults', () => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ tipsOpen: true }));
    expect(loadPanelState()).toEqual({ ...PANEL_DEFAULTS, tipsOpen: true });
  });

  it('falls back to defaults on malformed JSON', () => {
    localStorage.setItem(PANEL_STORAGE_KEY, '{not json');
    expect(loadPanelState()).toEqual(PANEL_DEFAULTS);
  });
});
```

> Note: vitest runs under jsdom in this repo (existing specs touch DOM). `localStorage` is available. If a future config change removes jsdom, add `// @vitest-environment jsdom` at the top of this spec.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/panel-state.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/panel-state.ts`**

```ts
export interface PanelState {
  harmonyOpen: boolean;
  tipsOpen: boolean;
  hwPickerOpen: boolean;
  exportOpen: boolean;
  historyOpen: boolean;
  savedOpen: boolean;
  sbsOpen: boolean;
  pgOpen: boolean;
  rampsOpen: boolean;
}

export const PANEL_STORAGE_KEY = 'ui:panels';

export const PANEL_DEFAULTS: PanelState = {
  harmonyOpen: true, tipsOpen: false, hwPickerOpen: false, exportOpen: false,
  historyOpen: false, savedOpen: false, sbsOpen: false, pgOpen: false, rampsOpen: true,
};

export function loadPanelState(): PanelState {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY);
    return raw ? { ...PANEL_DEFAULTS, ...JSON.parse(raw) } : PANEL_DEFAULTS;
  } catch {
    return PANEL_DEFAULTS;
  }
}
```

- [ ] **Step 4: Swap App.tsx**

Delete lines 908–915 (`PANEL_STORAGE_KEY`, `PANEL_DEFAULTS`, `loadPanelState`). **Keep line 916** (`const _panels = loadPanelState()`). Add import:

```ts
import { PANEL_STORAGE_KEY, PANEL_DEFAULTS, loadPanelState } from './lib/panel-state';
```

(If `PANEL_STORAGE_KEY`/`PANEL_DEFAULTS` are referenced elsewhere in App.tsx, the import covers them; if `noUnusedLocals` flags an unused import name, import only what App.tsx actually uses — verify with a grep for each name.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/panel-state.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/panel-state.ts tests/unit/panel-state.spec.ts src/App.tsx
git commit -m "refactor(applib): extract panel-state to lib/panel-state"
```

---

## Task 4: lib/randomizer.ts

**Files:**
- Create: `src/lib/randomizer.ts`
- Modify: `src/App.tsx:882-905` (remove `_WORD_POOL_IMPORTED`, `pickRandom`, `buildRandomDescription`, `buildRandomHex`), import region
- Test: `tests/unit/randomizer.spec.ts`

> These use `Math.random()` — assert structure/contracts, not exact values.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { pickRandom, buildRandomDescription, buildRandomHex } from '../../src/lib/randomizer';

describe('pickRandom', () => {
  it('returns the sole element of a one-item array', () => {
    expect(pickRandom(['only'])).toBe('only');
  });
  it('always returns a member of the array', () => {
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(arr).toContain(pickRandom(arr));
  });
});

describe('buildRandomHex', () => {
  it('returns a valid #rrggbb string', () => {
    for (let i = 0; i < 50; i++) expect(buildRandomHex()).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe('buildRandomDescription', () => {
  it('returns a non-empty string', () => {
    for (let i = 0; i < 50; i++) expect(buildRandomDescription().length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/randomizer.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/randomizer.ts`**

```ts
import { WORD_POOL } from './constants';
import { hslToHex } from './color';

export const pickRandom = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const buildRandomDescription = (): string => {
  const patterns = [
    () => `${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => pickRandom(WORD_POOL.scenes),
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.scenes)}`,
  ];
  return pickRandom(patterns)();
};

export const buildRandomHex = (): string => {
  const hue = Math.floor(Math.random() * 360);
  const sat = 55 + Math.floor(Math.random() * 40);
  const light = 35 + Math.floor(Math.random() * 25);
  return hslToHex({ h: hue, s: sat, l: light });
};
```

> If `tsc` flags `WORD_POOL` member access (e.g. `scenes` missing on its type), check `lib/constants` exports — annotate the access or widen the constant's type there only if needed; do not change WORD_POOL's runtime contents.

- [ ] **Step 4: Swap App.tsx**

Delete lines 882–905 (including the `_WORD_POOL_IMPORTED` marker line). Add import:

```ts
import { pickRandom, buildRandomDescription, buildRandomHex } from './lib/randomizer';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/randomizer.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/randomizer.ts tests/unit/randomizer.spec.ts src/App.tsx
git commit -m "refactor(applib): extract randomizer pools to lib/randomizer"
```

---

## Task 5: lib/harmony.ts

**Files:**
- Create: `src/lib/harmony.ts`
- Modify: `src/App.tsx:850-879` (remove `generateHarmony`), import region
- Test: `tests/unit/harmony.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { generateHarmony } from '../../src/lib/harmony';

const KEYS = [
  'complementary', 'analogous1', 'analogous2', 'triadic1', 'triadic2',
  'splitComp1', 'splitComp2', 'tetradic1', 'tetradic2', 'tetradic3',
  'square1', 'square2', 'square3',
];

describe('generateHarmony', () => {
  it('returns all harmony keys as valid hex strings', () => {
    const h = generateHarmony(['#ff0000']);
    for (const k of KEYS) {
      expect(h).toHaveProperty(k);
      expect((h as Record<string, string>)[k]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it('is deterministic for the same input', () => {
    expect(generateHarmony(['#3366cc'])).toEqual(generateHarmony(['#3366cc']));
  });
  it('picks the most-saturated base as anchor (order-independent)', () => {
    const a = generateHarmony(['#808080', '#ff0000']);
    const b = generateHarmony(['#ff0000', '#808080']);
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/harmony.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/harmony.ts`**

```ts
import { hexToHsl, hslToHex } from './color';

export interface HarmonySet {
  complementary: string;
  analogous1: string; analogous2: string;
  triadic1: string; triadic2: string;
  splitComp1: string; splitComp2: string;
  tetradic1: string; tetradic2: string; tetradic3: string;
  square1: string; square2: string; square3: string;
}

export const generateHarmony = (baseHexes: string[]): HarmonySet => {
  let anchor = baseHexes[0], maxSat = 0;
  for (const hex of baseHexes) {
    const hsl = hexToHsl(hex);
    if (hsl.s > maxSat) { maxSat = hsl.s; anchor = hex; }
  }
  const base = hexToHsl(anchor);
  const tone = (hsl: { h: number; s: number; l: number }) => ({
    h: hsl.h,
    s: Math.min(95, Math.max(55, hsl.s)),
    l: Math.min(70, Math.max(40, hsl.l)),
  });
  return {
    complementary: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    analogous1: hslToHex(tone({ h: base.h + 30, s: base.s, l: base.l })),
    analogous2: hslToHex(tone({ h: base.h - 30, s: base.s, l: base.l })),
    triadic1: hslToHex(tone({ h: base.h + 120, s: base.s, l: base.l })),
    triadic2: hslToHex(tone({ h: base.h + 240, s: base.s, l: base.l })),
    splitComp1: hslToHex(tone({ h: base.h + 150, s: base.s, l: base.l })),
    splitComp2: hslToHex(tone({ h: base.h + 210, s: base.s, l: base.l })),
    tetradic1: hslToHex(tone({ h: base.h + 60, s: base.s, l: base.l })),
    tetradic2: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    tetradic3: hslToHex(tone({ h: base.h + 240, s: base.s, l: base.l })),
    square1: hslToHex(tone({ h: base.h + 90, s: base.s, l: base.l })),
    square2: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    square3: hslToHex(tone({ h: base.h + 270, s: base.s, l: base.l })),
  };
};
```

- [ ] **Step 4: Swap App.tsx**

Delete lines 850–879. Add import:

```ts
import { generateHarmony } from './lib/harmony';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/harmony.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/harmony.ts tests/unit/harmony.spec.ts src/App.tsx
git commit -m "refactor(applib): extract generateHarmony to lib/harmony"
```

---

## Task 6: lib/palette-import.ts

**Files:**
- Create: `src/lib/palette-import.ts`
- Modify: `src/App.tsx:672-847` (remove `parsePiskelC`, `parseGpl`, `subsetGplColors`), import region
- Test: `tests/unit/palette-import.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseGpl, subsetGplColors, parsePiskelC } from '../../src/lib/palette-import';

describe('parseGpl', () => {
  it('parses a minimal GIMP palette into #rrggbb colors', () => {
    const gpl = 'GIMP Palette\nName: Test\n# comment\n255   0   0\t Red\n0 255 0 Green\n';
    expect(parseGpl(gpl)).toEqual({ name: 'Test', colors: ['#ff0000', '#00ff00'] });
  });
  it('rejects a file without the GIMP Palette header', () => {
    expect(parseGpl('not a palette\n255 0 0')).toBeNull();
  });
  it('returns null for non-string input', () => {
    expect(parseGpl(undefined as unknown as string)).toBeNull();
  });
});

describe('subsetGplColors', () => {
  it('returns [] for empty input', () => {
    expect(subsetGplColors([])).toEqual([]);
  });
  it('dedupes case-insensitively and returns <=6 untouched', () => {
    expect(subsetGplColors(['#FF0000', '#ff0000', '#00ff00'])).toEqual(['#ff0000', '#00ff00']);
  });
  it('samples down to 5 representatives when given many', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      `#${(i * 12 % 256).toString(16).padStart(2, '0')}8040`);
    const out = subsetGplColors(many);
    expect(out.length).toBeLessThanOrEqual(5);
    out.forEach(h => expect(h).toMatch(/^#[0-9a-f]{6}$/));
  });
});

describe('parsePiskelC', () => {
  it('returns null when fewer than 16 pixels are present', () => {
    expect(parsePiskelC('0xff112233 0xff445566')).toBeNull();
  });
  it('parses a 4x4 single-color sprite into a pattern grid', () => {
    const px = Array(16).fill('0xffaa1020').join(' ');
    const text = `FRAME_WIDTH 4\nFRAME_HEIGHT 4\n${px}`;
    const result = parsePiskelC(text);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(4);
    expect(result!.height).toBe(4);
    expect(result!.pattern).toHaveLength(4);
    expect(result!.numShades).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/palette-import.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/palette-import.ts`**

Create the file with this header, then move the three function bodies **verbatim** from `src/App.tsx` lines 672–731 (`parsePiskelC`), 742–804 (`parseGpl`), 816–847 (`subsetGplColors`). Add `export` to each, annotate signatures, and prefix any unused params:

```ts
import { rgbToHex, rgbToHsl, hexToHsl } from './color';

export interface PiskelSprite {
  pattern: string[];
  width: number;
  height: number;
  numShades: number;
}

export const parsePiskelC = (text: string): PiskelSprite | null => {
  // ...verbatim body from App.tsx 673-730...
};

export const parseGpl = (text: string): { name: string; colors: string[] } | null => {
  // ...verbatim body from App.tsx 743-803...
};

export const subsetGplColors = (colors: string[]): string[] => {
  // ...verbatim body from App.tsx 817-846...
};
```

> `parsePiskelC` calls `rgbToHsl({ r, g, b }).l`; `parseGpl` calls `rgbToHex`; `subsetGplColors` calls `hexToHsl` — all imported above. Verify `rgbToHsl`'s signature in `lib/color` accepts an `{r,g,b}` object (matches the existing call) and annotate the destructured `nums`/loop locals as `number` where `tsc` requires.

- [ ] **Step 4: Swap App.tsx**

Delete lines 672–847 (all three functions and their comment banners). Add import:

```ts
import { parsePiskelC, parseGpl, subsetGplColors } from './lib/palette-import';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/palette-import.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/palette-import.ts tests/unit/palette-import.spec.ts src/App.tsx
git commit -m "refactor(applib): extract palette import parsers to lib/palette-import"
```

---

## Task 7: lib/hardware-quantize.ts

**Files:**
- Create: `src/lib/hardware-quantize.ts`
- Modify: `src/App.tsx:233-246` (remove `quantizeToHardware`), import region
- Test: `tests/unit/hardware-quantize.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { quantizeToHardware } from '../../src/lib/hardware-quantize';

describe('quantizeToHardware', () => {
  it('returns the input hex when hardware is null or has no colors', () => {
    expect(quantizeToHardware('#ff0000', null)).toBe('#ff0000');
    expect(quantizeToHardware('#ff0000', { colors: [] })).toBe('#ff0000');
  });
  it('snaps to the perceptually nearest hardware color', () => {
    const hw = { colors: ['#ff0000', '#0000ff'] };
    expect(quantizeToHardware('#fe0205', hw)).toBe('#ff0000');
    expect(quantizeToHardware('#0a0ae0', hw)).toBe('#0000ff');
  });
  it('returns an exact match unchanged', () => {
    expect(quantizeToHardware('#0000ff', { colors: ['#ff0000', '#0000ff'] })).toBe('#0000ff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/hardware-quantize.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/hardware-quantize.ts`**

```ts
import { hexToOklch, deltaEOK } from './oklch';

export interface HardwarePalette {
  colors?: string[];
}

// Nearest hardware color by ΔE_OK (perceptual OKLab distance).
export const quantizeToHardware = (hex: string, hardware: HardwarePalette | null): string => {
  if (!hardware || !hardware.colors || hardware.colors.length === 0) return hex;
  const target = hexToOklch(hex);
  if (!target) return hardware.colors[0];
  let bestHex = hardware.colors[0];
  let bestDist = Infinity;
  for (const candidate of hardware.colors) {
    const co = hexToOklch(candidate);
    if (!co) continue;
    const d = deltaEOK(target, co);
    if (d < bestDist) { bestDist = d; bestHex = candidate; }
  }
  return bestHex;
};
```

> Confirm `hexToOklch`/`deltaEOK` arg/return types in `lib/oklch` match this usage; annotate `target`/`co` if `tsc` infers a nullable that needs narrowing (the `if (!co) continue` already narrows).

- [ ] **Step 4: Swap App.tsx**

Delete lines 233–246. Add import:

```ts
import { quantizeToHardware } from './lib/hardware-quantize';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/hardware-quantize.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/hardware-quantize.ts tests/unit/hardware-quantize.spec.ts src/App.tsx
git commit -m "refactor(applib): extract quantizeToHardware to lib/hardware-quantize"
```

---

## Task 8: lib/image-extract.ts

**Files:**
- Create: `src/lib/image-extract.ts`
- Modify: `src/App.tsx:110-201` (remove `extractDominantColors` + `quantizeToPalette`), import region
- Test: `tests/unit/image-extract.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { extractDominantColors, quantizeToPalette } from '../../src/lib/image-extract';

// Build an ImageData-shaped fixture (jsdom lacks a real ImageData ctor).
function fakeImageData(pixels: Array<[number, number, number, number]>): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = a;
  });
  return { data, width: pixels.length, height: 1, colorSpace: 'srgb' } as ImageData;
}

describe('quantizeToPalette', () => {
  it('returns the input hex when the palette is empty', () => {
    expect(quantizeToPalette('#ff0000', [])).toBe('#ff0000');
  });
  it('returns an exact palette match', () => {
    expect(quantizeToPalette('#ff0000', ['#ff0000', '#00ff00'])).toBe('#ff0000');
  });
  it('snaps a near-red to red, not to a far hue', () => {
    expect(quantizeToPalette('#f51008', ['#ff0000', '#0000ff'])).toBe('#ff0000');
  });
});

describe('extractDominantColors', () => {
  it('ignores fully transparent pixels and returns the opaque color', () => {
    const img = fakeImageData([[255, 0, 0, 255], [0, 0, 0, 0]]);
    expect(extractDominantColors(img, 4)).toEqual(['#ff0000']);
  });
  it('caps the result at targetCount', () => {
    const img = fakeImageData([
      [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255],
    ]);
    expect(extractDominantColors(img, 2).length).toBeLessThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/image-extract.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/image-extract.ts`**

Header below; move `extractDominantColors` (App.tsx 110–132) and `quantizeToPalette` (App.tsx 171–201) **verbatim**, add `export`, annotate:

```ts
import { rgbToHex, hexToHsl } from './color';

export const extractDominantColors = (imageData: ImageData, targetCount = 4): string[] => {
  // ...verbatim body from App.tsx 111-131...
};

export const quantizeToPalette = (hex: string, paletteColors: string[]): string => {
  // ...verbatim body from App.tsx 172-200...
};
```

> Keep the full `quantizeToPalette` comment block (App.tsx 138–170) above the function — it documents the perceptual weights. Annotate `counts` as `Map<string, number>` if `tsc` needs it.

- [ ] **Step 4: Swap App.tsx**

Delete lines 110–201 (both functions + the `quantizeToPalette` comment banner; the standalone comment lines at 134–135 about constants imports may stay or go — they are inert). Add import:

```ts
import { extractDominantColors, quantizeToPalette } from './lib/image-extract';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/image-extract.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/image-extract.ts tests/unit/image-extract.spec.ts src/App.tsx
git commit -m "refactor(applib): extract image color extraction to lib/image-extract"
```

---

## Task 9: lib/image-remap.ts  *(depends on Task 8)*

**Files:**
- Create: `src/lib/image-remap.ts`
- Modify: `src/App.tsx:296-480` (remove `remapImageToPalette`, `computeRemapScaleOptions`, `estimateRemapCost`), import region
- Test: `tests/unit/image-remap.spec.ts`

> `remapImageToPalette` is ~140 lines (App.tsx 296–436). Move it verbatim. It calls `quantizeToPalette` — now imported from `./image-extract` (Task 8 must be done first).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  remapImageToPalette, computeRemapScaleOptions, estimateRemapCost,
} from '../../src/lib/image-remap';

describe('computeRemapScaleOptions', () => {
  it('keeps all scales within the cap', () => {
    expect(computeRemapScaleOptions(100, 100, 8192)).toEqual([0.25, 0.5, 1, 2, 4, 8]);
  });
  it('drops scales that exceed the cap', () => {
    expect(computeRemapScaleOptions(2000, 2000, 8192)).toEqual([0.25, 0.5, 1, 2, 4]);
  });
  it('drops scales that round below 1px', () => {
    expect(computeRemapScaleOptions(2, 2, 8192)).toEqual([0.5, 1, 2, 4, 8]);
  });
});

describe('estimateRemapCost', () => {
  it('models no-dither as uniqueCap*palette + pixels', () => {
    expect(estimateRemapCost(10, 10, 5, 'none')).toBe(600);
  });
  it('models floyd-steinberg as pixels*palette', () => {
    expect(estimateRemapCost(10, 10, 5, 'floyd-steinberg')).toBe(500);
  });
  it('is zero when the palette is empty', () => {
    expect(estimateRemapCost(10, 10, 0, 'none')).toBe(0);
  });
});

describe('remapImageToPalette', () => {
  it('returns an empty result for a degenerate image', () => {
    const out = remapImageToPalette({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, ['#ff0000'], {});
    expect(out).toEqual({ width: 0, height: 0, data: new Uint8ClampedArray(0) });
  });
  it('passes pixels through unchanged when the palette is empty', () => {
    const src = new Uint8ClampedArray([12, 34, 56, 255]);
    const out = remapImageToPalette({ width: 1, height: 1, data: src }, [], {});
    expect(Array.from(out.data)).toEqual([12, 34, 56, 255]);
  });
  it('maps a pixel to the single palette color (no dither)', () => {
    const src = new Uint8ClampedArray([10, 10, 10, 255]);
    const out = remapImageToPalette({ width: 1, height: 1, data: src }, ['#ff0000'], { dither: 'none' });
    expect(out.width).toBe(1);
    expect(Array.from(out.data.slice(0, 3))).toEqual([255, 0, 0]);
  });
});
```

> `computeRemapScaleOptions(2, 2, …)`: scale 0.25 → floor(0.5)=0 → dropped; 0.5 → 1px kept. Confirm the expected array against the current function when you run it; adjust the literal only if the live output differs (characterization).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/image-remap.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/image-remap.ts`**

Header below; move the three bodies **verbatim** from App.tsx — `remapImageToPalette` (296–436), `computeRemapScaleOptions` (437–449), `estimateRemapCost` (471–480). Keep their comment banners.

```ts
import { quantizeToPalette } from './image-extract';

export interface RemapImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface RemapOptions {
  dither?: 'none' | 'floyd-steinberg';
}

export const remapImageToPalette = (
  image: RemapImage, paletteColors: string[], options?: RemapOptions,
): RemapImage => {
  // ...verbatim body from App.tsx 297-436...
};

export const computeRemapScaleOptions = (
  naturalW: number, naturalH: number, maxDim?: number,
): number[] => {
  // ...verbatim body from App.tsx 438-448...
};

export const estimateRemapCost = (
  w: number, h: number, paletteSize: number, dither: string,
): number => {
  // ...verbatim body from App.tsx 472-479...
};
```

> The remap body uses an integer color cache (`Map<number, string>`) and possibly Floyd–Steinberg error buffers. Annotate local maps/arrays with explicit element types where `tsc` (strict) requires. Underscore-prefix any param the body never reads. Change **no** runtime logic.

- [ ] **Step 4: Swap App.tsx**

Delete lines **248–480**: the `// ---------- Image remap preview ----------` banner and the multi-line comment block (248–295) that documents `remapImageToPalette`, plus the three functions and their inline comment banners (296–480). Move all the explanatory comments into the new module alongside their functions. If any helper inside 296–436 is a standalone top-level function NOT in this task's list, stop and report it — the spec assumed exactly these three. Add import:

```ts
import { remapImageToPalette, computeRemapScaleOptions, estimateRemapCost } from './lib/image-remap';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/image-remap.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/image-remap.ts tests/unit/image-remap.spec.ts src/App.tsx
git commit -m "refactor(applib): extract image remap to lib/image-remap"
```

---

## Task 10: lib/snapshot-ramps.ts  *(depends on Tasks 2 & 7)*

**Files:**
- Create: `src/lib/snapshot-ramps.ts`
- Modify: `src/App.tsx:210-214` (move `seededHueDelta`), `src/App.tsx:517-635` (remove `buildRampsForSnapshot`), import region
- Test: `tests/unit/snapshot-ramps.spec.ts`

> `buildRampsForSnapshot` is ~120 lines (App.tsx 517–634). It depends on `styleToScalars`/`DEFAULT_STYLE_PRESETS` (Task 2), `quantizeToHardware` (Task 7), `seededHueDelta` (moved here), `generateRamp` (ramp-engine), `presetToPoints` (curve), `HARDWARE_PALETTES` (constants), `hexToHsl` (color). Do this task last.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildRampsForSnapshot, seededHueDelta } from '../../src/lib/snapshot-ramps';

describe('seededHueDelta', () => {
  it('returns 0 for seed 0 at any ramp index', () => {
    expect(seededHueDelta(0, 0)).toBe(0);
    expect(seededHueDelta(0, 7)).toBe(0);
  });
  it('is deterministic and within ±8 degrees', () => {
    const a = seededHueDelta(42, 3);
    expect(seededHueDelta(42, 3)).toBe(a);
    expect(Math.abs(a)).toBeLessThanOrEqual(8);
  });
});

describe('buildRampsForSnapshot', () => {
  it('returns [] for a missing or empty snapshot', () => {
    expect(buildRampsForSnapshot(null, 'balanced')).toEqual([]);
    expect(buildRampsForSnapshot({ baseColors: [] }, 'balanced')).toEqual([]);
  });
  it('produces one ramp of valid hexes per base color', () => {
    const ramps = buildRampsForSnapshot({ baseColors: ['#cc3344'], rampSize: 5 }, 'balanced');
    expect(ramps).toHaveLength(1);
    expect(ramps[0].length).toBe(5);
    ramps[0].forEach(h => expect(h).toMatch(/^#[0-9a-fA-F]{6}$/));
  });
  it('is deterministic for the same snapshot', () => {
    const snap = { baseColors: ['#3366cc', '#cc6633'], rampSize: 6 };
    expect(buildRampsForSnapshot(snap, 'punchy')).toEqual(buildRampsForSnapshot(snap, 'punchy'));
  });
});
```

> The ramp length and hex values come from the perceptual engine. If the live `buildRampsForSnapshot` returns a different inner length for `rampSize: 5` (e.g. hidden-shade filtering), adjust the literal to match the current output — this is a characterization test pinning today's behavior.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/snapshot-ramps.spec.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Create `src/lib/snapshot-ramps.ts`**

Header below. Move `seededHueDelta` (App.tsx 210–214) and `buildRampsForSnapshot` (App.tsx 517–634) **verbatim**, add `export`, annotate. Type the snapshot loosely (it has many optional fields — see the spec's field list); a `Partial`-style interface with `baseColors: string[]` required is sufficient.

```ts
import { generateRamp as generateRampNew } from './ramp-engine';
import { presetToPoints } from './curve';
import { HARDWARE_PALETTES } from './constants';
import { hexToHsl } from './color';
import { styleToScalars, DEFAULT_STYLE_PRESETS } from './style-presets';
import { quantizeToHardware } from './hardware-quantize';

// Deterministic ±8° hue offset for (seed, rampIdx). Seed 0 => 0 (baseline).
export const seededHueDelta = (effectiveSeed: number, rampIdx: number): number => {
  if (effectiveSeed === 0) return 0;
  const n = Math.imul(effectiveSeed * 17 + rampIdx * 31, 0x45d9f3b) >>> 0;
  return (n / 0x100000000 - 0.5) * 16;
};

export interface RampSnapshot {
  baseColors: string[];
  rampSize?: number;
  // ...other optional fields per the design spec's documented snapshot shape...
  [key: string]: unknown;
}

export const buildRampsForSnapshot = (snapshot: RampSnapshot | null, style: string): string[][] => {
  // ...verbatim body from App.tsx 518-634...
};
```

> The body destructures many optional snapshot fields with defaults — keep them exactly. It calls `generateRampNew`, `styleToScalars`, `quantizeToHardware`, `seededHueDelta`, `presetToPoints`, `HARDWARE_PALETTES.find`, `hexToHsl`. The `[key: string]: unknown` index signature lets the destructure typecheck; cast narrow where the engine needs concrete types, without changing runtime values.

- [ ] **Step 4: Swap App.tsx**

Delete lines 204–214 (`seededHueDelta` and its comment block) and **482–634**: the `// ---------- Side-by-side palette regeneration helper ----------` banner with its long field-list comment (482–516) and `buildRampsForSnapshot` itself (517–634). Move those explanatory comments into the new module. If any helper called inside 517–634 is a standalone top-level function NOT in this task's import list, stop and report it — the spec assumed `buildRampsForSnapshot` is self-contained (its 484–488 comment claims so). Add import:

```ts
import { buildRampsForSnapshot, seededHueDelta } from './lib/snapshot-ramps';
```

Both App.tsx call sites of `seededHueDelta` (≈ lines 617 and 1595, now shifted up by earlier deletions) resolve to the import. Confirm with a grep that no other top-level reference remains.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/snapshot-ramps.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/snapshot-ramps.ts tests/unit/snapshot-ramps.spec.ts src/App.tsx
git commit -m "refactor(applib): extract buildRampsForSnapshot to lib/snapshot-ramps"
```

---

## Final verification (after all 10 tasks)

- [ ] **Full unit suite:** `npm test` — all specs green (10 new + existing).
- [ ] **Build:** `npm run build` — clean.
- [ ] **E2E regression net:** `npm run test:e2e` — app load, palette ops, tours, AI settings all green (Tier A changes no behavior, so any failure signals a bad extraction).
- [ ] **Size check:** `git diff master --stat -- src/App.tsx` — App.tsx reduced by ~850 lines (~8039 → ~7,200).
- [ ] **Finish the branch:** invoke `superpowers:finishing-a-development-branch` to open the PR for `refactor/app-tsx-tier-a`.

---

## Notes for the executor

- **Line numbers shift** as you delete code. The numbers above are from the pristine `master` App.tsx. After each task, re-locate the next target by its function name (grep), not the stale line number.
- **No behavior change is the contract.** If a characterization test forces you to change a `lib/` function's logic to make it pass, stop — that means the extraction altered behavior. The test pins the *current* App.tsx output; the module must reproduce it exactly.
- **`@ts-nocheck` stays in App.tsx.** Do not remove it. Only the new `lib/` modules are typed.
- **Out of scope:** `PixelSprite` (App.tsx 636) is a component → Tier C. Do not extract it here.
- **Run e2e early on the risky tasks.** Tasks 9 (`image-remap`) and 10 (`snapshot-ramps`) are the largest verbatim moves and feed user-visible features (image remap preview, side-by-side/history ramps). Run `npm run test:e2e` right after each of those two commits — don't wait for the final pass to discover a break 1–2 commits deep.
- **Commits unread in full:** `remapImageToPalette` (321–436) and `buildRampsForSnapshot` (557–634) were not read line-by-line during planning. The typed module's `tsc` pass catches any missing import; the per-task grep catches a missed App.tsx call site. Trust those two gates plus the stop-and-report guards in Tasks 9/10.
