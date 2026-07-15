# Issue #131: Palette-Cycling Designer — Implementation Plan

> Fixes [#131](https://github.com/tito13kfm/pixel-pal-app/issues/131). This
> document is a complete, self-contained execution plan. Every design decision
> is already made; do not re-open them. Follow the steps in order. Where code
> is given verbatim, use it verbatim.

## What is being built

A "Palette Cycling" sub-panel inside **Visualize & Compare** that lets the
user:

1. Mark a contiguous shade range inside one visible ramp (click start swatch,
   click end swatch in the same row).
2. Watch a live preview: the marked range's indices rotate at a settable
   frame rate, shown both as a color strip and on a sprite rendered with the
   cycling palette (the classic water/lava/torch index-rotation trick).
3. Download the cycle as a PIXEL.PAL-specific JSON sidecar
   (`pixel-pal-cycle.json`) next to the existing `.gpl`/`.pal`/`.ase` exports.

## Decisions on the issue's open questions (final — do not revisit)

| Open question | Decision for v1 |
|---|---|
| UI for marking a range | Click-to-select on a static swatch strip inside a new sub-panel of `VizComparePanel` (same `vizSub` collapsible pattern as Dither-Blend). No drag. |
| Multiple ranges per ramp | **One range total** (single active cycle). The JSON format uses a `cycles` array so multi-range can be added later without a format break. |
| Survive reorder / resize / hardware-lock | **No.** The selection is ephemeral component-local UI state (like `ditherZoom`): not in the undo snapshot, not saved with palettes, not re-keyed by `reorderRamps`. When the visualized rows change shape, the selection is defensively cleared. This keeps the change fully additive and avoids every App.tsx re-keying invariant (ARCHITECTURE.md "Cross-cutting state-maintenance rules" #1/#3). Persistence is future work. |
| Preview cadence | Real-time canvas animation via `requestAnimationFrame` (offset held in a ref, no React state per frame). No animated-PNG export in v1. |

Other fixed decisions:

- The sub-panel renders **only in single-column view** (`!compact`) — no
  animation in the two-column compare grid.
- Rows shown are the same data the Mosaic uses: `mosaicRamps` from
  `computeVizData` (current `vizStyle`, hidden shades filtered).
- Frame-rate presets: 2/4/6/8/10/15/30 fps, default **8**. Direction toggle
  (forward/reverse). Playing by default once a range is set.
- **No version bump, no release.** CHANGELOG `## [Unreleased]` entry only.
  Versioning is decided by the maintainer at release time (CLAUDE.md rule).

## Files touched

| File | Kind of change |
|---|---|
| `src/lib/viz-interaction.ts` | append 2 pure exports: `CycleRange`, `rotateCycle` |
| `src/lib/palette-export.ts` | append 2 pure exports: `CycleRangeMeta`, `buildCycleJson` |
| `src/lib/save-file.ts` | add `'json'` to the `FolderKey` union (one token) |
| `src/components/PaletteCycleEditor.tsx` | **new** component |
| `src/components/panels/VizComparePanel.tsx` | import + one new `vizSub` block |
| `tests/unit/palette-cycle.spec.ts` | **new** unit tests (pure functions) |
| `tests/unit/PaletteCycleEditor.spec.tsx` | **new** component smoke tests |
| `docs/ARCHITECTURE.md` | one File Map line + one Export-section bullet |
| `CHANGELOG.md` | one `Added` bullet under `## [Unreleased]` |

Nothing in `App.tsx` changes. Nothing in hooks, store, history, or export
handlers changes.

### Tooling note (Serena hook)

On the maintainer's machine a `PreToolUse` hook blocks the built-in
Read/Edit tools on `src/**/*.ts(x)` in favor of Serena. **New files are
created with Write (never blocked).** For the three small edits to existing
`src/` files, use Serena `replace_content` if available; otherwise the
anchors below are unique enough for any exact-match edit tool. All anchors
were verified against the current tree — re-grep before editing if a match
fails; never edit by line number.

---

## Step 1 — Pure rotation helper (`src/lib/viz-interaction.ts`)

Append at the end of the file:

```ts
// --- Palette cycling (issue #131) ---

// Inclusive index range within a single ramp's shade list.
export interface CycleRange {
  low: number;
  high: number;
}

// Rotate the colors inside hexes[low..high] (inclusive) by `offset` steps,
// leaving everything outside the range untouched. Returns a new array.
// Forward (reverse=false): the color at range position i comes from position
// (i + offset) % len, so colors appear to flow toward the range start.
// Degenerate ranges (len <= 1 after clamping) return an unmodified copy.
export function rotateCycle(
  hexes: string[], low: number, high: number, offset: number, reverse = false,
): string[] {
  const n = hexes.length;
  const out = hexes.slice();
  if (n === 0) return out;
  const lo = Math.max(0, Math.min(low, high));
  const hi = Math.min(n - 1, Math.max(low, high));
  const len = hi - lo + 1;
  if (len <= 1) return out;
  const k = ((offset % len) + len) % len;
  for (let i = 0; i < len; i++) {
    const src = reverse ? (i - k + len + len) % len : (i + k) % len;
    out[lo + i] = hexes[lo + src];
  }
  return out;
}
```

## Step 2 — JSON sidecar builder (`src/lib/palette-export.ts`)

Append at the end of the file:

```ts
// --- Palette-cycle sidecar (issue #131) ---
//
// PIXEL.PAL-specific JSON: no common palette format encodes index cycling,
// so this is its own sidecar file. NOTE: unlike .gpl/.pal/.ase this
// deliberately does NOT use collectPaletteEntries — the palette here is the
// single marked ramp, positional and un-deduped (indices are the whole
// point), the same way the PNG palette strip diverges. Do not "align" it.

export interface CycleRangeMeta {
  /** inclusive start index into `palette` */
  low: number;
  /** inclusive end index into `palette` */
  high: number;
  /** playback rate in frames (index steps) per second */
  rate: number;
  /** rotation direction; matches the preview's Forward/Reverse toggle */
  reverse: boolean;
}

/** Serialize one ramp's shade list plus its cycle range(s) to pretty JSON.
 *  `cycles` is an array for forward compatibility; v1 always writes one. */
export function buildCycleJson(hexes: string[], cycles: CycleRangeMeta[]): string {
  return JSON.stringify(
    {
      format: 'pixel-pal-cycle',
      version: 1,
      palette: hexes.map((h) => (h || '').toLowerCase()),
      cycles,
    },
    null,
    2,
  ) + '\n';
}
```

## Step 3 — `'json'` folder slot (`src/lib/save-file.ts`)

Replace the exact line

```ts
export type FolderKey = 'txt' | 'gpl' | 'png' | 'pal' | 'ase';
```

with

```ts
export type FolderKey = 'txt' | 'gpl' | 'png' | 'pal' | 'ase' | 'json';
```

(`FolderKey` only names the remembered last-save-folder slot in the Tauri
plugin-store; no other code enumerates it.)

## Step 4 — New component `src/components/PaletteCycleEditor.tsx`

Self-contained; **no App.tsx wiring, no context, no persistence.** Model the
file header comment + canvas usage on `src/components/DitherBlend.tsx` and
the sprite-drawing math on `PixelSprite` in
`src/components/panels/RampsPanel.tsx` (`mapIndex` / `parseChar` — copy that
logic into local functions here; do NOT import from RampsPanel, this canvas
renderer is independent of the SVG one).

### Props

```ts
interface PaletteCycleEditorProps {
  rows: string[][];        // mosaicRamps hexes: one array per visible ramp, current viz style
  borderColor?: string;    // t.vizDataBorder passthrough
}
```

### Internal state (all `useState` local to the component)

- `sel: { row: number; low: number; high: number } | null` — committed range.
- `pending: { row: number; idx: number } | null` — first click of a pair.
- `fps: number` (default `8`), `playing: boolean` (default `true`),
  `reverse: boolean` (default `false`).
- `spriteKey: string` (default `'vase'`; options = keys of
  `DEFAULT_SPRITE_LIBRARY` from `../lib/constants`).

Plus a ref `offsetRef = useRef(0)` for the animation phase — **never** put
the per-frame offset in React state.

### Selection strip (static, interactive)

For each `rows[r]`, render a flex row of `<button>` swatches (~22×22 px,
`style={{ background: hex }}`, `title={hex.toUpperCase()}`). Click behavior:

1. No `pending` (or click in a different row than `pending.row`): set
   `pending = { row: r, idx }`, clear `sel`.
2. `pending` exists and click is in the same row: commit
   `sel = { row, low: min(pending.idx, idx), high: max(...) }`, clear
   `pending`, set `playing = true`, reset `offsetRef.current = 0`.

Mark the pending swatch and the committed range visually (e.g. a 2px
`outline: 2px solid #fff` / `outline-offset: -2px` on in-range swatches, and
a `▶`/`◀` pair or brighter outline on the endpoints — keep it simple, no
new theme tokens; color data itself must not be altered, chrome only).
Requirements: each swatch button needs an `aria-label` of the form
`` `Ramp ${r + 1} shade ${i + 1}` `` so tests can target them.

### Defensive reset

`const rowsKey = JSON.stringify(rows);` (the `DitherBlend` precedent). In a
`useEffect` on `[rowsKey]`: if `sel` is out of bounds for the new `rows`
(`sel.row >= rows.length || sel.high >= rows[sel.row].length`) clear `sel`
and `pending`. This is what makes ramp edits/reorders safe without any
re-keying.

### Animated preview (canvas, rAF)

Rendered only when `sel !== null`. Two canvases inside a flex container:

- **Strip canvas**: the selected row's full shade list, one 24×32 px cell
  per shade, drawn from `rotateCycle(rows[sel.row], sel.low, sel.high,
  offsetRef.current, reverse)`; draw a 1px white rectangle around the
  cycling span so the moving region is obvious.
- **Sprite canvas**: the sprite pattern for `spriteKey` drawn at scale 4
  (one `fillRect` per non-`.` cell), colors looked up through the same
  rotated array using the `PixelSprite` `mapIndex` ratio logic
  (`numShades` from the library entry).

One `useEffect` on `[sel, playing, fps, reverse, spriteKey, rowsKey]` owns
the loop:

```
if (!sel) return;
let raf = 0; let last = performance.now(); let acc = 0;
const draw = () => { /* draw both canvases from offsetRef.current */ };
const tick = (now) => {
  if (playing) {
    acc += now - last;
    const step = 1000 / fps;
    while (acc >= step) { acc -= step; offsetRef.current += 1; }
  }
  last = now;
  draw();
  raf = requestAnimationFrame(tick);
};
draw();                                   // paint once even when paused
raf = requestAnimationFrame(tick);
return () => cancelAnimationFrame(raf);
```

Every `getContext('2d')` result must be null-checked before drawing (jsdom
returns null in tests; this is the codebase-wide pattern). Both canvases get
`style={{ imageRendering: 'pixelated' }}` and a `1px solid
${borderColor ?? '#444'}` border.

### Controls row (rendered when `sel !== null`)

Follow the existing Viz control styling (small uppercase bordered buttons /
selects as in `VizComparePanel`'s dither controls — copy those classNames;
hardcoded cyan Tailwind classes are fine here, the light theme's CSS
injection handles them):

- Play/Pause toggle button (`title` explains it), flipping `playing`.
- FPS `<select>` over `[2, 4, 6, 8, 10, 15, 30]`, labeled `{n} fps`.
- Direction toggle button: label `Forward` / `Reverse`, flips `reverse`.
- Sprite `<select>` over `Object.entries(DEFAULT_SPRITE_LIBRARY)` using each
  entry's `.name` as the label.
- `Clear` button: resets `sel`, `pending`.
- `Download JSON` button:

```ts
import { saveFile } from '../lib/save-file';
import { buildCycleJson } from '../lib/palette-export';
// onClick:
void saveFile({
  defaultName: 'pixel-pal-cycle.json',
  filters: [{ name: 'Palette cycle JSON', extensions: ['json'] }],
  data: { text: buildCycleJson(rows[sel.row], [{ low: sel.low, high: sel.high, rate: fps, reverse }]) },
  folderKey: 'json',
});
```

### Empty state

When `sel === null` and `pending === null`, show italic helper text (match
the `text-[11px] text-cyan-100/70 italic` style used by other viz blurbs):
"Click a swatch to set the cycle start, then a second swatch in the same
row to set the end." When `pending !== null`, show "Now click the end shade
in the same row."

If `rows.length === 0`, `return null` (DitherBlend precedent).

## Step 5 — Wire into `src/components/panels/VizComparePanel.tsx`

Two edits:

**(a)** Add to the imports block at the top:

```ts
import { PaletteCycleEditor } from '../PaletteCycleEditor';
```

**(b)** Inside `renderSlotViz`, directly after the closing of the
`vizSub('dither', ...)` call — i.e. between these two existing anchor lines:

```tsx
        ))}
        {compact && <div className="text-[10px] text-cyan-100/50 text-center font-mono bg-black/60 rounded px-1">{ramps.length} ramps, {allColors.length} unique colors</div>}
```

insert:

```tsx
        {!compact && vizSub('cycle', 'Palette Cycling', null, compact, (
          <>
          <p className="text-[11px] text-cyan-100/70 italic mb-2">Classic index-rotation animation: mark a contiguous shade range, then the range's colors rotate in place at the chosen rate — how water, lava and torch ramps are animated on indexed hardware. Smooth motion means the range cycles cleanly; a visible "pop" means the ramp ends don't meet. Export writes a PIXEL.PAL JSON sidecar (range + rate) alongside the palette files.</p>
          <PaletteCycleEditor rows={mosaicRamps.map((r) => r.hexes)} borderColor={t.vizDataBorder} />
          </>
        ))}
```

Notes: `mosaicRamps` and `t` are already in scope there. The `'cycle'`
sub-key needs **no** registration: `vizSubOpen[subKey] !== false` defaults
new keys to open, and the persisted `ui:vizSubOpen` record tolerates unknown
keys. `vizSub` with `compact === false` renders the standard collapsible
frame, so passing the literal `compact` through is correct given the
`!compact &&` guard.

## Step 6 — Unit tests

### `tests/unit/palette-cycle.spec.ts` (pure functions)

```ts
import { describe, it, expect } from 'vitest';
import { rotateCycle } from '../../src/lib/viz-interaction';
import { buildCycleJson } from '../../src/lib/palette-export';

const HEXES = ['#000000', '#111111', '#222222', '#333333', '#444444', '#555555'];

describe('rotateCycle', () => {
  it('offset 0 is the identity (new array, same contents)', () => {
    const out = rotateCycle(HEXES, 1, 4, 0);
    expect(out).toEqual(HEXES);
    expect(out).not.toBe(HEXES);
  });

  it('rotates only inside the inclusive range, leaving the rest alone', () => {
    const out = rotateCycle(HEXES, 1, 4, 1);
    expect(out).toEqual(['#000000', '#222222', '#333333', '#444444', '#111111', '#555555']);
  });

  it('is periodic: offset === range length is the identity', () => {
    expect(rotateCycle(HEXES, 1, 4, 4)).toEqual(HEXES);
    expect(rotateCycle(HEXES, 1, 4, 9)).toEqual(rotateCycle(HEXES, 1, 4, 1));
  });

  it('reverse undoes forward for the same offset', () => {
    const fwd = rotateCycle(HEXES, 1, 4, 3);
    expect(rotateCycle(fwd, 1, 4, 3, true)).toEqual(HEXES);
  });

  it('handles negative offsets like a reverse step', () => {
    expect(rotateCycle(HEXES, 1, 4, -1)).toEqual(rotateCycle(HEXES, 1, 4, 3));
  });

  it('clamps out-of-bounds and swapped endpoints', () => {
    expect(rotateCycle(HEXES, 4, 1, 1)).toEqual(rotateCycle(HEXES, 1, 4, 1));
    expect(rotateCycle(HEXES, -3, 99, 6)).toEqual(HEXES); // clamped to full length, period 6
  });

  it('degenerate ranges and empty input are no-ops', () => {
    expect(rotateCycle(HEXES, 2, 2, 5)).toEqual(HEXES);
    expect(rotateCycle([], 0, 3, 2)).toEqual([]);
  });
});

describe('buildCycleJson', () => {
  it('writes a parseable sidecar with format tag, version, lowercased palette', () => {
    const text = buildCycleJson(['#FF00FF', '#00FFFF'], [{ low: 0, high: 1, rate: 8, reverse: false }]);
    expect(text.endsWith('\n')).toBe(true);
    const doc = JSON.parse(text);
    expect(doc).toEqual({
      format: 'pixel-pal-cycle',
      version: 1,
      palette: ['#ff00ff', '#00ffff'],
      cycles: [{ low: 0, high: 1, rate: 8, reverse: false }],
    });
  });
});
```

### `tests/unit/PaletteCycleEditor.spec.tsx` (component smoke)

Follow the conventions of `tests/unit/ShadeCountControl.spec.tsx`
(`@testing-library/react`, `vi`, jsdom). Mock the save layer at the top —
**before importing the component**:

```ts
vi.mock('../../src/lib/save-file', () => ({
  saveFile: vi.fn().mockResolvedValue({ ok: true }),
}));
```

Cover, minimally:

1. Renders `null`-equivalent (empty container) for `rows={[]}`.
2. With two rows, shows the start-swatch helper text and one button per
   shade (query by the `Ramp X shade Y` aria-labels).
3. Clicking `Ramp 1 shade 2` then `Ramp 1 shade 5` commits the range: the
   helper text disappears and the Play/Pause, fps, and Download controls
   appear.
4. Endpoint order is normalized: clicking shade 5 then shade 2 gives the
   same committed state.
5. Clicking `Download JSON` calls the mocked `saveFile` once; assert on the
   call's `defaultName`, `folderKey: 'json'`, and that
   `JSON.parse(call.data.text)` has `cycles[0]` equal to
   `{ low: 1, high: 4, rate: 8, reverse: false }` (indices are 0-based; the
   aria-labels are 1-based).

jsdom has `requestAnimationFrame` but `canvas.getContext` returns null —
the component's null-check (Step 4) makes the loop a safe no-op; do not
assert on canvas pixels.

## Step 7 — Docs + changelog

1. `docs/ARCHITECTURE.md`, File Map, immediately after the
   `PixelPlayground.tsx` line, add (match surrounding comment alignment):

   ```
       PaletteCycleEditor.tsx viz: palette-cycling designer (range select +
                           rAF index-rotation preview + JSON sidecar export)
   ```

2. `docs/ARCHITECTURE.md`, "Export & visualization" section, add a bullet
   after the "PNG palette strip intentionally diverges" bullet:

   ```
   - **Palette-cycle JSON sidecar** (`buildCycleJson`, `lib/palette-export.ts`;
     UI in `PaletteCycleEditor.tsx`): PIXEL.PAL-specific `pixel-pal-cycle.json`
     with a positional single-ramp `palette` + `cycles: [{low, high, rate,
     reverse}]` (rate = fps). Like the PNG strip it deliberately does NOT go
     through `collectPaletteEntries` (positional, un-deduped, one ramp). The
     cycle selection is ephemeral viz UI state: not saved, not in undo, cleared
     when the visualized rows change shape.
   ```

3. `CHANGELOG.md`, under `## [Unreleased]` (create an `### Added` heading
   there if none exists):

   ```
   - Palette Cycling designer in Visualize & Compare: mark a contiguous shade
     range in a ramp, preview classic index-rotation animation (settable fps,
     direction, sprite preview), and export the cycle as a
     `pixel-pal-cycle.json` sidecar. (#131)
   ```

Do **not** touch `package.json` / `tauri.conf.json` / `Cargo.*` versions.

## Step 8 — Verification gates (all must pass)

```bash
npm test                 # vitest, including the two new spec files
npm run build            # tsc --noEmit + vite build
npm run deadcode         # new exports must NOT be listed as unused
grep -rn "rotateCycle\|buildCycleJson\|PaletteCycleEditor" src tests   # sanity: all wired
```

`npm run test:e2e` is not expected to change (no new e2e in v1; the sub-panel
is collapsed-state-compatible and adds no `data-tour-id`s). If you run the
app (`npm run dev`): open Visualize & Compare → Palette Cycling, click two
swatches in one row, confirm the strip + sprite animate and Download JSON
saves a parseable file; confirm the sub-panel is absent in two-column
compare mode; confirm removing a ramp clears the selection without errors.

## Step 9 — Delivery

- Implement on a fresh branch off `main` named `claude/issue-131-palette-cycling`
  (this plan itself lives on `claude/issue-131-fix-plan-rdo4as`; do not
  implement there).
- Suggested commits (or one squashed commit is acceptable):
  1. `Add rotateCycle + cycle JSON sidecar builders with unit tests (#131)`
  2. `Add PaletteCycleEditor and wire Palette Cycling into Visualize & Compare (#131)`
  3. `Document palette-cycling designer (architecture + changelog) (#131)`
- Push with `git push -u origin claude/issue-131-palette-cycling` and open a
  **draft PR** titled `Palette-cycling designer: author + preview index-rotation
  animation (fixes #131)`.

## Explicit non-goals (v1 — mention in the PR body as future work)

- Multiple simultaneous cycle ranges (format already supports it).
- Persisting the range in saved palettes / undo history (would require
  joining `resetPaletteState` + `permuteRampState` re-keying invariants).
- Animated PNG/GIF export of the cycle.
- Importing `pixel-pal-cycle.json` back.
