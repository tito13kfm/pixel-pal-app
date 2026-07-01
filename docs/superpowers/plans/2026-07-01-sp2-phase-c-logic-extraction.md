# SP2 Phase c: Logic Extraction (lib/hooks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move three verified-clean domains out of `App.tsx`'s inline logic block into typed files: theme token data, export handlers, and the ramp pure-helper cluster.

**Architecture:** Three independent thin vertical slices, same pattern as phase b. Slice 1 (`themeTokens`) is a straight data-literal move. Slice 2 (export) moves 22 handler functions into `src/lib/export.ts` (pure formatting) + a new `src/hooks/useExport.ts` hook (wires them to the existing `useExportSettings()` state). Slice 3 (ramp helpers) moves 8 functions into `src/lib/ramp-helpers.ts`; four of them currently read App.tsx state via closure (`hiddenShades`, `rampSatOverrides`, `rampSizeOverrides`/`rampSize`, `hueShiftStrengthPerRamp`/`hueShiftStrength`, `gamutPerRamp`/`stylePresets`/`shuffleSeed`/`rampShuffleOffsets`/`lightnessCurvePerRamp`/`satCurvePerRamp`), so their signatures gain explicit parameters and every call site (including ones in domains this plan does NOT extract, e.g. the image-remap and hardware-lock-bake handlers) gets updated to pass them.

**Tech Stack:** React 19, TypeScript 6 (new files are NOT `@ts-nocheck`), Vitest, Testing Library.

## Global Constraints

- `App.tsx` keeps `@ts-nocheck`. Grep is the correctness gate for it, not `tsc`: after every move, `grep -n '<oldName>' src/App.tsx` must show only an import line and call sites, never a leftover `const <oldName> = `/`function <oldName>(` definition.
- Locate code by function/const name via `grep -n '<name>' src/App.tsx`, never by a line number written in this plan or the spec: `App.tsx` changes on nearly every commit and any number here is stale by execution time.
- Every new file (`src/lib/theme.ts`, `src/lib/export.ts`, `src/hooks/useExport.ts`, `src/lib/ramp-helpers.ts`) is normally type-checked, not `@ts-nocheck`.
- Per slice: `npm run build` + `npm test` + `npm run test:e2e` (desktop) + (`npm run build:web` && `npx playwright test --config=playwright.web.config.ts`) (web) + `npm run deadcode`, all must pass before merge.
- `docs/ARCHITECTURE.md` gets a note in the same PR each slice lands (existing DOC-SYNC convention: any logic that moves out of `App.tsx` updates the affected section).
- One branch per slice, branched from `master` after the prior slice has merged: `sp2-phase-c-slice-1-theme-tokens`, `sp2-phase-c-slice-2-export`, `sp2-phase-c-slice-3-ramp-helpers`.
- Do not touch the domains the spec flags out-of-scope: ramp-editing handlers (pin/override/shuffle/lock/reset/duplicate/remove), sprite-import handlers, image-remap handlers, harmony/compare, saved-palette CRUD, hardware-lock bake. Slice 3's call-site updates DO touch lines inside the image-remap and hardware-lock-bake domains (they call `resolveBaseForRamp`/`resolveSizeForRamp`/`generateRamp`/`applyOverrides`/`filterHidden`/`labelsForRamp`), but only to add the new required parameters, not to extract or otherwise restructure those domains.
- No behavior change in any slice. Every moved function keeps its exact logic; only where it reads state changes (closure → parameter).

---

## Task 1: `themeTokens` → `src/lib/theme.ts`

**Files:**
- Create: `src/lib/theme.ts`
- Modify: `src/App.tsx` (delete the `themeTokens` const, add an import, delete the local `slugify` const, add a `slugify` import)

