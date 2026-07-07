# SP2 Phase D Slice 1: InputPanel Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the input/mode card (`App.tsx:3356-3556`, hex/image/sprite
input UI) into a new typed component, `src/components/panels/InputPanel.tsx`,
with zero behavior change.

**Architecture:** Mechanical JSX extraction, not a rewrite. The card's JSX is
moved verbatim into a new file wrapped in a typed, props-only React
component (same convention as the 7 existing Tier-C panels). App.tsx keeps
all the state/hooks/handlers the card used (they're shared with other parts
of App.tsx); it only stops rendering the JSX inline and instead renders
`<InputPanel ...54 props.../>`.

**Tech Stack:** React 19, TypeScript, Tailwind v3 (className strings, no
plugin), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-07-06-sp2-phase-d-slice-1-input-panel-design.md`

## Global Constraints

- `App.tsx` keeps `// @ts-nocheck`. Do not remove it. New file
  (`InputPanel.tsx`) is fully typed, no `@ts-nocheck`.
- Built-in `Read` and `Edit` tools are hard-blocked on `src/**/*.ts(x)` by a
  project hook (Serena enforcement). Use Serena (`get_symbols_overview`,
  `find_symbol`, `replace_content`, `insert_before_symbol`,
  `insert_after_symbol`) for all `src/` code edits. `Grep`/`Glob` are allowed
  for locating text, and are also the only way to view exact source text in
  `App.tsx` given the Read block (see Task 1 Step 1 for the exact technique).
- No em or en dashes anywhere you write prose: commit messages, doc edits,
  code comments. Use commas, periods, colons, or parentheses instead. A
  pre-commit hook rejects commits containing them.
- Shell: PowerShell preferred on this Windows host. Plain `git`/`npm`
  commands shown below work in either PowerShell or the Bash tool.
- A pre-commit hook refuses commits directly on `master`. Work happens on a
  feature branch (Task 0 creates it).
- Do not touch the header controls (`App.tsx:3187-3355`), `BaseColorDock`
  (`3184`), or the "Reset Layout" button (`3559-3570`). Those are out of
  scope for this slice per the spec.
- `docs/ARCHITECTURE.md` File Map must be updated in the same change that
  moves JSX out of `App.tsx` (project convention, see the other 7 panel
  entries already there).
- Verification is DOM-invariance, not new-logic TDD: no unit tests are
  written for this component (it's a 54-prop presentational shell moving
  existing markup, see spec's Verification section for why). The gates are
  `npm run build`, `npm run test:e2e`, `npm run deadcode`, and a manual
  eyeball. Local `vitest`/build green does not substitute for CI e2e green
  before merge.

---

### Task 0: Create feature branch

**Files:** none (git only)

- [ ] **Step 1: Create and check out the branch**

```bash
git checkout -b feat/sp2-phase-d-slice-1-input-panel
```

Expected: `Switched to a new branch 'feat/sp2-phase-d-slice-1-input-panel'`

---

### Task 1: Create `InputPanel.tsx`

**Files:**
- Create: `src/components/panels/InputPanel.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `../../contexts` (already exists, used
  identically by `ExportPanel.tsx`/`SectionCard.tsx`: destructures `t`,
  `themedAccentBorder`, `accentGlow`, `sectionHeadColor`, `accentTextGlow`).
  `PixelSprite` from `./RampsPanel` (already exported there,
  `RampsPanel.tsx:135`).
- Produces: `export function InputPanel(props: InputPanelProps)`, consumed by
  Task 2's edit to `App.tsx`. Prop list below is exact and final, both tasks
  must match it verbatim.

- [ ] **Step 1: Retrieve the exact source block from `App.tsx`**

`Read` is blocked on `src/**.tsx`, and the block is long enough that
`Grep`'s default line-preview truncates several lines as "[Omitted long
matching line]". Use this exact command, which pages through every line
in range 3356 to 3556 (inclusive) using a match-everything pattern, and
redirect the persisted-output file (NOT a `src/*.tsx` path, so `Read` works
on it) back through `Read` to get the untruncated text:

```
Grep(pattern=".?", path="src/App.tsx", output_mode="content", -n=true, offset=3355, head_limit=201)
```

Then `Read` the tool result's persisted-output file path (the tool result
tells you the path; it lives under the session's `tool-results` directory,
not under `src/`). This gives you the verbatim, untruncated text of
`App.tsx:3356-3556`. Do not alter a single character of this block when you
paste it into the new file in Step 3, it is a straight copy.

- [ ] **Step 2: Confirm nothing outside 3356-3556 leaked in**

The retrieved block must start with:
```
<div className="rounded-lg p-6 mb-6 border-2 backdrop-blur-sm" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ff00ff'), ...
```
and end with the matching closing `</div>` at line 3556 (the "Reset Layout"
button block starting at 3559 must NOT be included). If the range is off,
re-run Step 1 with an adjusted `offset`/`head_limit` until it matches exactly.

- [ ] **Step 3: Write the new file**

Create `src/components/panels/InputPanel.tsx` with this structure. The
`{/* PASTE_HERE */}` marker is the ONLY placeholder in this plan, and it
exists only because the JSX body is 200 lines of markup fetched in Step 1,
not because the surrounding code is incomplete, everything else in this file
is final, real code:

```tsx
import { Dice5, Plus, Upload, Pipette, Sparkles, Copy } from 'lucide-react';
import { useTheme } from '../../contexts';
import { PixelSprite } from './RampsPanel';
import { DEFAULT_SPRITE_LIBRARY } from '../../lib/constants';

