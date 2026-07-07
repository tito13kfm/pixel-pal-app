# SP2 Phase D, Slice 1: Extract Input/Mode Card to InputPanel.tsx

## Context

SP2 phase c (logic extraction) is done: `themeTokens`, export handlers, and 8
ramp pure-helpers moved out of `App.tsx` into `lib/`. App.tsx is ~4066 lines,
still `@ts-nocheck`. Phase d is the JSX trunk: the ~970-line `return (...)` at
`App.tsx:3096-4066` mostly already delegates to the 7 Tier-C panels
(RampsPanel, HarmonyPanel, PlaygroundPanel, VizComparePanel,
SavedPalettesPanel, HistoryPanel, ExportPanel). What's left in the trunk:

1. Header controls (title + top-left/top-right absolute button clusters + mode
   tabs container), `~3187-3355`
2. **Input/mode card (this slice)**, `~3356-3556`
3. Tips collapsible, `~3854-3882`
4. Update-available toast, `~3883-3945`
5. Side-by-side compare popup, `~3946-4008`
6. GPL import confirm modal, `~4009-4046`

Decision (user, this session): one slice at a time, starting with the
highest-value/most-complex block. That's the input/mode card: the biggest
single chunk (216 lines) and the most heavily state-coupled.

## Scope

Extract `App.tsx:3356-3556` (the pink/cyan bordered card, inclusive of its own
outer wrapper div) into `src/components/panels/InputPanel.tsx`.