**Interfaces:**
- Produces: `THEME_TOKENS`, a plain object with `dark`/`neutral`/`light` keys (same shape App.tsx's `themeTokens` const has today). `ThemeName` type (`'dark' | 'neutral' | 'light'`).

- [ ] **Step 1: Locate the exact current boundaries**

```powershell
grep -n "const themeTokens = {" src/App.tsx
grep -n "const t = useMemo(() => themeTokens\[theme\]" src/App.tsx
```

Expected: two line numbers, the `themeTokens` const starts at the first and the `const t = useMemo(...)` line immediately follows the const's closing `};`. Use these live numbers for Step 2, not any number from this plan.

- [ ] **Step 2: Extract the object body verbatim**

```powershell
node -e "
const fs = require('fs');
const src = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
const startIdx = src.findIndex(l => l.includes('const themeTokens = {'));
const endIdx = src.findIndex((l, i) => i > startIdx && l.trim() === '};');
const body = src.slice(startIdx, endIdx + 1).join('\n');
fs.writeFileSync('.theme-tokens-body.txt', body);
console.log('lines', startIdx + 1, 'to', endIdx + 1);
"
```

This writes the exact current `const themeTokens = { ... };` text (all three theme variants, unmodified) to a scratch file for Step 3. Do not hand-retype this block: it is a ~350-line data literal (CSS gradients + one large inline SVG data URI for the Light theme background) and a single dropped character would silently break the Light theme's background pattern.

- [ ] **Step 3: Create `src/lib/theme.ts`**

Open `.theme-tokens-body.txt` and confirm it starts with `const themeTokens = {` and ends with `};`. Then write `src/lib/theme.ts`:

```ts
// src/lib/theme.ts
export type ThemeName = 'dark' | 'neutral' | 'light';

export interface ThemeTokens {
  pageBg: string;
  showVaporwave: boolean;
  crtIntensity: string;
  cardBgCyan: string;
  cardBgPink: string;
  cardBgPinkBright: string;
  cardBgYellow: string;
  cardBgGreen: string;
  cardBgViz: string;
  titleGlow: string;
  titleColor: string;
  subtitleColor: string;
  subtitleGlow: string;
  glowStrong: number;
  bodyText: string;
  mutedText: string;
  inputBg: string;
  inputTextCyan: string;
  inputTextPink: string;
  inputTextYellow: string;
  controlBtnDefault: string;
  controlBtnHover: string;
  controlPanelBg: string;
  controlPanelBorder: string;
  alertInfoBg: string;
  alertInfoText: string;
  alertInfoBorder: string;
  alertWarnBg: string;
  alertWarnText: string;
  alertWarnBorder: string;
  alertErrorBg: string;
  alertErrorText: string;
  alertErrorBorder: string;
  alertVisionBg: string;
  alertVisionText: string;
  alertVisionBorder: string;
  tipPanelBg: string;
  tipPanelBorder: string;
  tipPanelText: string;
  tipPanelStrong: string;
  panelBg: string;
  panelBorder: string;
  panelBgStrong: string;
  panelTextInactive: string;
  panelHoverBg: string;
  swatchHex: string;
  swatchLabel: string;
  colorNameText: string;
  vizRingStroke: string;
  vizSpokeStroke: string;
  vizAxisLabel: string;
  vizDataBorder: string;
  vignette: string;
}

// PASTE the verbatim body from .theme-tokens-body.txt here, renaming the
// const to THEME_TOKENS and adding the type annotation, e.g.:
// export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
//   dark: { ... },
//   neutral: { ... },
//   light: { ... },
// };
```

Replace the placeholder comment with the pasted body, renamed to:
```ts
export const THEME_TOKENS: Record<ThemeName, ThemeTokens> = {
  dark: { /* verbatim from .theme-tokens-body.txt */ },
  neutral: { /* verbatim from .theme-tokens-body.txt */ },
  light: { /* verbatim from .theme-tokens-body.txt */ },
};
```

Do not alter any value inside `dark`/`neutral`/`light`. Every CSS string, comment, and the Light theme's inline SVG data URI moves unchanged.

- [ ] **Step 4: Delete the scratch file**

```powershell
Remove-Item .theme-tokens-body.txt
```

- [ ] **Step 5: Type-check the new file in isolation**

```powershell
npx tsc --noEmit src/lib/theme.ts
```

Expected: succeeds (or only reports errors from missing project-wide config, not from the file's own content; if `tsc` complains about isolated-file mode, instead run the full `npm run build` after Step 7 as the real gate).

- [ ] **Step 6: Replace the App.tsx const with an import + reference**

Delete the entire `const themeTokens = { ... };` block from `App.tsx` (the same range identified in Step 1). Add the import near the top of `App.tsx`, alongside the other `./lib/` imports (e.g. right after the `import { IS_WEB } from './lib/env';` line found via `grep -n "from './lib/env'" src/App.tsx`):

```ts
import { THEME_TOKENS } from './lib/theme';
```

Then find the line that referenced the deleted const:

```powershell
grep -n "const t = useMemo(() => themeTokens\[theme\]" src/App.tsx
```

Replace `themeTokens` with `THEME_TOKENS` on that line:

```ts
// before:
  const t = useMemo(() => themeTokens[theme] || themeTokens.dark, [theme]);
// after:
  const t = useMemo(() => THEME_TOKENS[theme] || THEME_TOKENS.dark, [theme]);
```

- [ ] **Step 7: Grep-verify no dangling reference**

```powershell
grep -n "themeTokens" src/App.tsx
```

Expected: zero matches (everything now reads `THEME_TOKENS`). If any match remains, it's a leftover reference to the deleted local const, fix it before continuing.

- [ ] **Step 8: Fix the `slugify` duplicate**

```powershell
grep -n "const slugify = (name) => {" src/App.tsx
grep -n "export const slugify" src/lib/palette.ts
```

Confirm `src/lib/palette.ts`'s exported `slugify` has the identical signature/behavior (`(name: string): string`). Then in `App.tsx`, delete the local `const slugify = (name) => { ... };` block entirely, and add to the existing import block from `./lib/palette` (find it via `grep -n "from './lib/palette'" src/App.tsx`):

```ts
// if the existing import is:
import type { GamutStrategySerialized } from './lib/palette';
// change to:
import type { GamutStrategySerialized } from './lib/palette';
import { slugify } from './lib/palette';
```

(If `./lib/palette` is already imported for a value, not just a type, add `slugify` to that existing named-import list instead of a new line.)

- [ ] **Step 9: Grep-verify the slugify fix**

```powershell
grep -n "slugify" src/App.tsx
```

Expected: one `import { slugify } from './lib/palette';` line plus the existing call site(s) (e.g. inside `saveCurrentPalette`), zero `const slugify = ` definitions.

- [ ] **Step 10: Build and test**

```powershell
npm run build
npm test
```

Expected: both succeed. `npm run build` type-checks `src/lib/theme.ts` for real (not the isolated-file check from Step 5) and confirms `App.tsx`'s two import additions resolve.

- [ ] **Step 11: Manual smoke check**

Run `npm run tauri:dev`, switch between Dark/Neutral/Light themes in the theme switcher, confirm each renders identically to before (Light theme's Jazz-pattern background in particular, since its data URI is the largest single value moved).

- [ ] **Step 12: Update `docs/ARCHITECTURE.md`**

Add a note to the state-management or file-map section: theme token data (`THEME_TOKENS`, dark/neutral/light) now lives in `src/lib/theme.ts`, no longer inline in `App.tsx`.

- [ ] **Step 13: Commit**

```powershell
git add src/lib/theme.ts src/App.tsx docs/ARCHITECTURE.md
git commit -m "refactor: extract themeTokens to lib/theme.ts, dedupe slugify import"
```

- [ ] **Step 14: Full verification pass and PR**

```powershell
npm run deadcode
npm run test:e2e
npm run build:web
npx playwright test --config=playwright.web.config.ts
```

Expected: all pass, no new orphaned exports, no e2e regressions (no user-visible text/role changed in this slice). Push the branch and open a PR against `master`.

---

## Task 2: Export handlers → `src/lib/export.ts` + `src/hooks/useExport.ts`

**Files:**
- Create: `src/lib/export.ts`
- Create: `src/hooks/useExport.ts`
- Test: `tests/unit/export.spec.ts`
- Modify: `src/App.tsx` (delete 22 handler functions, add imports, call the new hook)

**Interfaces:**
- Consumes: `THEME_TOKENS`/`slugify` unaffected (Task 1 already landed and merged before this task starts). `useExportSettings()` (existing, `src/hooks/useExportSettings.ts`, unchanged): returns `gplStyle, setGplStyle, exportFormat, setExportFormat, rampExportStyle, setRampExportStyle, copiedHex, setCopiedHex, exportFeedback, setExportFeedback, lastSavedPath, setLastSavedPath, sessionRampGplFolder, setSessionRampGplFolder`.
- Produces: `useExport(params)`, a hook returning the same 22 handler names App.tsx destructures today: `copyHex, buildPaletteText, exportPalette, exportLightnessPng, exportMosaicPng, exportMatrixPng, exportDitherPng, copyPaletteToClipboard, collectPaletteEntries, buildPaletteGpl, exportPaletteGpl, exportPalettePal, exportPaletteAse, exportPaletteStripPng, exportActiveFormat, revealLastSaved, buildSingleRampText, buildSingleRampGpl, copyRampToClipboard, downloadSingleRampGpl`. (`_selectRampsForStyle` and `_filteredRamp` are internal helpers, not returned, since no external caller uses them today, verify this in Step 1.)

- [ ] **Step 1: Confirm the exact function list and boundaries, and check for external callers of the two underscore-prefixed helpers**

```powershell
grep -n "^  const copyHex = \|^  const buildPaletteText = \|^  const exportPalette = \|^  const exportLightnessPng = \|^  const exportMosaicPng = \|^  const exportMatrixPng = \|^  const exportDitherPng = \|^  const copyPaletteToClipboard = \|^  const collectPaletteEntries = \|^  const buildPaletteGpl = \|^  const exportPaletteGpl = \|^  const exportPalettePal = \|^  const exportPaletteAse = \|^  const exportPaletteStripPng = \|^  const exportActiveFormat = \|^  const revealLastSaved = \|^  const _selectRampsForStyle = \|^  const _filteredRamp = \|^  const buildSingleRampText = \|^  const buildSingleRampGpl = \|^  const copyRampToClipboard = \|^  const downloadSingleRampGpl = " src/App.tsx
grep -n "_selectRampsForStyle(\|_filteredRamp(" src/App.tsx
```

Expected: 22 definition lines in this order (verify order matches; if `App.tsx` has since reordered them, use the live order), and the two `_`-prefixed helpers' call sites are only inside this same block (they're private to the export domain). If either is called from outside this block, add it to the hook's returned object too.

- [ ] **Step 2: Pull the full text of the block for reference**

```powershell
node -e "
const fs = require('fs');
const src = fs.readFileSync('src/App.tsx', 'utf8').split('\n');
const startIdx = src.findIndex(l => l.includes('const copyHex = async (hex)'));
const endIdx = src.findIndex((l, i) => i > startIdx && l.includes('const themeTokens = {') || i > startIdx && l.includes('const THEME_TOKENS'));
console.log('start', startIdx + 1);
"
grep -n "const t = useMemo(() => THEME_TOKENS\[theme\]" src/App.tsx
```

Use `sed -n 'STARTLINE,ENDLINEp' src/App.tsx` (with the live line numbers from Step 1's first match through the line immediately before the `themeTokens`/`THEME_TOKENS` comment block) to read the full current text of all 22 functions before writing Steps 3-4. Do not invent function bodies; copy the real current text.

- [ ] **Step 3: Write `src/lib/export.ts`** (pure formatting/build functions, no state, no side effects beyond returning data or calling `saveFile`)

```ts
// src/lib/export.ts
import { saveFile } from './save-file';
import { dedupeHexes } from './hex-utils';
import { buildGpl, buildJascPal, buildAse } from './palette-export';
import {
  computeVizData,
  drawLightnessStripPng,
  drawMosaicPng,
  drawAdjacencyMatrixPng,
  drawDitherBlendPng,
  drawPaletteStripPng,
} from './strip-export';
import { hexToRgb } from './color';

export interface HarmonySet {
  complementary: string;
  analogous1: string; analogous2: string;
  triadic1: string; triadic2: string;
  splitComp1: string; splitComp2: string;
  tetradic1: string; tetradic2: string; tetradic3: string;
  square1: string; square2: string; square3: string;
}

export function buildPaletteText(params: {
  baseColors: string[];
  aiColorNames: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  harmony: HarmonySet;
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
}): string {
  const { baseColors, aiColorNames, rampsPunchy, rampsBalanced, rampsMuted, harmony, resolveBaseForRamp, labelsForRamp, filterHidden } = params;
  const lines = ['# PIXEL.PAL Palette Export', `# Generated ${new Date().toLocaleString()}`, ''];

  baseColors.forEach((_, i) => {
    const name = aiColorNames[i] || `Color ${i + 1}`;
    const punchy = rampsPunchy[i];
    const balanced = rampsBalanced[i];
    const muted = rampsMuted[i];
    const effectiveBase = resolveBaseForRamp(baseColors[i], i);
    const labelsP = labelsForRamp(punchy, effectiveBase);
    const labelsB = labelsForRamp(balanced, effectiveBase);
    const labelsM = labelsForRamp(muted, effectiveBase);
    const fP = filterHidden(punchy, labelsP, i);
    const fB = filterHidden(balanced, labelsB, i);
    const fM = filterHidden(muted, labelsM, i);
    lines.push(`## ${name}`);
    lines.push('### Punchy');
    fP.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fP.labels[k]}`));
    lines.push('### Balanced');
    fB.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fB.labels[k]}`));
    lines.push('### Muted');
    fM.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fM.labels[k]}`));
    lines.push('');
  });
  lines.push('## Harmony Colors');
  lines.push(`${harmony.complementary.toUpperCase()}  complementary`);
  lines.push(`${harmony.analogous1.toUpperCase()}  analogous 1`);
  lines.push(`${harmony.analogous2.toUpperCase()}  analogous 2`);
  lines.push(`${harmony.triadic1.toUpperCase()}  triadic 1`);
  lines.push(`${harmony.triadic2.toUpperCase()}  triadic 2`);
  lines.push(`${harmony.splitComp1.toUpperCase()}  split-complementary 1`);
  lines.push(`${harmony.splitComp2.toUpperCase()}  split-complementary 2`);
  lines.push(`${harmony.tetradic1.toUpperCase()}  tetradic 1`);
  lines.push(`${harmony.tetradic2.toUpperCase()}  tetradic 2`);
  lines.push(`${harmony.tetradic3.toUpperCase()}  tetradic 3`);
  lines.push(`${harmony.square1.toUpperCase()}  square 1`);
  lines.push(`${harmony.square2.toUpperCase()}  square 2`);
  lines.push(`${harmony.square3.toUpperCase()}  square 3`);
  lines.push('');
  lines.push('## Unique Colors');
  const allStyleHexes = [
    ...rampsPunchy.flat(),
    ...rampsBalanced.flat(),
    ...rampsMuted.flat(),
    harmony.complementary,
    harmony.analogous1, harmony.analogous2,
    harmony.triadic1, harmony.triadic2,
    harmony.splitComp1, harmony.splitComp2,
    harmony.tetradic1, harmony.tetradic2, harmony.tetradic3,
    harmony.square1, harmony.square2, harmony.square3,
  ];
  const uniqueColors = dedupeHexes(allStyleHexes);
  uniqueColors.forEach(hex => lines.push(hex.toUpperCase()));
  lines.push(`# ${uniqueColors.length} unique colors`);
  return lines.join('\n');
}

