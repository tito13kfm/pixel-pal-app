# Export Formats + Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JASC `.pal`, Adobe `.ase`, and PNG-palette-strip export formats plus a desktop reveal-in-folder action, all fed by one shared entry list so formats can't drift.

**Architecture:** Pure serializers live in a new `src/lib/palette-export.ts` (`entries[] -> string|bytes`, fully unit-tested). `App.tsx` keeps one impure `collectPaletteEntries(style)` closure (it needs component state: ramps, harmony, labels) that feeds every serializer. The PNG strip renderer goes in the existing `src/lib/strip-export.ts`. A palette-level format dropdown replaces the separate `.txt`/`.gpl` buttons.

**Tech Stack:** React 19 + TS (Vite), `@ts-nocheck` `App.tsx`, vitest unit tests, Tauri v2 (`plugin-opener`, `plugin-fs`), canvas 2D for PNG.

**Spec:** `docs/superpowers/specs/2026-06-02-export-formats-design.md`

**Branch:** `feat/export-formats` (already created; spec already committed).

---

## Codebase facts the implementer needs

- `hexToRgb(hex)` is exported from `src/lib/color.ts`, returns `{ r, g, b }` (0–255 ints). `color.ts` is `@ts-nocheck`; importing it into a typed `.ts` yields `any`-typed values — that's fine, do not "fix" it.
- `src/lib/save-file.ts` exports `saveFile(opts)` returning `SaveResult { ok, canceled?, path?, folder?, error? }`. `SaveData = { text } | { bytes: Uint8Array | Blob }` — binary and Blob already supported. `FolderKey = 'txt' | 'gpl' | 'png'`.
- `App.tsx` is `@ts-nocheck` and is NOT covered by unit tests (per project conventions). Verify App-layer tasks with `npm run build` (runs `tsc --noEmit` + vite) and manual/e2e, NOT vitest.
- Existing `buildPaletteGpl(style)` lives at `src/App.tsx` ~4948–4999. It builds `{hex,name}[]` from ramps, appends harmony colors (~4960–4972), dedupes by lowercased hex (~4977–4984), then formats GIMP lines. This is the body we extract.
- Existing per-ramp exporters (`buildSingleRampGpl`, `buildSingleRampText`) and the `.txt` exporter (`exportPalette`, ~4784) stay; only the full-palette `.txt`/`.gpl` buttons get consolidated.
- `gplStyle` state (`'punchy'|'balanced'|'muted'`) at `App.tsx:1006`; its persistence pattern is at `App.tsx:3223–3247`. Copy this pattern for `exportFormat`.
- Export panel JSX: `.txt` button at `App.tsx:7674`, style toggle + `.gpl` button at `7741–7745`, Import `.gpl` at `7746`, Copy button at `7675`, `exportFeedback` chip at `7698`.
- Run a single vitest file: `npx vitest run tests/unit/<name>.spec.ts`.

---

## Task 1: Pure `.gpl` + `.pal` serializers and entry dedup

**Files:**
- Create: `src/lib/palette-export.ts`
- Test: `tests/unit/palette-export.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/palette-export.spec.ts
import { describe, it, expect } from 'vitest';
import { dedupeEntries, buildGpl, buildJascPal } from '../../src/lib/palette-export';

describe('dedupeEntries', () => {
  it('keeps first occurrence by lowercased hex, drops empties', () => {
    const out = dedupeEntries([
      { hex: '#FF0000', name: 'red a' },
      { hex: '#ff0000', name: 'red b' }, // dup (case-insensitive)
      { hex: '', name: 'empty' },        // dropped
      { hex: '#00ff00', name: 'green' },
    ]);
    expect(out).toEqual([
      { hex: '#FF0000', name: 'red a' },
      { hex: '#00ff00', name: 'green' },
    ]);
  });
});

describe('buildGpl', () => {
  it('emits canonical GIMP palette text', () => {
    const text = buildGpl(
      [{ hex: '#ff0000', name: 'Color 1 base' }, { hex: '#00ff00', name: 'Color 2 base' }],
      { paletteName: 'PIXEL.PAL Punchy', columns: 8 },
    );
    expect(text).toBe(
      'GIMP Palette\nName: PIXEL.PAL Punchy\nColumns: 8\n#\n' +
      '255   0   0\tColor 1 base\n' +
      '  0 255   0\tColor 2 base\n'
    );
  });
});

describe('buildJascPal', () => {
  it('emits JASC-PAL text with CRLF endings', () => {
    const text = buildJascPal([{ hex: '#ff0000', name: 'r' }, { hex: '#00ff00', name: 'g' }]);
    expect(text).toBe('JASC-PAL\r\n0100\r\n2\r\n255 0 0\r\n0 255 0\r\n');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/palette-export.spec.ts`