type SpriteLibrary = Record<string, { pattern: string[]; numShades?: number }>;

interface InputPanelProps {
  mode: 'color' | 'image';
  setMode: (mode: 'color' | 'image') => void;
  colorInput: string;
  setColorInput: (value: string) => void;
  randomizeColor: () => void;
  addColorAsBase: () => void;
  addBaseFeedback: string;

  isDragging: boolean;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  imageDataUrl: string | null;
  handleImageUpload: (file: File) => void;
  imageColorCount: number;
  setImageColorCount: (n: number) => void;
  reExtractFromImage: () => void;
  imageLoading: boolean;
  eyedropperActive: boolean;
  setEyedropperActive: (active: boolean) => void;
  hoveredColor: string | null;
  imageZoom: number;
  setImageZoom: (n: number) => void;
  imageNaturalSize: { width: number; height: number };
  setImageNaturalSize: (size: { width: number; height: number }) => void;
  imageRef: React.RefObject<HTMLImageElement>;
  handleImageHover: (e: React.MouseEvent<HTMLImageElement>) => void;
  handleImageLeave: () => void;
  handleImageClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  imageError: string;

  handleGenerate: () => void;

  spriteLibrary: SpriteLibrary;
  rampsPunchy: string[][];
  spriteKey: string;
  setSpriteKey: (key: string) => void;
  removeCustomSprite: (key: string) => void;
  copySpriteSource: (key: string) => void;
  showSpriteImporter: boolean;
  setShowSpriteImporter: (open: boolean) => void;
  spriteDragging: boolean;
  handleSpriteDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleSpriteDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleSpriteDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleSpriteFile: (file: File) => void;
  spriteImportName: string;
  setSpriteImportName: (name: string) => void;
  spriteImportText: string;
  setSpriteImportText: (text: string) => void;
  spriteImportError: string;
  setSpriteImportError: (error: string) => void;
  importSprite: () => void;

  rampSize: number;
  setRampSize: (n: number) => void;
  hueShiftStrength: number;
  setHueShiftStrength: (value: number) => void;
}