**Verified boundary:** the header div (opened `App.tsx:3187`) closes at
`3313`. SVG CVD-filter `<defs>` sit at `3315-3346` as a sibling. The CVD
filter wrapper div (`3354`, comment: "everything from this point through the
bottom tip panel gets the active SVG color matrix applied") opens next, and
the input card (`3356`) is a **child of that wrapper**, sibling to the
RampsPanel/HarmonyPanel/etc. blocks that follow it and were already extracted
the same way in Tier C. No nesting conflict with the header: the header stays
in App.tsx untouched by this slice.

**Included in the card:**
- Mode tabs (Single Color / Image), `data-tour-id="mode-tabs"`
- Single-color mode: color picker, hex text input (`data-tour-id="hex-input"`),
  randomize button, "Add base" button (`data-tour-id="add-base-btn"`),
  add-base feedback toast
- Image mode: dropzone (`data-tour-id="image-dropzone"`), file browse,
  color-count selector, re-extract, eyedropper toggle plus hover swatch, zoom
  controls, image preview `<img>`, image error display
- "New palette" button (image mode hidden)
- Sprite preview grid (uses `PixelSprite`, exported from `RampsPanel.tsx`,
  no lift needed) plus custom-sprite remove/copy plus sprite importer
  disclosure (drag-drop .c file, paste text, name field, import/cancel)
- Shades selector, hue-shift slider

**Explicitly excluded from this slice** (deferred to future phase-d slices):
- Header title plus absolute button clusters (`~3187-3355`)
- `BaseColorDock` (`3184`): separate component call, not part of the card
- "Reset Layout" button (`3559-3570`): sits between the card and the panel
  list; it's about overall section ordering, not input, so it stays in
  App.tsx
- The other 4 candidates (tips, update toast, compare popup, GPL modal)

## Component design

`src/components/panels/InputPanel.tsx`, following the established Tier-C
convention:

- **Props-only, flat props** (matches RampsPanel/ExportPanel; ~45-55 props
  expected once harvested, smaller than RampsPanel's 73). One prop per piece
  of state/handler the card currently closes over: `mode`, `setMode`,
  `colorInput`, `setColorInput`, `randomizeColor`, `addColorAsBase`,
  `addBaseFeedback`, `imageDataUrl`, `isDragging`, `handleDragOver`,
  `handleDragLeave`, `handleDrop`, `handleImageUpload`, `imageColorCount`,
  `setImageColorCount`, `reExtractFromImage`, `imageLoading`,
  `eyedropperActive`, `setEyedropperActive`, `hoveredColor`, `imageZoom`,
  `setImageZoom`, `imageNaturalSize`, `setImageNaturalSize`, `imageRef`,
  `handleImageHover`, `handleImageLeave`, `handleImageClick`, `imageError`,
  `handleGenerate`, `spriteLibrary`, `DEFAULT_SPRITE_LIBRARY`, `rampsPunchy`
  (sprite-preview swatch source; App.tsx's `ramps` is a legacy alias for this
  same value, pass `rampsPunchy` directly rather than reintroducing the
  alias), `spriteKey`, `setSpriteKey`, `removeCustomSprite`,
  `copySpriteSource`, `showSpriteImporter`, `setShowSpriteImporter`,
  `spriteDragging`, `handleSpriteDragOver`, `handleSpriteDragLeave`,
  `handleSpriteDrop`, `handleSpriteFile`, `spriteImportName`,
  `setSpriteImportName`, `spriteImportText`, `setSpriteImportText`,
  `spriteImportError`, `setSpriteImportError`, `importSprite`, `rampSize`,
  `setRampSize`, `hueShiftStrength`, `setHueShiftStrength`. Exact final list
  gets harvested via grep pass during implementation (same rigor as Tasks
  1-3), not frozen here.
- **Theme via `useTheme()`, not props.** The card uses `t`, `themedAccentBorder`,
  `accentGlow`, `sectionHeadColor`/`accentTextGlow` (used elsewhere in the
  card for consistency even where not yet confirmed by grep). This matches
  `ExportPanel.tsx`/`SectionCard.tsx`, which destructure the identical set
  from `useTheme()`. Do not thread `t` as a prop.
- **PixelSprite**: `import { PixelSprite } from './RampsPanel'`. It's
  already an exported function there, no lift required for this slice.
- **Icons**: component imports its own lucide-react icons (Dice5, Plus,
  Upload, Pipette, Sparkles, RotateCcw, Copy), already app dependencies,
  no new package.
- Component owns its whole card as the JSX root (border/glow wrapper div
  included), same shape as `VizComparePanel` (SectionCard included
  internally), not the App.tsx-owns-the-SectionCard-wrapper shape used by
  Ramps/Harmony/Playground/SavedPalettes/History/Export, because this card
  isn't a `SectionCard` at all.

## Verification

This is JSX extraction, not logic extraction. Unlike phase c, TDD-unit
doesn't apply here (there's no new pure function to unit-test; a 45-55-prop
presentational shell has low unit-test value). The correctness gate is
**DOM-invariance**: rendered output identical before/after.

- `npm run build` (tsc --noEmit + vite build), the dangling-ref safety net
  for the `@ts-nocheck` removal from App.tsx's side of the call site.
- Grep the removed block's `data-tour-id`s (`mode-tabs`, `mode-single`,
  `mode-image`, `hex-input`, `add-base-btn`, `image-dropzone`) and any
  `getByTitle`/`getByText` selectors Playwright specs use against this card,
  confirm they still resolve post-extraction. Attributes move verbatim, but
  confirm: per project rule, a user-visible-selector change needs its e2e
  selector updated in the same change, and this isn't supposed to change
  anything, so any drift here is a bug.
- `npm run test:e2e` (desktop) is the real gate; local vitest green does not
  substitute for it (CLAUDE.md: "green proves only the layer you ran").
  Confirm CI green before merge, not just local build.
- Manual eyeball: dev server, exercise both modes (color and image), sprite
  importer open/import, hue-shift/shades controls, confirm no visual or
  behavior diff.
- `npm run deadcode`, confirm no orphaned exports left in App.tsx.
- Update `docs/ARCHITECTURE.md` File Map (panels/ list) with the new
  `InputPanel.tsx` entry, same pattern as the other 7 panel entries.

## Out of scope for this spec

Slices 2-6 (header controls, tips, update toast, compare popup, GPL modal)
are not planned here. Each gets its own scope check once this slice lands,
per the one-slice-at-a-time decision.