Expected: FAIL — `Failed to resolve import "../../src/lib/palette-export"`.

- [ ] **Step 3: Implement `src/lib/palette-export.ts`**

```ts
// src/lib/palette-export.ts
//
// Pure palette serializers. Each takes a pre-built, pre-deduped entry list
// and returns text or bytes — NO color/ramp logic lives here. The single
// source of those entries is App.tsx's collectPaletteEntries(), so .gpl /
// .pal / .ase cannot describe different color sets (mirror/round-trip rule).
import { hexToRgb } from './color';

export interface PaletteEntry {
  hex: string;
  name: string;
}

/** Keep first occurrence by lowercased hex; drop entries with empty hex.
 *  Matches the dedup that used to live inline in buildPaletteGpl. */
export function dedupeEntries(entries: PaletteEntry[]): PaletteEntry[] {
  const seen = new Set<string>();
  const out: PaletteEntry[] = [];
  for (const e of entries) {
    const key = (e.hex || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

const pad3 = (n: number): string => String(n).padStart(3, ' ');

/** Canonical GIMP palette (.gpl). Byte-identical to the legacy inline builder. */
export function buildGpl(
  entries: PaletteEntry[],
  opts: { paletteName: string; columns: number },
): string {
  const lines = ['GIMP Palette', `Name: ${opts.paletteName}`, `Columns: ${opts.columns}`, '#'];
  for (const { hex, name } of entries) {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${pad3(r)} ${pad3(g)} ${pad3(b)}\t${name}`);
  }
  return lines.join('\n') + '\n';
}

