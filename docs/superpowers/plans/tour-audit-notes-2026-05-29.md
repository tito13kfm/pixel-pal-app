# Tour copy drift audit — 2026-05-29

Task 1 of the guided-tour-redesign plan. Informational scratch doc to drive the
Task 3 copy rewrite. Source files audited: `src/lib/tours.ts`,
`tests/e2e/tour-reality.spec.ts`, `src/App.tsx` (and
`src/components/RampAdvancedPanel.tsx`, `src/lib/ai.ts`).

## Method

1. Ran `npm run test:e2e -- tour-reality.spec.ts`. **All 10 tests passed
   (22.1s).**
2. Static verification of every step in all 9 guides against the live
   `App.tsx` render, because the suite only covers a subset.

**Important:** 10/10 passing does NOT mean no drift. The suite's Layer 1
(DOM token matching) checks only a hand-picked subset of labels, and it checks
ZERO behavioral copy (the body/hint prose). Every real finding below came from
static analysis, which is the expected outcome the plan anticipated.

Entry format: `guide id` → step index (0-based) → exact current text → what it
should reflect.

---

## DRIFT FOUND

### onboarding (ONBOARDING_TOUR), step 2 (index 2) — "Palette ramps"
- Current: "Each ramp shows 4-8 shades in 3 contrast styles."
- Drift (omission): the 3 styles (Punchy/Balanced/Muted) are now **editable**
  via `stylePresets` / `DEFAULT_STYLE_PRESETS` (App.tsx line 1292, used in
  `generateRamp` line 1593+). Copy describes them as fixed. Task 3 to decide
  whether onboarding should mention editability (probably leave onboarding
  high-level; flag for awareness).

### hex-palette, step 2 (index 2) — "Ramps generated" (the BIG one)
- Current: "Your ramps appear below. Each ramp has H/S/V sliders to shift the
  base color, a per-ramp size button, and an Advanced disclosure with
  interactive lightness and saturation curve editors."
- Drift (behavioral — discoverability): none of these controls are visible on
  the ramp card by default. They all live inside an **"Adjust Base" editor**
  that slides open only when you click the **Sliders-icon "Edit base color"
  button** at the card's top-right (App.tsx line 6278, `toggleBaseEditor(i)`).
  Specifics:
  - The sliders are labeled **"Hue" / "Sat" / "Value"** (App.tsx lines
    6364/6369/6374), not "H/S/V".
  - There is **no standalone "per-ramp size button"** — shade count is a
    **"Shades:" control** inside that same editor (line 6388).
  - The **Advanced disclosure** (`RampAdvancedPanel`) renders INSIDE the same
    editor block (line 6431, gated by `editingIndex === i`), not on the card.
    Its toggle text is literally **"▸ Advanced"** (RampAdvancedPanel line 37).
  - The Advanced panel also contains a **Gamut strategy** dropdown
    (auto/clip/chroma-preserve) and a **Hue shift** slider (RampAdvancedPanel
    lines 74/83) that the copy omits.
- Fix direction: copy must tell the user to open the editor first (click the
  sliders icon on the ramp card), then describe Hue/Sat/Value, Shades, and the
  Advanced disclosure (curves + gamut + hue shift) as living inside it.

### ai-assist, step 1 (index 1) — "Add your API key"
- Current: "Open settings and paste in your API key. Supports OpenAI,
  Anthropic, and compatible providers."
- Drift (web-build accuracy + incompleteness): on the GH Pages web build,
  **Anthropic is filtered out** (CORS), along with Ollama
  (`DROPPED_WEB_PROVIDERS = new Set(['anthropic','ollama'])`, ai.ts line 64; a
  saved Anthropic/Ollama config auto-migrates to OpenAI, ai.ts line 81+). So
  "Supports ... Anthropic" is false on web. The list is also incomplete vs the
  desktop provider set. Fix: drop the hardcoded "Anthropic" example or qualify
  it as desktop-only; prefer generic "OpenAI and OpenAI-compatible providers."
- Note (NOT drift): the "gear icon" hint is correct — the AI Settings button
  renders a `⚙` glyph (App.tsx line 6026, `title="AI Settings"`).

### pin-shade, step 1 (index 1) — "Click the pin icon"
- Current: "Click the pushpin icon on any shade (except the base) to pin it.
  The pin editor opens inline."
- Drift (minor, discoverability): the pin button is **hover-only**
  (`opacity-0 group-hover:opacity-100`, App.tsx line 5114) — invisible until
  you hover the swatch. Icon is the lucide `Pin` (pushpin) so "pushpin icon" is
  accurate. Fix: mention you hover a shade swatch to reveal its pin button.

### harmonize, step 1 (index 1) — "Click Harmonize"
- Current: "Click Harmonize in the Harmony Colors section **below the ramps**.
  It auto-assigns color-theory positions: complement, analogous, triadic, etc."
  Hint: "→ find Harmonize in the Harmony Colors section".
- Drift (positional — fragile): sections are now **drag-reorderable**
  (`GripVertical` handle, "Drag to reorder this section", App.tsx line
  5632-5634). "below the ramps" is no longer reliable — the user may have moved
  Harmony Colors above the ramps. Drop the spatial "below the ramps"; rely on
  the section name "Harmony Colors" only (the section header text matches,
  App.tsx line 6585). The behavioral claim (auto-assign modes) is accurate; the
  actual mode buttons are labeled Compl./Analog/Triadic/Split/Square/Tetrad
  (App.tsx line 6627-6634), so "complement, analogous, triadic, etc." reads
  fine as prose.

