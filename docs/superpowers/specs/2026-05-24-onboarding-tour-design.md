# Onboarding Tour & Interactive Guides — Design Spec

## Overview

Add a first-launch onboarding tour and a persistent "Show Me How" guide system to PIXEL.PAL. Users get oriented on first run; a "?" button gives access to guides any time after.

---

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/components/TourPanel.tsx` | Side panel component. Receives app state as props. Renders guide-select, tour, or task-guide mode. |
| `src/lib/tours.ts` | Step data for the onboarding tour and all 8 task guides. Exports `ONBOARDING_TOUR` and `TASK_GUIDES`. |

### App.tsx changes

Three new state hooks:
```typescript
const [tourOpen, setTourOpen] = useState(false)
const [tourGuideId, setTourGuideId] = useState<string | null>(null)
const [tourStep, setTourStep] = useState(0)
```

First-launch detection via `useEffect` on mount:
```typescript
useEffect(() => {
  const seen = localStorage.getItem('pixel-pal-tour-seen')
  if (!seen) {
    setTimeout(() => setTourOpen(true), 600)
  }
}, [])
```

`<TourPanel />` added near bottom of JSX (alongside existing `<AISettingsPanel />`), receives a `TourAppState` snapshot prop.

"?" button added to header, left of the PIXEL.PAL title.

---

## TourPanel Component

### Props

```typescript
interface TourPanelProps {
  open: boolean
  onClose: () => void
  appState: TourAppState
  tourStep: number
  tourGuideId: string | null
  onSetGuide: (id: string | null) => void
  onSetStep: (step: number) => void
  onMarkSeen: () => void
}

interface TourAppState {
  mode: string               // 'color' | 'ai' | 'image'
  showAISettings: boolean
  imageDataUrl: string | null
  exportOpen: boolean
  compareMode: boolean
  hwPickerOpen: boolean
  aiLoading: boolean
  baseColors: string[]       // from App.tsx state; ramps are always computed from this
  // NOTE: baseColors initializes as ['#ff00ff'], so baseColors.length > 0 is always true.
  // "User generated a palette" detectors must use a more specific signal — see guide steps below.
}
```

### Panel modes

1. **`guide-select`** — shown when `tourGuideId === null`. Lists "Quick tour" + 8 task guides.
2. **`tour`** — shown when `tourGuideId === 'onboarding'`. 4-step informational walkthrough, Next/Back/Skip buttons.
3. **`task-guide`** — shown when `tourGuideId` is one of the 8 task IDs. Step-by-step with auto-advance.

### Layout

Fixed position, slides in from left. Width: 260px. Z-index: 40 (below modal z-50). App content does not reflow. Styled with existing theme tokens (`t.*`).

Header: "GUIDES" label + "✕" close button.
Footer (task-guide mode): step counter (e.g., "2 / 4") + Back button + manual Next fallback.

### Auto-advance

On every render, `TourPanel` evaluates the current step's `detector(appState)`. Advancement is edge-triggered: the panel records the detector's value when the step is entered (`detectorBaseline`). Auto-advance fires only when the detector goes from the baseline value to `true`. If the condition is already satisfied at entry, the baseline is `true` and the step will not self-advance — the user must click Next.

When the detector transitions `false → true`, increment step after a 400ms delay (gives user time to see the UI change). If on last step, show completion screen for 1.5s then return to `guide-select`.

---

## Step Data (`tours.ts`)

### Types

```typescript
interface TourStep {
  title: string
  body: string
  hint?: string                              // action prompt, e.g. "→ click the AI Assist tab"
  detector?: (s: TourAppState) => boolean    // auto-advance trigger
}