/** JASC-PAL (.pal), read by GrafX2 / Paint Shop Pro. CRLF for old-parser safety. */
export function buildJascPal(entries: PaletteEntry[]): string {
  const lines = ['JASC-PAL', '0100', String(entries.length)];
  for (const { hex } of entries) {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${r} ${g} ${b}`);
  }
  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/palette-export.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/palette-export.ts tests/unit/palette-export.spec.ts
git commit -m "feat(export): pure .gpl/.pal serializers + entry dedup"
```

---

## Task 2: Pure Adobe `.ase` binary serializer

**Files:**
- Modify: `src/lib/palette-export.ts`
- Test: `tests/unit/palette-export.spec.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/palette-export.spec.ts`:

```ts
import { buildAse } from '../../src/lib/palette-export';

describe('buildAse', () => {
  it('emits a valid ASEF file: header, count, one normal RGB color block', () => {
    const bytes = buildAse([{ hex: '#ff0000', name: 'red' }]);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // Signature "ASEF"
    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('ASEF');
    // Version 1.0
    expect(dv.getUint16(4, false)).toBe(1);
    expect(dv.getUint16(6, false)).toBe(0);
    // Block count = 1
    expect(dv.getUint32(8, false)).toBe(1);
    // Block type 0x0001 (color entry)
    expect(dv.getUint16(12, false)).toBe(0x0001);
    // Block body length: 2 (nameLen) + 2*4 (name 'red'+null UTF16) + 4 ('RGB ') + 12 (3 floats) + 2 (type) = 28
    expect(dv.getUint32(14, false)).toBe(28);
    // Name length in UTF-16 units incl null = 4
    expect(dv.getUint16(18, false)).toBe(4);
    // Name 'red' UTF-16BE then null
    expect([bytes[20], bytes[21], bytes[22], bytes[23], bytes[24], bytes[25]])
      .toEqual([0x00, 0x72, 0x00, 0x65, 0x00, 0x64]);
    expect([bytes[26], bytes[27]]).toEqual([0x00, 0x00]);
    // Color model "RGB "
    expect(String.fromCharCode(bytes[28], bytes[29], bytes[30], bytes[31])).toBe('RGB ');
    // R = 1.0 (0x3F800000 BE), G = 0.0, B = 0.0
    expect(dv.getFloat32(32, false)).toBe(1);
    expect(dv.getFloat32(36, false)).toBe(0);
    expect(dv.getFloat32(40, false)).toBe(0);
    // Color type 2 = normal
    expect(dv.getUint16(44, false)).toBe(0x0002);
  });

  it('falls back to hex as the swatch name when name is empty', () => {
    const bytes = buildAse([{ hex: '#0000ff', name: '' }]);
    // name length = '#0000ff'.length + 1 = 8
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getUint16(18, false)).toBe(8);
  });
});

// Anti-drift contract (spec test #2): the three palette-file formats are all
// fed the SAME entry list by App.tsx's collectPaletteEntries, so none may drop
// or reorder colors. Structurally guaranteed (single source) and locked here:
// for one shared fixture, every format encodes the same color count.
describe('format color-count parity', () => {
  it('gpl / pal / ase encode the same number of colors for one fixture', () => {
    const entries = [
      { hex: '#ff0000', name: 'a' },
      { hex: '#00ff00', name: 'b' },
      { hex: '#0000ff', name: 'c' },
    ];
    const gplCount = buildGpl(entries, { paletteName: 'X', columns: 8 })
      .split('\n').filter((l) => /^\s*\d+\s+\d+\s+\d+\t/.test(l)).length;
    const palLines = buildJascPal(entries).split('\r\n');
    const palCount = Number(palLines[2]); // declared count line
    const aseCount = new DataView(buildAse(entries).buffer).getUint32(8, false);
    expect(gplCount).toBe(3);
    expect(palCount).toBe(3);
    expect(aseCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/palette-export.spec.ts`
Expected: FAIL — `buildAse is not a function` / import unresolved.

- [ ] **Step 3: Implement `buildAse`**

Append to `src/lib/palette-export.ts`:

```ts
/** Adobe Swatch Exchange (.ase), big-endian binary. Flat (no group blocks),
 *  matching the flat dedup of the text formats. Targets Photoshop / Illustrator
 *  / Krita — NOT Aseprite (whose .ase/.aseprite sprite files are unrelated). */
export function buildAse(entries: PaletteEntry[]): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push((n >>> 8) & 0xff, n & 0xff);
  const u32 = (n: number) => out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  const f32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, false); // big-endian
    out.push(b[0], b[1], b[2], b[3]);
  };
  const ascii = (s: string) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff); };

  ascii('ASEF');
  u16(1); u16(0);          // version 1.0
  u32(entries.length);     // block count

  for (const { hex, name } of entries) {
    const label = name && name.length ? name : hex;
    const codeUnits = label.length + 1;                 // incl trailing null
    const bodyLen = 2 + codeUnits * 2 + 4 + 12 + 2;     // nameLen + name + 'RGB ' + 3 floats + type
    u16(0x0001);           // block type: color entry
    u32(bodyLen);
    u16(codeUnits);        // name length in UTF-16 units (incl null)
    for (let i = 0; i < label.length; i++) {
      const c = label.charCodeAt(i);
      out.push((c >>> 8) & 0xff, c & 0xff);             // UTF-16BE
    }
    out.push(0, 0);        // null terminator
    ascii('RGB ');         // color model (trailing space matters)
    const { r, g, b } = hexToRgb(hex);
    f32(r / 255); f32(g / 255); f32(b / 255);
    u16(0x0002);           // color type: normal
  }
  return new Uint8Array(out);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/palette-export.spec.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/palette-export.ts tests/unit/palette-export.spec.ts
git commit -m "feat(export): pure Adobe .ase binary serializer"
```

---

## Task 3: PNG palette-strip renderer

**Files:**
- Modify: `src/lib/strip-export.ts`
- Test: `tests/unit/strip-export.spec.ts`

- [ ] **Step 1: Write failing test for the pure layout helper**

Append to `tests/unit/strip-export.spec.ts`:

```ts
import { paletteStripLayout } from '../../src/lib/strip-export';

describe('paletteStripLayout', () => {
  it('sizes the canvas to the widest ramp row x ramp count', () => {
    const rows = [['#fff', '#000'], ['#f00']];
    expect(paletteStripLayout(rows, 32)).toEqual({ width: 64, height: 64, cellSize: 32, maxCells: 2 });
  });
  it('handles an empty palette', () => {
    expect(paletteStripLayout([], 32)).toEqual({ width: 0, height: 0, cellSize: 32, maxCells: 0 });
  });
});
```

(Keep the existing top-of-file imports; add this `import` near the others.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/strip-export.spec.ts`
Expected: FAIL — `paletteStripLayout is not a function`.

- [ ] **Step 3: Implement layout helper + renderer in `src/lib/strip-export.ts`**

Add near the other exports:

```ts
export interface PaletteStripLayout {
  width: number;
  height: number;
  cellSize: number;
  maxCells: number;
}

/** Pure geometry for the palette strip: rows = ramps, cells = visible shades. */
export function paletteStripLayout(rows: string[][], cellSize: number): PaletteStripLayout {
  const maxCells = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return { width: maxCells * cellSize, height: rows.length * cellSize, cellSize, maxCells };
}

// PNG PALETTE STRIP — an import-grade swatch sheet (drag onto a canvas, then
// eyedrop). INTENTIONALLY DIVERGES from the .gpl/.pal/.ase palette files in
// two ways, and that divergence is by design — do NOT "align" it:
//   1. No dedup: a color repeated across ramps appears once per cell (a strip
//      is positional; the palette files dedup because they expect unique entries).
//   2. No harmony colors: the strip shows only the ramps, not the appended
//      complementary/analogous/etc. swatches the palette files include.
// Cells are flat-filled at integer pixel coords at full opacity so an
// eyedropper reads exactly the source hex (no anti-aliasing, no alpha).
export async function drawPaletteStripPng(rows: string[][], cellSize = 32): Promise<Blob> {
  const { width, height } = paletteStripLayout(rows, cellSize);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d')!;
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      ctx.fillStyle = rows[row][col];
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/strip-export.spec.ts`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/strip-export.ts tests/unit/strip-export.spec.ts
git commit -m "feat(export): PNG palette-strip renderer + layout helper"
```

---

## Task 4: Extend `FolderKey` for `.pal` / `.ase`

**Files:**
- Modify: `src/lib/save-file.ts:12`

- [ ] **Step 1: Widen the type**

Change line 12 from:

```ts
export type FolderKey = 'txt' | 'gpl' | 'png';
```

to:

```ts
export type FolderKey = 'txt' | 'gpl' | 'png' | 'pal' | 'ase';
```

- [ ] **Step 2: Verify the build type-checks**

Run: `npm run build`
Expected: PASS (tsc + vite). No other change needed — `folderKey` is only ever used as a `store` key string.

- [ ] **Step 3: Commit**

```bash
git add src/lib/save-file.ts
git commit -m "feat(export): add pal/ase last-folder keys"
```

---

## Task 5: Extract `collectPaletteEntries`, route `.gpl` through pure builder, add `exportFormat` state

**Files:**
- Modify: `src/App.tsx` (import line ~5; `buildPaletteGpl` ~4948–4999; persistence near 3247; state near 1006)

> App.tsx is `@ts-nocheck` and not unit-tested. Verify with `npm run build` + the existing `.gpl` export still producing identical output (manual diff in Step 5).

- [ ] **Step 1: Add the imports**

Near the existing `src/lib/color` import block (~line 5 area), add:

```ts
import { buildGpl, buildJascPal, buildAse } from './lib/palette-export';
import { drawPaletteStripPng } from './lib/strip-export';
```

(If sibling functions are already imported from `./lib/strip-export`, add `drawPaletteStripPng` to that existing import list rather than duplicating the line.)

- [ ] **Step 2: Extract `collectPaletteEntries` and slim `buildPaletteGpl`**

Replace the body of `buildPaletteGpl` (`~4948–4999`) so the entry-gathering becomes a reusable closure and the GIMP formatting delegates to the pure builder. The gathering logic (ramp walk + harmony append + dedup) is moved verbatim from the old inline body:

```ts
// Gather the full palette entry list for a style: every ramp's visible shades
// (named "<color> <slot>"), then the harmony colors, then dedup by hex.
// SINGLE SOURCE consumed by every palette-file format so they cannot drift.
const collectPaletteEntries = (style) => {
  const entries = [];
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

  const seenHex = new Set();
  const unique = [];
  for (const e of entries) {
    const key = (e.hex || '').toLowerCase();
    if (!key || seenHex.has(key)) continue;
    seenHex.add(key);
    unique.push(e);
  }
  return unique;
};

const buildPaletteGpl = (style) => {
  const styleLabel = style === 'balanced' ? 'Balanced' : style === 'muted' ? 'Muted' : 'Punchy';
  return buildGpl(collectPaletteEntries(style), { paletteName: `PIXEL.PAL ${styleLabel}`, columns: rampSize });
};
```

- [ ] **Step 3: Add `exportFormat` state**

Next to `gplStyle` (`~1006`):

```ts
const [exportFormat, setExportFormat] = useState('gpl'); // gpl | pal | ase | png-strip | txt
```

- [ ] **Step 4: Add `exportFormat` persistence**

After the `gplStyle` persistence effects (`~3247`), add the same load/save pair:

```ts
// exportFormat: persisted at ui:exportFormat. Valid values gpl/pal/ase/png-strip/txt.
useEffect(() => {
  (async () => {
    if (typeof window === 'undefined' || !window.storage) return;
    try {
      const got = await window.storage.get('ui:exportFormat');
      if (got && got.value) {
        const parsed = JSON.parse(got.value);
        if (typeof parsed === 'string' && ['gpl', 'pal', 'ase', 'png-strip', 'txt'].includes(parsed)) {
          setExportFormat(parsed);
        }
      }
    } catch { /* keep default */ }
  })();
}, []);
const exportFormatMountRef = useRef(false);
useEffect(() => {
  if (!exportFormatMountRef.current) { exportFormatMountRef.current = true; return; }
  if (typeof window === 'undefined' || !window.storage) return;
  (async () => {
    try { await window.storage.set('ui:exportFormat', JSON.stringify(exportFormat)); } catch {}
  })();
}, [exportFormat]);
```

- [ ] **Step 5: Verify build + `.gpl` output unchanged**

Run: `npm run build`
Expected: PASS.
Then manually confirm `.gpl` output is unchanged: in `npm run dev`, generate a palette, export `.gpl` (still wired to the old button until Task 7), open the file — header `GIMP Palette` / `Name: PIXEL.PAL Punchy` / `Columns: N` / `#` then `%3d %3d %3d\t<name>` rows, identical to before. (The refactor is behavior-preserving; this is the regression guard the spec calls for.)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "refactor(export): extract collectPaletteEntries; route .gpl through pure builder; add exportFormat state"
```

---

## Task 6: New export handlers + unified dispatcher + last-saved path

**Files:**
- Modify: `src/App.tsx` (`exportPalette` ~4784; `exportPaletteGpl` ~5001; add new handlers after them; state near 1006)

- [ ] **Step 1: Make `.txt` and `.gpl` handlers return their `SaveResult`**

Refactor `exportPalette` (`~4784`) and `exportPaletteGpl` (`~5001`) to RETURN the `saveFile` result instead of setting feedback themselves (the dispatcher centralizes feedback). For `exportPaletteGpl`:

```ts
const exportPaletteGpl = async () => {
  const text = buildPaletteGpl(gplStyle);
  return await saveFile({
    defaultName: `pixel-pal-${gplStyle}.gpl`,
    filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
    data: { text },
    folderKey: 'gpl',
  });
};
```

For `exportPalette` (the `.txt` one), likewise `return await saveFile({...})` and drop its internal `setExportFeedback`/timeout lines.

- [ ] **Step 2: Add `.pal`, `.ase`, PNG-strip handlers**

Immediately after `exportPaletteGpl`:

```ts
const exportPalettePal = async () => {
  const text = buildJascPal(collectPaletteEntries(gplStyle));
  return await saveFile({
    defaultName: `pixel-pal-${gplStyle}.pal`,
    filters: [{ name: 'JASC palette', extensions: ['pal'] }],
    data: { text },
    folderKey: 'pal',
  });
};

const exportPaletteAse = async () => {
  const bytes = buildAse(collectPaletteEntries(gplStyle));
  return await saveFile({
    defaultName: `pixel-pal-${gplStyle}.ase`,
    filters: [{ name: 'Adobe Swatch Exchange', extensions: ['ase'] }],
    data: { bytes },
    folderKey: 'ase',
  });
};

const exportPaletteStripPng = async () => {
  const rows = baseColors.map((_, i) => _filteredRamp(i, gplStyle).hexes);
  const blob = await drawPaletteStripPng(rows, 32);
  return await saveFile({
    defaultName: `pixel-pal-${gplStyle}-strip.png`,
    filters: [{ name: 'PNG image', extensions: ['png'] }],
    data: { bytes: blob },
    folderKey: 'png',
  });
};
```

- [ ] **Step 3: Add the dispatcher + last-saved-path state**

Add state near `exportFormat` (Task 5):

```ts
const [lastSavedPath, setLastSavedPath] = useState(null);
```

Add the dispatcher after the handlers above:

```ts
// Runs whichever export the format dropdown selects, then centralizes the
// success/cancel/fail feedback and records the saved path for "Reveal".
const exportActiveFormat = async () => {
  const runner =
    exportFormat === 'txt' ? exportPalette :
    exportFormat === 'pal' ? exportPalettePal :
    exportFormat === 'ase' ? exportPaletteAse :
    exportFormat === 'png-strip' ? exportPaletteStripPng :
    exportPaletteGpl;
  try {
    const result = await runner();
    if (result?.canceled) { setExportFeedback('Save canceled'); }
    else if (!result?.ok) { setExportFeedback('Export failed'); }
    else {
      setExportFeedback('Downloaded!');
      if (result.path) setLastSavedPath(result.path); // desktop only; web has no path
    }
  } catch {
    setExportFeedback('Export failed');
  }
  setTimeout(() => setExportFeedback(''), 2000);
};
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(export): .pal/.ase/png-strip handlers + unified dispatcher"
```

---

## Task 7: Consolidate export UI into a format dropdown + Reveal button

**Files:**
- Modify: `src/App.tsx` (JSX: `.txt` button `7674`; style toggle + `.gpl` button `7741–7745`)

- [ ] **Step 1: Remove the standalone `.txt` button**

Delete the `.txt` button at `App.tsx:7674` (the `<button onClick={exportPalette} ... Download .txt</button>`). The Copy button at 7675 stays.

- [ ] **Step 2: Replace the style toggle's `.gpl` button with the format select + Download**

In the `7741–7745` block, KEEP the three style buttons (Punchy/Balanced/Muted) but change the label span at 7741 from `.gpl style:` to `export style:`. REPLACE the standalone `.gpl` Download button (`7745`) with a format select + one Download button:

```tsx
<select
  value={exportFormat}
  onChange={(e) => setExportFormat(e.target.value)}
  title="Choose the export format"
  className="px-3 py-1.5 rounded font-bold border-2 text-xs uppercase tracking-wider bg-purple-900/60 text-cyan-100 border-cyan-700/50"
>
  <option value="gpl">.gpl (Aseprite / GIMP / Krita)</option>
  <option value="pal">.pal (GrafX2 / Paint Shop Pro)</option>
  <option value="ase">Adobe Swatch Exchange (.ase)</option>
  <option value="png-strip">PNG strip (eyedropper, any editor)</option>
  <option value="txt">.txt (plain hex list)</option>
</select>
<button
  onClick={exportActiveFormat}
  data-tour-id="gpl-export-btn"
  title="Download the active palette in the selected format and style. Adobe .ase targets Photoshop/Illustrator/Krita, NOT Aseprite (Aseprite users: pick .gpl, .pal, or PNG strip)."
  className="px-4 py-1.5 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs"
  style={{ boxShadow: '0 0 10px #ffff00' }}
>
  <Download size={14} />Download
</button>
```

(Keep the `data-tour-id="gpl-export-btn"` on the Download button so the existing tour step still anchors.)

- [ ] **Step 3: Add the desktop Reveal button**

Right after the `exportFeedback` chip (`~7698`), add:

```tsx
{isTauri() && lastSavedPath && (
  <button
    onClick={revealLastSaved}
    title="Show the last exported file in your file manager"
    className="px-4 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs"
    style={{ boxShadow: '0 0 10px #00ffff' }}
  >
    <FolderOpen size={14} />Reveal in folder
  </button>
)}
```

Ensure `isTauri` is in scope (it's used elsewhere via `src/lib/env`; if not already imported in App.tsx, import it: `import { isTauri } from './lib/env';`). Ensure `FolderOpen` is imported from `lucide-react` alongside the other icons (`Download`, `Copy`, etc.); add it to that import if missing. `revealLastSaved` is implemented in Task 8.

- [ ] **Step 4: Verify build + manual UI check**

Run: `npm run build`
Expected: PASS.
Then `npm run dev`: the Export panel shows one **Download** button + a format `<select>`, no separate `.txt`/`.gpl` buttons. Switch formats, download each, confirm correct file extension + contents. Import `.gpl` and Copy buttons still present and working.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(export): consolidate export UI into format dropdown + reveal button"
```

---

## Task 8: Desktop reveal-in-folder (capability + handler)

**Files:**
- Modify: `src-tauri/capabilities/default.json:8` (permissions array)
- Modify: `src/App.tsx` (add `revealLastSaved` near the export handlers)

- [ ] **Step 1: Grant the reveal permission**

In `src-tauri/capabilities/default.json`, the permissions array currently contains `"opener:default"`. Add the reveal permission so the array includes both:

```json
"opener:default",
"opener:allow-reveal-item-in-dir",
```

- [ ] **Step 2: Implement `revealLastSaved`**

Add near the export handlers in `App.tsx`:

```ts
// Desktop only: open the OS file manager with the last exported file selected.
const revealLastSaved = async () => {
  if (!lastSavedPath) return;
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(lastSavedPath);
  } catch {
    setExportFeedback("Couldn't open folder");
    setTimeout(() => setExportFeedback(''), 2000);
  }
};
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual desktop check**

Run: `npm run tauri:dev`. Export any format, click **Reveal in folder** → OS file manager opens with the file selected. (On web this button is hidden — `isTauri()` is false.)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/capabilities/default.json src/App.tsx
git commit -m "feat(export): desktop reveal-in-folder via plugin-opener"
```

---

## Task 9: Docs — README export section + CHANGELOG

**Files:**
- Modify: `README.md` (Features → "State and export" bullet ~77; the hero already lists `.pal`/`.ase` from the earlier positioning edit)
- Modify: `CHANGELOG.md` (`## [Unreleased]`)

- [ ] **Step 1: Update the README export bullet**

In the "State and export" section, replace the export line so it reads:

```markdown
- Export: a format dropdown covers GIMP `.gpl` (Aseprite/GIMP/Krita/Piskel),
  JASC `.pal` (GrafX2/Paint Shop Pro), Adobe Swatch Exchange `.ase`, a PNG
  palette strip (drag onto any editor's canvas and eyedrop), and plain `.txt`
  — each in the Punchy/Balanced/Muted style you select. Desktop adds
  "Reveal in folder" after a save. PNG export of the Mosaic, Lightness,
  Adjacency, and Dither-Blend views remains under each view / the export panel.
  - **Note:** Adobe `.ase` targets Photoshop / Illustrator / Krita, NOT
    Aseprite. Despite the shared extension, Aseprite's `.ase`/`.aseprite` are
    sprite files; Aseprite imports palettes as `.gpl`, `.pal`, or PNG — pick
    one of those for Aseprite.
```

- [ ] **Step 2: Add CHANGELOG entries**

Under `## [Unreleased]` → `### Added` (create the bucket if absent):

```markdown
### Added
- Export to JASC `.pal` (GrafX2, Paint Shop Pro).
- Export to Adobe Swatch Exchange `.ase` (Photoshop, Illustrator, Krita).
- Export a PNG palette strip — a flat swatch sheet for eyedropper import into
  any editor.
- Desktop "Reveal in folder" action after exporting.

### Changed
- Full-palette export is now a single format dropdown (`.gpl` / `.pal` /
  `.ase` / PNG strip / `.txt`) plus one Download button, replacing the separate
  `.txt` and `.gpl` buttons. The Punchy/Balanced/Muted selector now applies to
  every format.
```

- [ ] **Step 3: Verify build (docs don't affect it, but confirm nothing broke)**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs(export): document .pal/.ase/PNG-strip formats + reveal"
```

---

## Final verification (after all tasks)

- [ ] Run the full unit suite: `npm test` → all pass (new `palette-export` + `strip-export` tests included).
- [ ] `npm run build` → passes.
- [ ] Manual round-trips (record in PR): `.pal` → GrafX2; `.ase` → Photoshop/Krita; PNG strip → Aseprite eyedropper (picked hex == source hex); desktop Reveal opens file manager with the file selected.
- [ ] Confirm `.gpl` output is byte-identical to pre-refactor (regression).
- [ ] Release per CLAUDE.md when merging: this is additive user-facing features → bump **MINOR** (0.13.0 → 0.14.0), move `[Unreleased]` notes into the dated section, four version files in lockstep + tag (see `release-flow` memory).
```