export function collectPaletteEntries(params: {
  style: 'punchy' | 'balanced' | 'muted';
  baseColors: string[];
  aiColorNames: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  harmony: HarmonySet;
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
}): { hex: string; name: string }[] {
  const { style, baseColors, aiColorNames, rampsPunchy, rampsBalanced, rampsMuted, harmony, resolveBaseForRamp, labelsForRamp, filterHidden } = params;
  const entries: { hex: string; name: string }[] = [];
  const ramps = style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;
  baseColors.forEach((_, i) => {
    const name = aiColorNames[i] || `Color ${i + 1}`;
    const ramp = ramps[i];
    const effectiveBase = resolveBaseForRamp(baseColors[i], i);
    const labels = labelsForRamp(ramp, effectiveBase);
    const filtered = filterHidden(ramp, labels, i);
    filtered.hexes.forEach((hex, k) => entries.push({ hex, name: `${name} ${filtered.labels[k]}` }));
  });
  entries.push({ hex: harmony.complementary, name: 'harmony complementary' });
  entries.push({ hex: harmony.analogous1, name: 'harmony analogous 1' });
  entries.push({ hex: harmony.analogous2, name: 'harmony analogous 2' });
  entries.push({ hex: harmony.triadic1, name: 'harmony triadic 1' });
  entries.push({ hex: harmony.triadic2, name: 'harmony triadic 2' });
  entries.push({ hex: harmony.splitComp1, name: 'harmony split-comp 1' });
  entries.push({ hex: harmony.splitComp2, name: 'harmony split-comp 2' });
  entries.push({ hex: harmony.tetradic1, name: 'harmony tetradic 1' });
  entries.push({ hex: harmony.tetradic2, name: 'harmony tetradic 2' });
  entries.push({ hex: harmony.tetradic3, name: 'harmony tetradic 3' });
  entries.push({ hex: harmony.square1, name: 'harmony square 1' });
  entries.push({ hex: harmony.square2, name: 'harmony square 2' });
  entries.push({ hex: harmony.square3, name: 'harmony square 3' });

  const seenHex = new Set<string>();
  const unique: { hex: string; name: string }[] = [];
  for (const e of entries) {
    const key = (e.hex || '').toLowerCase();
    if (!key || seenHex.has(key)) continue;
    seenHex.add(key);
    unique.push(e);
  }
  return unique;
}

export function buildPaletteGpl(params: Parameters<typeof collectPaletteEntries>[0] & { rampSize: number }): string {
  const styleLabel = params.style === 'balanced' ? 'Balanced' : params.style === 'muted' ? 'Muted' : 'Punchy';
  return buildGpl(collectPaletteEntries(params), { paletteName: `PIXEL.PAL ${styleLabel}`, columns: params.rampSize });
}

export function selectRampsForStyle(style: 'punchy' | 'balanced' | 'muted', rampsPunchy: string[][], rampsBalanced: string[][], rampsMuted: string[][]): string[][] {
  return style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;
}

export function filteredRamp(params: {
  i: number;
  style: 'punchy' | 'balanced' | 'muted';
  baseColors: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
}): { hexes: string[]; labels: string[] } {
  const { i, style, baseColors, rampsPunchy, rampsBalanced, rampsMuted, resolveBaseForRamp, labelsForRamp, filterHidden } = params;
  const ramps = selectRampsForStyle(style, rampsPunchy, rampsBalanced, rampsMuted);
  const ramp = ramps[i];
  const effectiveBase = resolveBaseForRamp(baseColors[i], i);
  const labels = labelsForRamp(ramp, effectiveBase);
  return filterHidden(ramp, labels, i);
}

export function buildSingleRampText(filtered: { hexes: string[] }): string {
  return dedupeHexes(filtered.hexes).join('\n') + '\n';
}