### wcag-compare, step 1 (index 1) — "Pick two swatches"
- Current: "Click one swatch as **foreground**, then another as
  **background**. The WCAG panel appears top-right."
- Drift (minor, terminology): the UI has no foreground/background semantics. It
  is **anchor-first**: "Click any ramp swatch to set it as the anchor color"
  then "Click another swatch to compute the contrast ratio" (App.tsx lines
  5036, 5685, 5689). Panel title is **"WCAG Contrast"** (line 7680). Fix: use
  "anchor" then "second swatch" wording, not foreground/background.
  - "appears top-right" is CORRECT (`fixed top-4 right-4`, line 7677) and NOT a
    reorderable section, so leave it.

---

## CHECKED — CLEAN (no drift)

- **onboarding step 0 (index 0) — "Welcome":** generic; target `mode-tabs`
  exists. Clean.
- **onboarding step 1 (index 1) — "Input modes":** names Single Color / AI
  Assist / Surprise Me / From Image — all present (App.tsx lines 5900-5902,
  6018; drop-zone "Drag & Drop Image" line 5931). Clean.
- **onboarding step 3 (index 3) — "Export":** "Export & Tools header",
  "Download .txt", ".gpl (Piskel/Aseprite/GIMP)" all match (App.tsx lines 7496,
  7508, 7576). Clean.
- **hex-palette step 0 (index 0) — "Switch to Single Color":** "Single Color"
  tab present (line 5900); detector `mode==='color'` valid. Clean.
- **hex-palette step 1 (index 1) — "Enter a hex color":** hex input + OS
  picker + "New palette" button all present (App.tsx line 6031; suite test
  line 54-60 confirms). Clean. NOTE: the generate button was renamed from
  "Generate" to "New palette" in a prior session; tours.ts uses "New palette"
  correctly. No stale "Generate" button-name references remain in tour copy
  (the words "Generate"/"Generate a palette" in tours.ts titles are generic
  prose, not button labels — fine).
- **ai-assist step 0 (index 0) — "Switch to AI Assist":** "AI Assist" tab
  present (line 5901). Clean.
- **ai-assist step 2 (index 2) — "Generate from a prompt":** "describe
  anything..." placeholder + Enter handler + "Execute" button all present
  (App.tsx lines 5921, 6015). Clean.
- **ai-assist step 3 (index 3) — "Palette generated":** generic. Clean.
- **image-import (all 3 steps):** "From Image" tab (line 5902); drop zone
  "Drag & Drop Image" + Ctrl/Cmd+V paste + Browse Files picker (lines
  5931-5935); "Eyedropper" button (line 5951). All match. Clean.
- **pin-shade step 0 (index 0) — "Generate a palette first":** generic prose.
  Clean.
- **pin-shade step 2 (index 2) — "Set the target hex":** describes pin editor
  behavior (hex stays fixed across styles); matches override model (App.tsx
  line 1167+). Clean.
- **hardware-lock (all 3 steps):** "Export & Tools" header, "Hardware Lock"
  button, platform buttons NES / Game Boy / CGA 16 / EGA 64 / C64 all present
  (App.tsx line 7526; suite test lines 95-104 confirm). Clean.
- **export-gpl step 0 (index 0) — "Open the Export panel":** "Export & Tools"
  panel present. Clean.
- **export-gpl step 2 (index 2) — "Download the file":** ".gpl
  (Piskel/Aseprite/GIMP)" button present (line 7576), copy mentions Krita which
  the button title also lists. Clean.
- **wcag-compare step 0 (index 0) — "Enable WCAG Check":** "WCAG Check" button
  present (line 7516, toggles to "Checking (click to exit)" when on). Clean.
- **wcag-compare step 2 (index 2) — "Read the result":** AA/AAA pass-fail copy
  matches the panel. Clean.

## CHECKED — engine/feature notes (no copy contradiction)

- **OKLCH perceptual engine (v0.6):** NO tour copy describes the engine's color
  space or internals. The v0.6 perceptual-engine migration introduced **no copy
  contradiction**. Looked specifically; nothing to change for OKLCH.
- **export-gpl step 1 (index 1) — "Choose a contrast style":** "Select Punchy,
  Balanced, or Muted" — the three styles are real and the .gpl style toggle
  exists (App.tsx lines 7573-7575). Same editable-presets omission as
  onboarding step 2 above (styles are now user-editable); not a wrong-text
  drift, just an unmentioned capability. Task 3 to decide whether to surface it.

---

## SUMMARY

- Guides with drift: 6 of 9 (onboarding, hex-palette, ai-assist, pin-shade,
  harmonize, wcag-compare).
- Guides clean: 3 of 9 (image-import, hardware-lock, export-gpl — export-gpl
  has only the editable-presets omission note, no wrong text).
- Highest-impact fix: **hex-palette step 2** (controls are behind the
  Sliders-icon editor, not on the card; wrong labels; missing gamut/hue-shift).
- Cross-cutting: positional copy ("below the ramps") is now unsafe because
  sections are drag-reorderable — audit any future copy for spatial language.