export function InputPanel(props: InputPanelProps) {
  const {
    mode, setMode, colorInput, setColorInput, randomizeColor, addColorAsBase,
    addBaseFeedback, isDragging, handleDragOver, handleDragLeave, handleDrop,
    imageDataUrl, handleImageUpload, imageColorCount, setImageColorCount,
    reExtractFromImage, imageLoading, eyedropperActive, setEyedropperActive,
    hoveredColor, imageZoom, setImageZoom, imageNaturalSize, setImageNaturalSize,
    imageRef, handleImageHover, handleImageLeave, handleImageClick, imageError,
    handleGenerate, spriteLibrary, rampsPunchy, spriteKey, setSpriteKey,
    removeCustomSprite, copySpriteSource, showSpriteImporter, setShowSpriteImporter,
    spriteDragging, handleSpriteDragOver, handleSpriteDragLeave, handleSpriteDrop,
    handleSpriteFile, spriteImportName, setSpriteImportName, spriteImportText,
    setSpriteImportText, spriteImportError, setSpriteImportError, importSprite,
    rampSize, setRampSize, hueShiftStrength, setHueShiftStrength,
  } = props;
  const { t, themedAccentBorder, accentGlow, sectionHeadColor, accentTextGlow } = useTheme();

  return (
    {/* PASTE_HERE: the exact, unmodified JSX retrieved in Step 1
        (App.tsx:3356-3556). It already references every identifier
        destructured above by the same name, no renaming needed. */}
  );
}
```

Note `sectionHeadColor` and `accentTextGlow` are destructured from
`useTheme()` even though the current card body does not call them (grep in
the design spec did not find a direct call inside 3356-3556). Keep them
destructured only if TypeScript's `noUnusedLocals` (check `tsconfig.json`)
would error on unused destructured variables, if it's off, destructure only
`t`, `themedAccentBorder`, `accentGlow` since those are the ones actually
used by the pasted block. Confirm by grepping the pasted block for
`sectionHeadColor(` and `accentTextGlow(` before deciding.

- [ ] **Step 4: Run the build to typecheck the new file**

```bash
npm run build
```

Expected: PASS. If it fails, the errors will point at `InputPanel.tsx`
(the file isn't imported anywhere yet, so App.tsx's own pre-existing
`@ts-nocheck`-suppressed issues are irrelevant here, any new error is one you
introduced in Step 3, most likely a prop type mismatch or an unused
destructured variable from the `noUnusedLocals` case in Step 3's note).

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/InputPanel.tsx
git commit -m "refactor: create InputPanel.tsx (SP2 phase d slice 1, not yet wired)"
```

---

### Task 2: Wire `InputPanel` into `App.tsx`, remove the old inline JSX

**Files:**
- Modify: `src/App.tsx:3356-3556` (delete), plus one import line near the
  other panel imports, plus one new `<InputPanel .../>` call site
- Modify: `docs/ARCHITECTURE.md` (File Map, panels/ list)

**Interfaces:**
- Consumes: `InputPanel` from `./components/panels/InputPanel` (Task 1),
  and the exact 54-prop shape defined there.

- [ ] **Step 1: Add the import**

Use Serena to find where the other panel imports live in `App.tsx` (they'll
be grouped together near the top, e.g. `import { RampsPanel } from
'./components/panels/RampsPanel';`). Use `find_referencing_symbols` or
`Grep` for `from './components/panels/'` to locate the exact line, then
`insert_after_symbol` (or `replace_content` targeting that import block) to
add:

```tsx
import { InputPanel } from './components/panels/InputPanel';
```

- [ ] **Step 2: Replace the inline JSX with the component call**

Use Serena's `replace_content` to replace the exact text span from
`App.tsx:3356` (`<div className="rounded-lg p-6 mb-6 border-2
backdrop-blur-sm" ...`) through `App.tsx:3556` (its matching closing
`</div>`) with:

```tsx
        <InputPanel
          mode={mode} setMode={setMode} colorInput={colorInput} setColorInput={setColorInput}
          randomizeColor={randomizeColor} addColorAsBase={addColorAsBase} addBaseFeedback={addBaseFeedback}
          isDragging={isDragging} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave} handleDrop={handleDrop}
          imageDataUrl={imageDataUrl} handleImageUpload={handleImageUpload} imageColorCount={imageColorCount} setImageColorCount={setImageColorCount}
          reExtractFromImage={reExtractFromImage} imageLoading={imageLoading} eyedropperActive={eyedropperActive} setEyedropperActive={setEyedropperActive}
          hoveredColor={hoveredColor} imageZoom={imageZoom} setImageZoom={setImageZoom} imageNaturalSize={imageNaturalSize} setImageNaturalSize={setImageNaturalSize}
          imageRef={imageRef} handleImageHover={handleImageHover} handleImageLeave={handleImageLeave} handleImageClick={handleImageClick} imageError={imageError}
          handleGenerate={handleGenerate}
          spriteLibrary={spriteLibrary} rampsPunchy={rampsPunchy} spriteKey={spriteKey} setSpriteKey={setSpriteKey}
          removeCustomSprite={removeCustomSprite} copySpriteSource={copySpriteSource} showSpriteImporter={showSpriteImporter} setShowSpriteImporter={setShowSpriteImporter}
          spriteDragging={spriteDragging} handleSpriteDragOver={handleSpriteDragOver} handleSpriteDragLeave={handleSpriteDragLeave} handleSpriteDrop={handleSpriteDrop}
          handleSpriteFile={handleSpriteFile} spriteImportName={spriteImportName} setSpriteImportName={setSpriteImportName}
          spriteImportText={spriteImportText} setSpriteImportText={setSpriteImportText} spriteImportError={spriteImportError} setSpriteImportError={setSpriteImportError}
          importSprite={importSprite}
          rampSize={rampSize} setRampSize={setRampSize} hueShiftStrength={hueShiftStrength} setHueShiftStrength={setHueShiftStrength}
        />
```

Every value on the right of each `=` is an existing local variable already
in scope in `App.tsx` (state, hook return, or handler function), none of
these are new declarations, this step only changes what renders them.

- [ ] **Step 3: Confirm no leftover references**

Grep `App.tsx` for `data-tour-id="mode-tabs"`, `data-tour-id="hex-input"`,
`data-tour-id="add-base-btn"`, `data-tour-id="image-dropzone"`: none of
these should match in `App.tsx` anymore (they now live only in
`InputPanel.tsx`). Then grep `App.tsx` for each of the 54 prop names from
Task 1's interface (e.g. `randomizeColor`, `handleSpriteFile`,
`importSprite`) to confirm each still has exactly one declaration site
(the `useState`/hook destructure or `const handleX = ...`) and is used only
as a prop value in the new call site, not redefined or left dangling
elsewhere. This is the dangling-ref check `@ts-nocheck` files need since
`tsc` won't catch it (CLAUDE.md rule).

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Update ARCHITECTURE.md File Map**

Use Serena/`Grep` to find the `panels/` block in `docs/ARCHITECTURE.md`
(currently lists `HistoryPanel.tsx`, `ExportPanel.tsx`,
`SavedPalettesPanel.tsx`, `PlaygroundPanel.tsx`, `VizComparePanel.tsx`,
`HarmonyPanel.tsx`, `RampsPanel.tsx`). Add a new entry in the same style,
for example:

```
      InputPanel.tsx    props-only (54 props: mode/color/image/sprite input
                        state and handlers); reads ThemeContext for
                        t/themedAccentBorder/accentGlow; reuses PixelSprite
                        exported from RampsPanel.tsx
```

- [ ] **Step 6: Run the unit suite**

```bash
npm test
```

Expected: PASS (no existing unit test targets this JSX directly, this just
confirms nothing else broke).

- [ ] **Step 7: Run e2e (desktop)**

```bash
npm run test:e2e
```

Expected: PASS. If any selector targeting `mode-tabs`/`hex-input`/etc. fails
to resolve, the attribute did not survive the copy verbatim, go back to
Task 1 Step 1 and re-diff against the original text.

- [ ] **Step 8: Deadcode check**

```bash
npm run deadcode
```

Expected: no new orphaned exports reported for symbols this task touched.

- [ ] **Step 9: Manual eyeball**

```bash
npm run tauri:dev
```

Exercise: switch Single Color / Image tabs, type a hex value, roll random
color, add a base, drag/drop or browse an image, run the eyedropper, change
zoom, change image color count and re-extract, open the sprite importer and
import a sprite, change shades and hue-shift sliders. Confirm no visual or
behavioral difference from before this change.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx docs/ARCHITECTURE.md
git commit -m "refactor: wire InputPanel into App.tsx JSX trunk (SP2 phase d slice 1)"
```

---

## Self-Review Notes

**Spec coverage:** Scope (extract 3356-3556, exclude header/dock/reset-layout)
covered by Task 2 Step 2's exact replacement span. Flat-props-plus-ThemeContext
design covered by Task 1 Step 3. PixelSprite reuse covered by Task 1's import.
Verification (build, e2e, deadcode, ARCHITECTURE.md sync, no unit tests)
covered by Task 2 Steps 4, 6-8, 5. DOM-invariance (manual eyeball) covered by
Task 2 Step 9.

**Placeholder scan:** One placeholder remains by design and is called out
explicitly, the pasted JSX body in Task 1 Step 3, because it is 200 lines
fetched live from the current file rather than retyped into this plan
(retyping risks transcription drift that only the source file itself avoids).
Every other line in both tasks is complete, real code or a real command with
a real expected result.

**Type consistency:** The 54-prop interface in Task 1 Step 3 and the 54-prop
call site in Task 2 Step 2 use identical names throughout, cross-checked
prop by prop while writing this plan.