export function buildSingleRampGpl(params: {
  filtered: { hexes: string[]; labels: string[] };
  i: number;
  style: 'punchy' | 'balanced' | 'muted';
  aiColorNames: string[];
}): string {
  const { filtered, i, style, aiColorNames } = params;
  const name = aiColorNames[i] || `Color ${i + 1}`;
  const seenHex = new Set<string>();
  const entries: { hex: string; label: string }[] = [];
  for (let k = 0; k < filtered.hexes.length; k++) {
    const key = (filtered.hexes[k] || '').toLowerCase();
    if (!key || seenHex.has(key)) continue;
    seenHex.add(key);
    entries.push({ hex: filtered.hexes[k], label: filtered.labels[k] });
  }
  const pad3 = (n: number) => String(n).padStart(3, ' ');
  const styleLabel = style === 'balanced' ? 'Balanced' : style === 'muted' ? 'Muted' : 'Punchy';
  const lines = [
    'GIMP Palette',
    `Name: PIXEL.PAL ${name} ${styleLabel}`,
    `Columns: ${entries.length}`,
    '#',
  ];
  entries.forEach(({ hex, label }) => {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${pad3(r)} ${pad3(g)} ${pad3(b)}\t${name} ${label}`);
  });
  return lines.join('\n') + '\n';
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  let success = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); success = true; } catch {}
  }
  if (!success) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      success = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {}
  }
  return success;
}
```

`copyTextToClipboard` is a new shared helper factoring out the identical clipboard-API-then-textarea-fallback pattern that `copyHex`, `copyPaletteToClipboard`, `copyRampToClipboard`, and `copySpriteSource` (sprite import, out of scope, do not touch) all repeat inline today. Only `copyHex`/`copyPaletteToClipboard`/`copyRampToClipboard` are moved in this slice; use `copyTextToClipboard` inside their hook implementations in Step 4, do not change `copySpriteSource` (App.tsx, out of scope).

- [ ] **Step 4: Write `src/hooks/useExport.ts`**

```ts
// src/hooks/useExport.ts
import {
  buildPaletteText as buildPaletteTextLib,
  collectPaletteEntries as collectPaletteEntriesLib,
  buildPaletteGpl as buildPaletteGplLib,
  selectRampsForStyle,
  filteredRamp,
  buildSingleRampText as buildSingleRampTextLib,
  buildSingleRampGpl as buildSingleRampGplLib,
  copyTextToClipboard,
  type HarmonySet,
} from '../lib/export';
import { saveFile } from '../lib/save-file';
import { buildJascPal, buildAse } from '../lib/palette-export';
import {
  computeVizData,
  drawLightnessStripPng,
  drawMosaicPng,
  drawAdjacencyMatrixPng,
  drawDitherBlendPng,
  drawPaletteStripPng,
} from '../lib/strip-export';

interface UseExportParams {
  baseColors: string[];
  aiColorNames: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  harmony: HarmonySet;
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
  buildRampsForSnapshot: (snap: any, style: string) => string[][];
  rampSize: number;
  vizStyle: string;
  gplStyle: string;
  rampExportStyle: 'punchy' | 'balanced' | 'muted';
  exportFormat: string;
  matrixColorSet: string;
  matrixView: string;
  ditherPattern: string;
  copiedHex: string | null;
  setCopiedHex: (v: string | null) => void;
  exportFeedback: string;
  setExportFeedback: (v: string) => void;
  lastSavedPath: string | null;
  setLastSavedPath: (v: string | null) => void;
  sessionRampGplFolder: string | null;
  setSessionRampGplFolder: (v: string | null) => void;
}

export function useExport(p: UseExportParams) {
  const buildPaletteText = () => buildPaletteTextLib(p);

  const copyHex = async (hex: string) => {
    const success = await copyTextToClipboard(hex);
    p.setCopiedHex(success ? hex : 'FAIL:' + hex);
    setTimeout(() => p.setCopiedHex(null), success ? 1000 : 1500);
  };

  const exportPalette = async () => {
    const text = buildPaletteText();
    return await saveFile({
      defaultName: 'pixel-pal-palette.txt',
      filters: [{ name: 'Pixel Pal palette', extensions: ['txt'] }],
      data: { text },
      folderKey: 'txt',
    });
  };

  const exportLightnessPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
      const { sortedByL } = computeVizData(ramps);
      if (sortedByL.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawLightnessStripPng(sortedByL);
      const result = await saveFile({
        defaultName: 'pixel-pal-lightness.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportMosaicPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r: any) => r.hexes);
      if (rows.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawMosaicPng(rows);
      const result = await saveFile({
        defaultName: 'pixel-pal-mosaic.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportMatrixPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
      const { allColors } = computeVizData(ramps);
      const colors = p.matrixColorSet === 'bases'
        ? (Array.isArray(snap?.baseColors) ? snap.baseColors : [])
        : allColors;
      if (colors.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawAdjacencyMatrixPng(colors, { view: p.matrixView });
      const result = await saveFile({
        defaultName: 'pixel-pal-adjacency.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportDitherPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r: any) => r.hexes);
      if (rows.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawDitherBlendPng(rows, { pattern: p.ditherPattern });
      const result = await saveFile({
        defaultName: 'pixel-pal-dither.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const copyPaletteToClipboard = async () => {
    const text = buildPaletteText();
    const success = await copyTextToClipboard(text);
    p.setExportFeedback(success ? 'Copied!' : 'Copy failed');
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  const collectPaletteEntries = (style: 'punchy' | 'balanced' | 'muted') => collectPaletteEntriesLib({ style, ...p });

  const buildPaletteGpl = (style: 'punchy' | 'balanced' | 'muted') => buildPaletteGplLib({ style, ...p });

  const exportPaletteGpl = async () => {
    const text = buildPaletteGpl(p.gplStyle as 'punchy' | 'balanced' | 'muted');
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}.gpl`,
      filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
      data: { text },
      folderKey: 'gpl',
    });
  };

  const exportPalettePal = async () => {
    const text = buildJascPal(collectPaletteEntries(p.gplStyle as 'punchy' | 'balanced' | 'muted'));
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}.pal`,
      filters: [{ name: 'JASC palette', extensions: ['pal'] }],
      data: { text },
      folderKey: 'pal',
    });
  };

  const exportPaletteAse = async () => {
    const bytes = buildAse(collectPaletteEntries(p.gplStyle as 'punchy' | 'balanced' | 'muted'));
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}.ase`,
      filters: [{ name: 'Adobe Swatch Exchange', extensions: ['ase'] }],
      data: { bytes },
      folderKey: 'ase',
    });
  };

  const exportPaletteStripPng = async () => {
    const rows = p.baseColors.map((_, i) => filteredRamp({ i, style: p.gplStyle as 'punchy' | 'balanced' | 'muted', ...p }).hexes);
    const blob = await drawPaletteStripPng(rows, 32);
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}-strip.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      data: { bytes: blob },
      folderKey: 'png',
    });
  };

  const exportActiveFormat = async () => {
    const runner =
      p.exportFormat === 'txt' ? exportPalette :
      p.exportFormat === 'pal' ? exportPalettePal :
      p.exportFormat === 'ase' ? exportPaletteAse :
      p.exportFormat === 'png-strip' ? exportPaletteStripPng :
      exportPaletteGpl;
    try {
      const result = await runner();
      if (result?.canceled) { p.setExportFeedback('Save canceled'); }
      else if (!result?.ok) { p.setExportFeedback('Export failed'); }
      else {
        p.setExportFeedback('Downloaded!');
        if (result.path) p.setLastSavedPath(result.path);
      }
    } catch {
      p.setExportFeedback('Export failed');
    }
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  const revealLastSaved = async () => {
    if (!p.lastSavedPath) return;
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(p.lastSavedPath);
    } catch {
      p.setExportFeedback("Couldn't open folder");
      setTimeout(() => p.setExportFeedback(''), 2000);
    }
  };

  const buildSingleRampText = (i: number, style: 'punchy' | 'balanced' | 'muted') =>
    buildSingleRampTextLib(filteredRamp({ i, style, ...p }));

  const buildSingleRampGpl = (i: number, style: 'punchy' | 'balanced' | 'muted') =>
    buildSingleRampGplLib({ filtered: filteredRamp({ i, style, ...p }), i, style, aiColorNames: p.aiColorNames });

  const copyRampToClipboard = async (i: number) => {
    const text = buildSingleRampText(i, p.rampExportStyle);
    const count = text.trim().split('\n').length;
    const success = await copyTextToClipboard(text);
    p.setExportFeedback(success ? `Copied ${count} shade${count === 1 ? '' : 's'}` : 'Copy failed');
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  const downloadSingleRampGpl = async (i: number) => {
    try {
      const text = buildSingleRampGpl(i, p.rampExportStyle);
      const defaultName = `pixel-pal-ramp-${i + 1}-${p.rampExportStyle}.gpl`;
      const result = await saveFile({
        defaultName,
        filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
        data: { text },
        folderKey: 'gpl',
        silentToFolder: p.sessionRampGplFolder,
      });
      if (result.canceled) {
        p.setExportFeedback('Save canceled');
      } else if (!result.ok) {
        if (p.sessionRampGplFolder) {
          p.setSessionRampGplFolder(null);
          p.setExportFeedback('Folder unavailable, pick a new one');
        } else {
          p.setExportFeedback('Ramp GPL export failed');
        }
      } else {
        if (result.folder && result.folder !== p.sessionRampGplFolder) {
          p.setSessionRampGplFolder(result.folder);
        }
        if (p.sessionRampGplFolder && result.folder) {
          p.setExportFeedback(`Saved ramp ${i + 1}.gpl to ${result.folder}`);
        } else {
          p.setExportFeedback(`Downloaded ramp ${i + 1}.gpl`);
        }
      }
      setTimeout(() => p.setExportFeedback(''), 2500);
    } catch {
      p.setExportFeedback('Ramp GPL export failed');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  return {
    copyHex, buildPaletteText, exportPalette, exportLightnessPng, exportMosaicPng,
    exportMatrixPng, exportDitherPng, copyPaletteToClipboard, collectPaletteEntries,
    buildPaletteGpl, exportPaletteGpl, exportPalettePal, exportPaletteAse,
    exportPaletteStripPng, exportActiveFormat, revealLastSaved, buildSingleRampText,
    buildSingleRampGpl, copyRampToClipboard, downloadSingleRampGpl,
  };
}
```

- [ ] **Step 5: Write unit tests for the pure `lib/export.ts` functions**

```ts
// tests/unit/export.spec.ts
import { describe, it, expect } from 'vitest';
import { buildPaletteText, collectPaletteEntries, buildSingleRampGpl, filteredRamp } from '../../src/lib/export';

const harmony = {
  complementary: '#111111', analogous1: '#222222', analogous2: '#333333',
  triadic1: '#444444', triadic2: '#555555', splitComp1: '#666666', splitComp2: '#777777',
  tetradic1: '#888888', tetradic2: '#999999', tetradic3: '#aaaaaa',
  square1: '#bbbbbb', square2: '#cccccc', square3: '#dddddd',
};

const resolveBaseForRamp = (hex: string) => hex;
const labelsForRamp = (ramp: string[]) => ramp.map((_, i) => `slot${i}`);
const filterHidden = (ramp: string[], labels: string[]) => ({ hexes: ramp, labels });

describe('buildPaletteText', () => {
  it('includes each base color name and its punchy/balanced/muted sections', () => {
    const text = buildPaletteText({
      baseColors: ['#ff00ff'],
      aiColorNames: ['Magenta'],
      rampsPunchy: [['#000000', '#ff00ff', '#ffffff']],
      rampsBalanced: [['#010101', '#fe00fe', '#fefefe']],
      rampsMuted: [['#020202', '#fd00fd', '#fdfdfd']],
      harmony, resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    expect(text).toContain('## Magenta');
    expect(text).toContain('### Punchy');
    expect(text).toContain('FF00FF  slot1');
    expect(text).toContain('## Unique Colors');
  });
});

describe('collectPaletteEntries', () => {
  it('dedupes by hex across ramps and harmony', () => {
    const entries = collectPaletteEntries({
      style: 'punchy',
      baseColors: ['#ff00ff'],
      aiColorNames: ['Magenta'],
      rampsPunchy: [['#111111', '#ff00ff']],
      rampsBalanced: [[]], rampsMuted: [[]],
      harmony: { ...harmony, complementary: '#111111' },
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const hexes = entries.map(e => e.hex.toLowerCase());
    expect(hexes.filter(h => h === '#111111')).toHaveLength(1);
  });
});

describe('filteredRamp + buildSingleRampGpl', () => {
  it('builds a GIMP palette block scoped to one ramp', () => {
    const filtered = filteredRamp({
      i: 0, style: 'punchy',
      baseColors: ['#ff00ff'],
      rampsPunchy: [['#000000', '#ff00ff']],
      rampsBalanced: [[]], rampsMuted: [[]],
      resolveBaseForRamp, labelsForRamp, filterHidden,
    });
    const gpl = buildSingleRampGpl({ filtered, i: 0, style: 'punchy', aiColorNames: ['Magenta'] });
    expect(gpl).toContain('GIMP Palette');
    expect(gpl).toContain('Name: PIXEL.PAL Magenta Punchy');
    expect(gpl).toContain('Columns: 2');
  });
});
```

- [ ] **Step 6: Run the new tests to verify they fail (files don't exist yet)**

```powershell
npx vitest run tests/unit/export.spec.ts
```

Expected: FAIL, `Cannot find module '../../src/lib/export'`.

- [ ] **Step 7: Create the files from Steps 3-4, then re-run**

```powershell
npx vitest run tests/unit/export.spec.ts
```

Expected: PASS, all 3 tests.

- [ ] **Step 8: Delete the 22 functions from `App.tsx` and wire in the hook**

Using the boundaries confirmed in Step 1, delete the entire block from `const copyHex = async (hex) => {` through the end of `const downloadSingleRampGpl = async (i) => { ... };` (inclusive), including the `_selectRampsForStyle`/`_filteredRamp` helpers and their preceding comment blocks.

Find where `usePaletteState()` (or the ramps store, per phase b) and `useExportSettings()` are called (`grep -n "useExportSettings()" src/App.tsx`), and immediately after that line add:

```ts
  const {
    copyHex, buildPaletteText, exportPalette, exportLightnessPng, exportMosaicPng,
    exportMatrixPng, exportDitherPng, copyPaletteToClipboard, collectPaletteEntries,
    buildPaletteGpl, exportPaletteGpl, exportPalettePal, exportPaletteAse,
    exportPaletteStripPng, exportActiveFormat, revealLastSaved, buildSingleRampText,
    buildSingleRampGpl, copyRampToClipboard, downloadSingleRampGpl,
  } = useExport({
    baseColors, aiColorNames, rampsPunchy, rampsBalanced, rampsMuted, harmony,
    resolveBaseForRamp, labelsForRamp, filterHidden, buildRampsForSnapshot,
    rampSize, vizStyle, gplStyle, rampExportStyle, exportFormat,
    matrixColorSet, matrixView, ditherPattern,
    copiedHex, setCopiedHex, exportFeedback, setExportFeedback,
    lastSavedPath, setLastSavedPath, sessionRampGplFolder, setSessionRampGplFolder,
  });
```

This call must come after `rampsPunchy`/`rampsBalanced`/`rampsMuted`/`harmony` are defined (they're `useMemo`s further down in the ramp-core block). If `useExport` is called before them, move the call to immediately after the `harmony` `useMemo` instead, and confirm with `grep -n "const harmony = useMemo" src/App.tsx`.

Add the import at the top of `App.tsx`:

```ts
import { useExport } from './hooks/useExport';
```

- [ ] **Step 9: Grep-verify no dangling definitions**

```powershell
grep -n "const copyHex = \|const buildPaletteText = \|const exportPalette = \|const exportLightnessPng = \|const exportMosaicPng = \|const exportMatrixPng = \|const exportDitherPng = \|const copyPaletteToClipboard = \|const collectPaletteEntries = \|const buildPaletteGpl = \|const exportPaletteGpl = \|const exportPalettePal = \|const exportPaletteAse = \|const exportPaletteStripPng = \|const exportActiveFormat = \|const revealLastSaved = \|const _selectRampsForStyle = \|const _filteredRamp = \|const buildSingleRampText = \|const buildSingleRampGpl = \|const copyRampToClipboard = \|const downloadSingleRampGpl = " src/App.tsx
```

Expected: zero matches (all 22 are gone from `App.tsx`, only referenced via the `useExport(...)` destructure now).

- [ ] **Step 10: Build and test**

```powershell
npm run build
npm test
```

Expected: both succeed.

- [ ] **Step 11: Manual smoke check**

Run `npm run tauri:dev`. Exercise: copy a single hex swatch, copy the full palette, export .txt/.gpl/.pal/.ase/png-strip, export each Visualization PNG (lightness/mosaic/matrix/dither), copy a single ramp, download a single ramp .gpl, click Reveal after a desktop save. Confirm feedback messages and file contents match pre-change behavior.

- [ ] **Step 12: Update `docs/ARCHITECTURE.md`**

Note that export/copy/download handlers now live in `src/lib/export.ts` (pure) + `src/hooks/useExport.ts` (stateful wrapper around the existing `useExportSettings()` state), no longer inline in `App.tsx`.

- [ ] **Step 13: Commit**

```powershell
git add src/lib/export.ts src/hooks/useExport.ts tests/unit/export.spec.ts src/App.tsx docs/ARCHITECTURE.md
git commit -m "refactor: extract export handlers to lib/export.ts + useExport hook"
```

- [ ] **Step 14: Full verification pass and PR**

```powershell
npm run deadcode
npm run test:e2e
npm run build:web
npx playwright test --config=playwright.web.config.ts
```

Expected: all pass. Push and open a PR against `master`.

---

## Task 3: Ramp pure-helper cluster → `src/lib/ramp-helpers.ts`

**Files:**
- Create: `src/lib/ramp-helpers.ts`
- Test: `tests/unit/ramp-helpers.spec.ts`
- Modify: `src/App.tsx` (delete 8 functions, add import, update every call site of the 4 functions whose signature gains new parameters)

**Interfaces:**
- Produces: `shadeLabelsFor(n)`, `labelsForRamp(sortedRamp, baseHex)`, `applyOverrides(ramp, baseIndex, overrideMap, style)` (all three unchanged signatures, zero closures originally, verify in Step 1), `filterHidden(ramp, labels, baseIndex, hiddenShades)` (NEW 4th param), `resolveBaseForRamp(hex, baseIndex, rampSatOverrides)` (NEW 3rd param), `resolveSizeForRamp(baseIndex, rampSizeOverrides, rampSize)` (NEW 2nd/3rd params), `resolveHueShiftForRamp(baseIndex, hueShiftStrengthPerRamp, hueShiftStrength)` (NEW 2nd/3rd params), `generateRamp(baseHex, numColors, style, hueShiftStrength, rampIdx, closureState)` (NEW 6th param, an object bundling `gamutPerRamp, stylePresets, shuffleSeed, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp`).

- [ ] **Step 1: Verify closures per function with a fresh read**

```powershell
grep -n "^  const shadeLabelsFor = \|^  const labelsForRamp = \|^  const applyOverrides = \|^  const filterHidden = \|^  const resolveBaseForRamp = \|^  const resolveSizeForRamp = \|^  const resolveHueShiftForRamp = \|^  const generateRamp = " src/App.tsx
```

For each match, read the function body (`sed -n 'STARTLINE,+30p' src/App.tsx` using the live line number) and list every identifier it reads that isn't a parameter or a local. Confirm against this plan's parameter list above:
- `shadeLabelsFor`: no closures (only reads its parameter `n`).
- `labelsForRamp`: calls `shadeLabelsFor`, no closures.
- `applyOverrides`: no closures (`overrideMap` is already a parameter).
- `filterHidden`: closures over `hiddenShades`.
- `resolveBaseForRamp`: closures over `rampSatOverrides`, calls `hexToHsl`/`hslToHex` (imports, not App.tsx state, stay as imports in the new file).
- `resolveSizeForRamp`: closures over `rampSizeOverrides` and `rampSize`.
- `resolveHueShiftForRamp`: closures over `hueShiftStrengthPerRamp` and `hueShiftStrength`.
- `generateRamp`: closures over `gamutPerRamp`, `stylePresets`, `shuffleSeed`, `rampShuffleOffsets`, `lightnessCurvePerRamp`, `satCurvePerRamp`; calls `styleToScalars`, `seededHueDelta`, `generateRampNew` (imports, stay as imports), and `LIGHTNESS_PRESETS.eased`/`SAT_PRESETS.flat` (imported constants, stay as imports).

If this read finds a closure not listed above (or lists one that no longer exists), stop and correct this task's signatures before writing code, do not silently extract diverged logic.

- [ ] **Step 2: Find every call site of the 4 functions gaining parameters**

```powershell
grep -n "filterHidden(\|resolveBaseForRamp(\|resolveSizeForRamp(\|resolveHueShiftForRamp(\|generateRamp(" src/App.tsx
```

Expected (as of this plan's writing; re-verify live): call sites inside the image-remap block (`getActiveRemapPalette`), the hardware-lock bake block, and inside the export block (now in `src/hooks/useExport.ts` after Task 2, not `App.tsx`, if Task 2 has already merged). If Task 3 runs before Task 2 merges, its export-block call sites are still in `App.tsx` and must be updated too; if Task 2 already merged, update the corresponding calls in `src/hooks/useExport.ts` and `src/lib/export.ts` instead. List every match now and confirm each one gets updated in Step 6.

- [ ] **Step 3: Pull the full text of the 8 functions**

```powershell
sed -n 'STARTLINE,ENDLINEp' src/App.tsx
```

Using the live line numbers from Step 1 (start of `shadeLabelsFor` through the end of `generateRamp`, i.e. up to but not including the `liveRampSnapshot` comment block). Use this real text, not invented text, for Step 4.

- [ ] **Step 4: Write `src/lib/ramp-helpers.ts`**

```ts
// src/lib/ramp-helpers.ts
import { hexToHsl, hslToHex } from './color';
import { generateRamp as generateRampNew } from './ramp-engine';
import { styleToScalars, type StylePresets } from './style-presets';
import { seededHueDelta } from './snapshot-ramps';
import { LIGHTNESS_PRESETS, SAT_PRESETS, type CurvePoints } from './curve';
import type { GamutStrategySerialized } from './palette';

export function shadeLabelsFor(n: number): string[] {
  if (n === 4) return ['outline', 'shadow', 'base', 'highlight'];
  if (n === 5) return ['outline', 'shadow', 'base', 'highlight', 'bright'];
  if (n === 6) return ['outline', 'deep shadow', 'shadow', 'base', 'highlight', 'bright'];
  if (n === 7) return ['outline', 'deep shadow', 'shadow', 'base', 'mid highlight', 'highlight', 'bright'];
  return ['outline', 'deep shadow', 'shadow', 'mid shadow', 'base', 'mid highlight', 'highlight', 'bright'];
}

export function labelsForRamp(sortedRamp: string[], baseHex: string): string[] {
  const n = sortedRamp.length;
  const defaultLabels = shadeLabelsFor(n);
  if (typeof baseHex !== 'string') return defaultLabels;
  const target = baseHex.toLowerCase();
  let basePos = -1;
  for (let i = 0; i < sortedRamp.length; i++) {
    if (sortedRamp[i].toLowerCase() === target) { basePos = i; break; }
  }
  if (basePos < 0) return defaultLabels;
  const defaultBasePos = defaultLabels.indexOf('base');
  if (defaultBasePos < 0 || defaultBasePos === basePos) {
    return defaultLabels;
  }
  const darkSrc = defaultLabels.slice(0, defaultBasePos);
  const lightSrc = defaultLabels.slice(defaultBasePos + 1);
  const labels = new Array(n);
  labels[basePos] = 'base';
  const darkNeeded = basePos;
  if (darkNeeded <= darkSrc.length) {
    const keep = darkSrc.slice(0, darkNeeded);
    for (let i = 0; i < darkNeeded; i++) labels[i] = keep[i];
  } else {
    for (let i = 0; i < darkSrc.length; i++) labels[i] = darkSrc[i];
    const nearBase = darkSrc[darkSrc.length - 1] || 'shadow';
    let dupIdx = 2;
    for (let i = darkSrc.length; i < darkNeeded; i++) {
      labels[i] = `${nearBase} ${dupIdx++}`;
    }
  }
  const lightNeeded = n - basePos - 1;
  if (lightNeeded <= lightSrc.length) {
    const keep = lightSrc.slice(lightSrc.length - lightNeeded);
    for (let i = 0; i < lightNeeded; i++) labels[basePos + 1 + i] = keep[i];
  } else {
    const nearBase = lightSrc[0] || 'highlight';
    let dupIdx = 2;
    let writePos = basePos + 1;
    const extra = lightNeeded - lightSrc.length;
    for (let i = 0; i < extra; i++) {
      labels[writePos++] = `${nearBase} ${dupIdx++}`;
    }
    for (let i = 0; i < lightSrc.length; i++) {
      labels[writePos++] = lightSrc[i];
    }
  }
  return labels;
}

export function applyOverrides(
  ramp: string[],
  baseIndex: number,
  overrideMap: Record<number, Record<number, { punchy?: string; balanced?: string; muted?: string }>>,
  style: 'punchy' | 'balanced' | 'muted'
): string[] {
  const pinsForBase = overrideMap[baseIndex];
  if (!pinsForBase) return ramp;
  let next: string[] | null = null;
  for (const k of Object.keys(pinsForBase)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= ramp.length) continue;
    const styleMap = (pinsForBase as any)[k];
    if (!styleMap || typeof styleMap !== 'object') continue;
    const hex = styleMap[style];
    if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
    if (next === null) next = ramp.slice();
    next[idx] = hex.toLowerCase();
  }
  return next || ramp;
}

export function filterHidden(
  ramp: string[],
  labels: string[],
  baseIndex: number,
  hiddenShades: Record<number, number[]>
): { hexes: string[]; labels: string[]; originalIndices: number[] } {
  const hidden = hiddenShades[baseIndex];
  if (!Array.isArray(hidden) || hidden.length === 0) {
    return { hexes: ramp, labels, originalIndices: ramp.map((_, j) => j) };
  }
  const hiddenSet = new Set(hidden);
  const hexes: string[] = [];
  const filteredLabels: string[] = [];
  const originalIndices: number[] = [];
  for (let j = 0; j < ramp.length; j++) {
    if (hiddenSet.has(j)) continue;
    hexes.push(ramp[j]);
    filteredLabels.push(labels[j]);
    originalIndices.push(j);
  }
  return { hexes, labels: filteredLabels, originalIndices };
}

export function resolveBaseForRamp(hex: string, baseIndex: number, rampSatOverrides: Record<number, number>): string {
  const mult = rampSatOverrides[baseIndex];
  if (mult === undefined || mult === 1) return hex;
  const hsl = hexToHsl(hex);
  const newSat = Math.max(0, Math.min(100, hsl.s * mult));
  return hslToHex({ h: hsl.h, s: newSat, l: hsl.l });
}

export function resolveSizeForRamp(baseIndex: number, rampSizeOverrides: Record<number, number>, rampSize: number): number {
  const override = rampSizeOverrides[baseIndex];
  if (override && [4, 5, 6, 7, 8].includes(override)) return override;
  return rampSize;
}

export function resolveHueShiftForRamp(
  baseIndex: number,
  hueShiftStrengthPerRamp: Record<number, number>,
  hueShiftStrength: number
): number {
  return hueShiftStrengthPerRamp[baseIndex] ?? hueShiftStrength;
}

export interface GenerateRampClosureState {
  gamutPerRamp: Record<string, GamutStrategySerialized>;
  stylePresets: StylePresets;
  shuffleSeed: number;
  rampShuffleOffsets: Record<number, number>;
  lightnessCurvePerRamp: Record<string, CurvePoints>;
  satCurvePerRamp: Record<string, CurvePoints>;
}

export function generateRamp(
  baseHex: string,
  numColors: number,
  style: 'punchy' | 'balanced' | 'muted',
  hueShiftStrength: number,
  rampIdx: number | undefined,
  closureState: GenerateRampClosureState
): string[] {
  const { gamutPerRamp, stylePresets, shuffleSeed, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp } = closureState;
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
}
```

If Step 1 found `styleToScalars`'s parameter type isn't exported as `StylePresets` from `./style-presets`, check `grep -n "export" src/lib/style-presets.ts` and use whatever type name it actually exports (or `typeof DEFAULT_STYLE_PRESETS` as a fallback), do not invent a type name that doesn't exist.

- [ ] **Step 5: Write unit tests**

```ts
// tests/unit/ramp-helpers.spec.ts
import { describe, it, expect } from 'vitest';
import {
  shadeLabelsFor, labelsForRamp, applyOverrides, filterHidden,
  resolveBaseForRamp, resolveSizeForRamp, resolveHueShiftForRamp, generateRamp,
} from '../../src/lib/ramp-helpers';

describe('shadeLabelsFor', () => {
  it('returns 6 labels for a 6-shade ramp, centered on base', () => {
    const labels = shadeLabelsFor(6);
    expect(labels).toHaveLength(6);
    expect(labels[3]).toBe('base');
  });
});

describe('labelsForRamp', () => {
  it('re-centers base on the slot that actually holds the base hex', () => {
    const ramp = ['#000000', '#111111', '#ff00ff', '#eeeeee', '#ffffff'];
    const labels = labelsForRamp(ramp, '#ff00ff');
    expect(labels[2]).toBe('base');
  });

  it('falls back to the default table when base hex is not found', () => {
    const ramp = ['#000000', '#111111', '#222222', '#eeeeee', '#ffffff'];
    const labels = labelsForRamp(ramp, '#ff00ff');
    expect(labels).toEqual(shadeLabelsFor(5));
  });
});

describe('applyOverrides', () => {
  it('substitutes a pinned shade for the matching style only', () => {
    const ramp = ['#000000', '#111111', '#222222'];
    const overrides = { 0: { 1: { punchy: '#abcdef' } } };
    const result = applyOverrides(ramp, 0, overrides as any, 'punchy');
    expect(result[1]).toBe('#abcdef');
    const balancedResult = applyOverrides(ramp, 0, overrides as any, 'balanced');
    expect(balancedResult).toEqual(ramp);
  });

  it('ignores an out-of-range pin index', () => {
    const ramp = ['#000000', '#111111'];
    const overrides = { 0: { 7: { punchy: '#abcdef' } } };
    const result = applyOverrides(ramp, 0, overrides as any, 'punchy');
    expect(result).toEqual(ramp);
  });
});

describe('filterHidden', () => {
  it('removes hidden shade indices and keeps originalIndices parallel', () => {
    const ramp = ['#000000', '#111111', '#222222'];
    const labels = ['outline', 'shadow', 'base'];
    const result = filterHidden(ramp, labels, 0, { 0: [1] });
    expect(result.hexes).toEqual(['#000000', '#222222']);
    expect(result.originalIndices).toEqual([0, 2]);
  });

  it('passes through unchanged when no shades are hidden for that base', () => {
    const ramp = ['#000000', '#111111'];
    const labels = ['outline', 'base'];
    const result = filterHidden(ramp, labels, 0, {});
    expect(result.hexes).toEqual(ramp);
  });
});

describe('resolveBaseForRamp', () => {
  it('returns the hex unchanged when no saturation override is set', () => {
    expect(resolveBaseForRamp('#ff00ff', 0, {})).toBe('#ff00ff');
  });

  it('scales saturation when an override multiplier is set', () => {
    const result = resolveBaseForRamp('#ff00ff', 0, { 0: 0.5 });
    expect(result).not.toBe('#ff00ff');
  });
});

describe('resolveSizeForRamp', () => {
  it('returns the global rampSize when no per-ramp override exists', () => {
    expect(resolveSizeForRamp(0, {}, 6)).toBe(6);
  });

  it('returns the per-ramp override when valid', () => {
    expect(resolveSizeForRamp(0, { 0: 8 }, 6)).toBe(8);
  });

  it('falls back to global rampSize when the override is not a valid size', () => {
    expect(resolveSizeForRamp(0, { 0: 3 } as any, 6)).toBe(6);
  });
});

describe('resolveHueShiftForRamp', () => {
  it('returns the per-ramp value when set', () => {
    expect(resolveHueShiftForRamp(0, { 0: 0.5 }, 1.0)).toBe(0.5);
  });

  it('falls back to the global value when unset', () => {
    expect(resolveHueShiftForRamp(0, {}, 1.0)).toBe(1.0);
  });
});

describe('generateRamp', () => {
  it('produces the requested number of shades', () => {
    const shades = generateRamp('#ff00ff', 6, 'punchy', 1.0, 0, {
      gamutPerRamp: {}, stylePresets: {} as any, shuffleSeed: 0,
      rampShuffleOffsets: {}, lightnessCurvePerRamp: {}, satCurvePerRamp: {},
    });
    expect(shades).toHaveLength(6);
    shades.forEach(hex => expect(hex).toMatch(/^#[0-9a-f]{6}$/));
  });

  it('is deterministic for shuffleSeed 0 and no per-ramp offset', () => {
    const a = generateRamp('#ff00ff', 6, 'punchy', 1.0, 0, {
      gamutPerRamp: {}, stylePresets: {} as any, shuffleSeed: 0,
      rampShuffleOffsets: {}, lightnessCurvePerRamp: {}, satCurvePerRamp: {},
    });
    const b = generateRamp('#ff00ff', 6, 'punchy', 1.0, 0, {
      gamutPerRamp: {}, stylePresets: {} as any, shuffleSeed: 0,
      rampShuffleOffsets: {}, lightnessCurvePerRamp: {}, satCurvePerRamp: {},
    });
    expect(a).toEqual(b);
  });
});
```

If Step 1's read shows `styleToScalars({} as any)` throws on an empty `stylePresets` object (rather than falling back to defaults), replace `{} as any` in the `generateRamp` tests with the real shape from `grep -n "DEFAULT_STYLE_PRESETS" src/lib/style-presets.ts` and import `DEFAULT_STYLE_PRESETS` in the test file instead.

- [ ] **Step 6: Run tests, verify fail, implement, verify pass**

```powershell
npx vitest run tests/unit/ramp-helpers.spec.ts
```

Expected first run: FAIL, module not found. After Step 4's file exists:

```powershell
npx vitest run tests/unit/ramp-helpers.spec.ts
```

Expected: PASS, all tests.

- [ ] **Step 7: Delete the 8 functions from `App.tsx`, add the import, update every call site**

Delete `shadeLabelsFor` through `generateRamp` (inclusive, using Step 1's confirmed boundaries; the block ends right before the `liveRampSnapshot` comment).

Add the import:

```ts
import { shadeLabelsFor, labelsForRamp, applyOverrides, filterHidden, resolveBaseForRamp, resolveSizeForRamp, resolveHueShiftForRamp, generateRamp } from './lib/ramp-helpers';
```

For every call site found in Step 2, add the new required argument(s). Using the call sites this plan found (re-verify live via Step 2's grep before editing each one):

```ts
// filterHidden(ramp, labels, i)  →  filterHidden(ramp, labels, i, hiddenShades)
// resolveBaseForRamp(baseColors[i], i)  →  resolveBaseForRamp(baseColors[i], i, rampSatOverrides)
// resolveSizeForRamp(i)  →  resolveSizeForRamp(i, rampSizeOverrides, rampSize)
// generateRamp(effBase, effSize, style, hueShiftStrength, i)
//   →  generateRamp(effBase, effSize, style, hueShiftStrength, i, { gamutPerRamp, stylePresets, shuffleSeed, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp })
```

Every `resolveHueShiftForRamp(baseIndex)` call site (if any remain outside the deleted block; re-check with `grep -n "resolveHueShiftForRamp(" src/App.tsx` after the delete) needs the same treatment: `resolveHueShiftForRamp(baseIndex, hueShiftStrengthPerRamp, hueShiftStrength)`.

If Task 2 has already merged before this task runs, the export-domain call sites are in `src/hooks/useExport.ts`/`src/lib/export.ts` instead of `App.tsx`; the `resolveBaseForRamp`/`labelsForRamp`/`filterHidden` params those files already accept as function parameters (from Task 2's design) now need to be the ramp-helpers versions, and `src/hooks/useExport.ts`'s call into `useExport({ ..., resolveBaseForRamp, filterHidden, ... })` in `App.tsx` needs those two names to resolve to the new imported functions with their extra state bound, e.g.:

```ts
// in App.tsx, before the useExport({...}) call:
const boundResolveBaseForRamp = (hex: string, i: number) => resolveBaseForRamp(hex, i, rampSatOverrides);
const boundFilterHidden = (ramp: string[], labels: string[], i: number) => filterHidden(ramp, labels, i, hiddenShades);
// then pass boundResolveBaseForRamp / boundFilterHidden into useExport({...}) instead of the raw imports,
// so useExport's own parameter types (fixed in Task 2, 2-arg/3-arg signatures) don't need to change.
```

This keeps Task 2's `useExport` hook signature stable (it was written and merged before this closure-parameter change existed) while still using the real, moved `resolveBaseForRamp`/`filterHidden` implementations.

- [ ] **Step 8: Grep-verify no dangling definitions and no un-updated call sites**

```powershell
grep -n "const shadeLabelsFor = \|const labelsForRamp = \|const applyOverrides = \|const filterHidden = \|const resolveBaseForRamp = \|const resolveSizeForRamp = \|const resolveHueShiftForRamp = \|const generateRamp = " src/App.tsx
grep -rn "filterHidden([^,]*,[^,]*,[^,)]*)" src/App.tsx src/hooks/useExport.ts
```

Expected first grep: zero matches. Expected second grep (looking for any 3-argument `filterHidden(...)` call, which is now missing the required 4th `hiddenShades` argument): zero matches; every call must have 4 arguments now.

- [ ] **Step 9: Build and test**

```powershell
npm run build
npm test
```

Expected: both succeed. `npm run build` type-checks the new `src/lib/ramp-helpers.ts` for real.

- [ ] **Step 10: Manual smoke check**

Run `npm run tauri:dev`. Exercise: base ramp generation for a fresh palette, a per-ramp saturation override (via the ramp's HSV editor), a per-ramp size override, a per-ramp hue-shift-strength override, hiding/unhiding a shade, then re-check the image-remap panel (reads `resolveBaseForRamp`/`labelsForRamp`/`filterHidden`) and, if Task 2 hasn't merged yet, the export panel too, confirm all render/export identically to before.

- [ ] **Step 11: Update `docs/ARCHITECTURE.md`**

Note that the ramp pure-helper cluster (`shadeLabelsFor`, `labelsForRamp`, `applyOverrides`, `filterHidden`, `resolveBaseForRamp`, `resolveSizeForRamp`, `resolveHueShiftForRamp`, `generateRamp`) now lives in `src/lib/ramp-helpers.ts`, and that 4 of them changed signature (state that was previously read via closure is now an explicit parameter), so any future caller must pass it explicitly.

- [ ] **Step 12: Commit**

```powershell
git add src/lib/ramp-helpers.ts tests/unit/ramp-helpers.spec.ts src/App.tsx docs/ARCHITECTURE.md
git commit -m "refactor: extract ramp pure-helper cluster to lib/ramp-helpers.ts"
```

- [ ] **Step 13: Full verification pass and PR**

```powershell
npm run deadcode
npm run test:e2e
npm run build:web
npx playwright test --config=playwright.web.config.ts
```

Expected: all pass. Push and open a PR against `master`.