interface TourGuide {
  id: string
  label: string
  steps: TourStep[]
}
```

### Onboarding tour (4 steps, no detectors)

1. **Welcome** — "PIXEL.PAL generates pixel-art palette ramps. Pick an input mode below to start."
2. **Input modes** — "Three ways in: type a hex color, describe a palette with AI, or extract colors from an image."
3. **Palette ramps** — "Each ramp shows 4-8 shades in 3 contrast styles: Punchy, Balanced, Muted. Adjust HSV, pin shades, or shuffle."
4. **Export** — "Export as plain text or .gpl for Aseprite, Krita, or GIMP. Done — go make something."

Mark `pixel-pal-tour-seen` in localStorage when user clicks Done or Skip on step 4.

### Step advancement: hybrid model

Steps with a `detector` auto-advance when the condition is met. Steps without a `detector` require the user to click Next. The footer always shows a Next button as fallback — it advances even on auto-detect steps if the user prefers not to interact.

Detectors are **edge-triggered**: TourPanel records the detector's return value when a step is first entered. Auto-advance only fires when the value transitions `false → true`. This prevents a step from skipping immediately if the app state already satisfies the condition at entry (e.g., starting "Generate from hex color" while already on the Single Color tab).

### Task guides (8 guides, hybrid auto-advance)

**1. Generate from hex color** (id: `hex-palette`)
1. "Switch to Single Color tab" — hint: "→ click Single Color" — detector: `mode === 'color'`
2. "Type any hex color in the input and press Enter" — hint: "e.g. #3b82f6" — detector: `baseColors[0] !== '#ff00ff'` (user replaced the default placeholder color)
3. "Ramps generated. Try the HSV sliders on any ramp." — no detector (completion)

**2. Use AI Assist** (id: `ai-assist`)
1. "Click the AI Assist tab" — detector: `mode === 'ai'`
2. "Open AI settings and add your API key" — hint: "→ click the gear icon" — detector: `showAISettings === true`
3. "Close settings, type a prompt, click Generate" — detector: `aiLoading === true`
4. "Palette generated from your prompt." — no detector (completion)

**3. Extract from image** (id: `image-import`)
1. "Click the From Image tab" — detector: `mode === 'image'`
2. "Drag an image in, paste (Ctrl+V), or click to upload" — detector: `imageDataUrl !== null`
3. "Colors extracted and ramps built. Use the eyedropper to pick specific colors." — no detector (completion)

**4. Pin a shade** (id: `pin-shade`)
1. "Generate a palette first (any mode)" — detector: `baseColors[0] !== '#ff00ff' || imageDataUrl !== null` (AI generation updates baseColors anyway)
2. "Right-click any color swatch to open the pin menu" — hint: "→ right-click a swatch"
3. "Click the hex field to lock that shade to a custom color" — no detector (completion; pin state is per-swatch, complex to observe generically)

**5. Snap to hardware colors** (id: `hardware-lock`)
1. "Open the Export panel at the bottom" — detector: `exportOpen === true`
2. "Click a hardware target: NES, Game Boy DMG, CGA 16, etc." — hint: "→ click Hardware Lock" — detector: `hwPickerOpen === true`
3. "All unlocked shades snapped to nearest legal color." — no detector (completion)

**6. Harmonize ramps** (id: `harmonize`)
1. "Generate at least two ramps first" — detector: `baseColors.length >= 2`
2. "Click Harmonize and choose a color theory option" — hint: "→ find Harmonize below the ramps" — no detector (hard to observe; button triggers instant change)
3. "Ramps rotated to color-theory positions relative to your anchor." — no detector (completion)

**7. Export as .gpl** (id: `export-gpl`)
1. "Open the Export panel at the bottom" — detector: `exportOpen === true`
2. "Choose a contrast style: Punchy, Balanced, or Muted"
3. "Click Download .gpl to save the palette file." — no detector (file downloads don't emit state)

**8. WCAG contrast check** (id: `wcag-compare`)
1. "Click Compare Mode to enable contrast checking" — detector: `compareMode === true`
2. "Click any two swatches: one as foreground, one as background"
3. "See AA/AAA pass/fail in the WCAG panel top-right." — no detector (completion)

---

## First-Launch Behavior

1. App mounts, `useEffect` checks `localStorage.getItem('pixel-pal-tour-seen')`
2. If absent: `tourOpen = true` after 600ms delay, `tourGuideId = 'onboarding'`, `tourStep = 0`
3. Tour completes or user skips: set `pixel-pal-tour-seen = '1'` in localStorage
4. Subsequent launches: `tourOpen` stays false; "?" button is the only entry point

---

## "?" Trigger Button

Location: header, left of "PIXEL.PAL" title text.
Style: small button matching existing control style (same as CRT/theme buttons).
Behavior: if panel is closed, opens it in `guide-select` mode (`tourGuideId = null`, `tourStep = 0`). If panel is already open, closes it. Does not resume a mid-guide session — always resets to guide-select on open.

---

## Testing

One Playwright e2e test in `tests/e2e/onboarding.spec.ts`:
1. Clear `pixel-pal-tour-seen` from localStorage before test
2. Load app, verify tour panel opens automatically
3. Click through all 4 onboarding steps with Next button
4. Verify panel closes and `pixel-pal-tour-seen` is set
5. Reload app, verify tour does NOT auto-open
6. Click "?" button, verify guide-select panel opens
7. Start "Generate from hex color" guide, type a hex, verify step auto-advances

---

## Out of Scope

- Spotlight/DOM-highlight overlay (chose side panel instead)
- Per-step screenshots or illustrations inside the panel
- Analytics or completion tracking beyond the single localStorage flag
- Tooltip-style anchoring to specific UI elements
