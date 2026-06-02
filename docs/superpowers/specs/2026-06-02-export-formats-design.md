# Export Formats + Handoff — Design Spec

**Date:** 2026-06-02
**Status:** Approved, ready for writing-plans
**Scope:** Spec 1 of the export/interchange backlog (see `FEATURE-BACKLOG.md`).
Adds three palette-level export formats and one desktop handoff convenience.
**No engine / ramp-generation changes.** Mostly additive.

## Motivation

The 2026-06-02 competitive deep-research sweep found PIXEL.PAL's OKLCH ramp
differentiator is not unique (PalGen, Rampart in-Aseprite; Novaboard in-browser
all ship perceptual ramps). The honest wedge is breadth + low-friction handoff
into the editor the artist already uses. Today PIXEL.PAL exports only `.gpl`
(GIMP/Aseprite/Krita) and `.txt`. Gaps this spec closes:

- **GrafX2 / Paint Shop Pro users** need JASC `.pal` — `.gpl` does not reach them.
- **Photoshop / Illustrator / Krita swatch users** need Adobe `.ase`.
- **Any editor with an eyedropper** can consume a **PNG palette strip** — the
  most universal interchange fallback (drag onto canvas, eyedrop). PIXEL.PAL
  currently has only *visualization* PNGs (mosaic, lightness, adjacency,
  dither), none of which is a clean import-grade swatch sheet.
- **Desktop friction**: after a native Save As, the user has to go find the
  file. A "reveal in folder" action closes that loop.

## Out of scope (explicitly)

- **Copy-as-hex to clipboard** — ALREADY SHIPS. `copyPaletteToClipboard`
  (`src/App.tsx` ~4927) + Copy button (~7675) copy the palette as text via
  `buildPaletteText()` with an `execCommand` fallback. Do not re-implement.
- **Variable shade count (2–64)** — backlog item D.
- **Fix My Palette / Lospec round-trip** — backlog item E (absorbs B).
- **Per-ramp `.pal` / `.ase`** — niche; per-ramp rows stay `.gpl` / `.txt`.

## Architecture

### The shared entry pipeline (anti-drift spine)

Today `buildPaletteGpl(style)` (`src/App.tsx` ~4948) builds its `{hex, name}[]`
entry list **inline**: it walks `baseColors`, resolves the effective base per
ramp, computes labels, filters hidden shades, **then appends harmony colors**
(complementary / analogous / triadic / split-comp / tetradic / square), then
dedupes by hex.

If `.pal` and `.ase` each rebuild that list independently, they WILL drift from
`.gpl` on some edge input — the mirror/round-trip divergence bug class (see
user global CLAUDE.md rule "mirror / round-trip paths" and skill-observation
#1, which caught exactly this in the PNG-export work).

**Therefore:** extract a single function

```
collectPaletteEntries(style: 'punchy'|'balanced'|'muted') => { hex: string; name: string }[]
```

that performs the ramp-walk + harmony-append + dedupe-by-hex currently inside
`buildPaletteGpl`. Then `.gpl`, `.pal`, and `.ase` serializers ALL consume
`collectPaletteEntries(style)`. The serializers become pure
`entries -> string|bytes` transforms with no color logic of their own. This
guarantees the three text/binary formats describe an identical color set.

`buildPaletteGpl` is refactored to call `collectPaletteEntries` then format;
behavior must be byte-identical to today (regression-guard with a snapshot of
current `.gpl` output before refactor).

### Intentional divergence: PNG palette strip

The PNG strip is **not** built from `collectPaletteEntries`. It is a positional
grid: one row per ramp, one cell per *visible* shade, in palette order. It
therefore **intentionally differs** from `.gpl`/`.pal`/`.ase` in two ways:

1. **No dedup** — a color repeated across ramps appears in each cell (positions
   matter in a strip; the others dedupe because palette files expect unique
   entries).
2. **No harmony colors** — the strip shows only the ramps, not the appended
   complementary/analogous/etc. swatches.

Both divergences are deliberate and MUST be documented in a code comment on the
strip renderer, so a future reader does not "fix" the strip into alignment with
the palette files or file a "strip is missing colors" bug.

## Components

### 1. `collectPaletteEntries(style)` — `src/App.tsx`

Extracted from `buildPaletteGpl`. Returns the deduped `{hex, name}[]` (ramps +
harmony). Single source of truth for all palette-file formats.

### 2. JASC `.pal` serializer

`buildPalettePal(style)`: consumes `collectPaletteEntries(style)`.

Format (CRLF line endings for old PSP/GrafX2 safety):

```
JASC-PAL
0100
<count>
<r> <g> <b>
...
```

- Header line `JASC-PAL`, version `0100`, then decimal `<count>` of entries.
- One `R G B` line per entry, space-separated decimal 0–255 (reuse `hexToRgb`).
- Lines joined with `\r\n`, trailing `\r\n`.

Saved as `{ text }`. New `folderKey: 'pal'`.

### 3. Adobe `.ase` serializer (binary)

`buildPaletteAse(style)`: consumes `collectPaletteEntries(style)`, returns
`Uint8Array`. Big-endian throughout. **Flat** — no group blocks (matches the
flat dedup behavior of the other palette files).

Byte layout (confirmed correct):

| Field | Bytes | Value |
|---|---|---|
| Signature | 4 | `ASEF` (ASCII) |
| Version major | uint16 | `1` |
| Version minor | uint16 | `0` |
| Block count | uint32 | number of color entries |

Then per color block:

| Field | Bytes | Value |
|---|---|---|
| Block type | uint16 | `0x0001` (color entry) |
| Block length | uint32 | length in bytes of the block body that follows |
| Name length | uint16 | length in UTF-16 code units, **including** trailing null |
| Name | 2 × len | UTF-16BE, null-terminated |
| Color model | 4 | `RGB ` (ASCII, trailing space) |
| R, G, B | 3 × float32 | each 0.0–1.0, big-endian |
| Color type | uint16 | `2` (normal) |

- Color names = entry `name`; if empty, fall back to the hex string.
- Floats = channel / 255.

Saved as `{ bytes }`. New `folderKey: 'ase'`. `save-file.ts` already supports
`{ bytes: Uint8Array | Blob }`.

**Known confusion (must surface in README + dropdown label):** `.ase` is the
*Adobe Swatch Exchange* extension, which **collides** with Aseprite's own
sprite files (`.ase` / `.aseprite`). Aseprite does NOT import Adobe `.ase` as a
palette (it reads `.gpl` / `.pal` / `.png` / `.act` / `.hex`), and
double-clicking a `.ase` swatch file may hand it to Aseprite, which will fail
to parse it as a sprite. Mitigations:

- Dropdown entry label: **"Adobe Swatch Exchange (.ase)"**, never bare ".ase".
- README + spec state `.ase` targets **Photoshop / Illustrator / Krita**, not
  Aseprite. Aseprite users should pick `.gpl`, `.pal`, or the PNG strip.

### 4. PNG palette strip renderer — `src/lib/strip-export.ts`

New function alongside the existing viz renderers (`drawMosaicPng`,
`drawLightnessStripPng`, etc.), reusing their canvas patterns. Returns a Blob.

- Input: the per-ramp visible shades for the active style (same source the
  on-screen ramps render from), one row per ramp.
- Layout: grid, fixed cell size (default 32px), one row per ramp, one cell per
  visible shade. No axes, no labels, no gaps between cells.
- **Flat color, integer pixel coordinates, full opacity** — so an eyedropper
  reads exactly the source hex (no anti-aliased edges, no alpha blend).
- Rows may have unequal cell counts (ramps differ in length after hidden-shade
  filtering); left-align each row. Canvas width = maxCells × cellSize.
- Document the two intentional divergences (no dedup, no harmony) in a comment.

Saved as `{ bytes: Blob }`, reuses `folderKey: 'png'`.

### 5. Export UI (U1) — `src/App.tsx`

Palette-level export gains a **format dropdown**: `.gpl` / `.pal` / Adobe
Swatch Exchange (.ase) / PNG strip / `.txt`. One Download button serializes the
selected format. Mirrors the existing `gplStyle` selector pattern. The existing
`gplStyle` (punchy/balanced/muted) selector governs **all** palette-file
formats and the PNG strip — one style control for every palette-level export.

**Consolidation:** the format dropdown + single Download button **replaces** the
current separate full-palette `.gpl` Download button and `.txt` export control.
`.gpl` and `.txt` become two options in the dropdown rather than standalone
buttons — no duplicate UI where both a dropdown and the old buttons coexist.
The `gplStyle` selector stays (now labeled as the export style for all formats).
The Copy button (clipboard, out of scope above) is unaffected and remains.

- New UI state `exportFormat`, persisted to `ui:exportFormat` (same pattern as
  `gplStyle` at `ui:gplStyle`), validated against the allowed set on load.
- Download handler switches on `exportFormat` → calls the matching serializer →
  `saveFile` with the right `defaultName` / `filters` / `folderKey`.
- **Per-ramp export rows are unchanged** (`.gpl` / `.txt` only).

### 6. Reveal in folder (C) — desktop only

After a successful native (Tauri) save, offer a "Reveal in folder" action using
`revealItemInDir` from `@tauri-apps/plugin-opener` (already a dependency) on the
path `saveFile` returns in `SaveResult`.

- **Capability change required:** `src-tauri/capabilities/default.json`
  currently grants only `opener:default`, which does NOT include reveal. Add
  **`opener:allow-reveal-item-in-dir`** or the call fails at runtime.
- Gate the UI on desktop (`isTauri()`); hidden on web. Web has no native path
  and the browser-download flow already lands files in the Downloads folder.
- Dynamic import of the opener plugin, consistent with the project's
  Tauri-import gating rule.

## Data flow

```
gplStyle (style selector)
   │
   ▼
collectPaletteEntries(style) ──► buildPaletteGpl ──► {text} ─┐
                              ├─► buildPalettePal ──► {text} ─┤
                              └─► buildPaletteAse ──► {bytes}─┤
                                                              ├─► saveFile(folderKey) ─► SaveResult(path)
visible ramp shades (per style) ─► drawPaletteStripPng ─► {bytes: Blob} ─┘                  │
                                                                            (desktop) ──► revealItemInDir(path)
```

## Error handling

- Follow the existing `exportPaletteGpl` pattern: try/catch around
  serialize + save, set `exportFeedback` to a success/cancel/fail message,
  clear after a timeout.
- `.ase` serialization is pure (no IO) and cannot fail on valid entries; an
  empty palette yields a valid 0-block file — guard the UI so export is
  disabled / no-ops when there are no ramps (match current `.gpl` behavior).
- Reveal: if `revealItemInDir` throws (path missing, capability absent in a
  misbuilt bundle), swallow and show a non-fatal "Couldn't open folder" message;
  the file was still saved.

## Testing

Unit (vitest, `tests/unit/`):

1. **`.ase` byte structure** — serialize a known 2-color palette; assert
   signature `ASEF`, version `1.0`, block count `2`, first block type `0x0001`,
   and one known color's float32 bytes (e.g. pure red → R=1.0 → `3F 80 00 00`).
2. **Anti-drift contract** — `collectPaletteEntries(style)` and the color set
   embedded by `buildPaletteGpl` / `buildPalettePal` / `buildPaletteAse` are
   the same hex list, in the same order, for a multi-ramp fixture including a
   cross-ramp duplicate (locks the shared-spine guarantee).
3. **`.pal` format** — header lines `JASC-PAL` / `0100` / count, CRLF endings,
   correct `R G B` decimal rows for a known fixture.
4. **`.gpl` regression** — snapshot current `.gpl` output before the
   `collectPaletteEntries` refactor; assert byte-identical after.

Manual round-trip (record results in the PR):

- `.pal` → GrafX2 imports the palette.
- Adobe `.ase` → Photoshop and/or Krita load the swatches.
- PNG strip → drag onto an Aseprite canvas, eyedrop a cell, confirm the picked
  hex equals the source hex exactly.
- Desktop: save each format, click Reveal in folder, confirm the OS file
  manager opens with the file selected.

## Files touched

- `src/App.tsx` — extract `collectPaletteEntries`; add `buildPalettePal`,
  `buildPaletteAse`; refactor `buildPaletteGpl`; add `exportFormat` state +
  persistence; format dropdown + download handler; desktop reveal action.
- `src/lib/strip-export.ts` — add `drawPaletteStripPng` (+ divergence comment).
- `src/lib/save-file.ts` — add `'pal'` and `'ase'` to `FolderKey`.
- `src-tauri/capabilities/default.json` — add
  `opener:allow-reveal-item-in-dir`.
- `tests/unit/` — new specs (`.ase` bytes, anti-drift contract, `.pal` format,
  `.gpl` regression).
- `README.md` — export section: list `.pal` / `.ase` / PNG strip; add the
  `.ase`-≠-Aseprite note.
- `CHANGELOG.md` — `[Unreleased]` Added entries.

## Release

Per CLAUDE.md versioning: backward-compatible additive features → **PATCH or
MINOR**. New export formats are user-facing features → bump **MINOR**
(0.13.0 → 0.14.0) when released. Move `[Unreleased]` notes into the dated
section; four version files in lockstep + tag (see `release-flow` memory).
