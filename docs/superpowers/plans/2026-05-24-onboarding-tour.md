# Onboarding Tour & Interactive Guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-launch onboarding tour and 8 persistent "Show Me How" task guides via a left-side panel that overlays the app.

**Architecture:** New `src/lib/tours.ts` holds all step data and types. New `src/components/TourPanel.tsx` renders the overlay panel as a self-contained component, receiving app state as props (mirrors AISettingsPanel pattern). App.tsx gains 3 state hooks, one `useEffect` for first-launch detection, a "?" header button, and a `<TourPanel />` render alongside the existing `<AISettingsPanel />`.

**Tech Stack:** React 19, TypeScript, Tailwind v3, Playwright for e2e tests. No new dependencies.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/lib/tours.ts` | `TourAppState`, `TourStep`, `TourGuide` types; `ONBOARDING_TOUR` and `TASK_GUIDES` data |
| Create | `src/components/TourPanel.tsx` | Left-side panel component — guide-select, onboarding tour, and task-guide modes |
| Modify | `src/App.tsx` | 3 state hooks, first-launch `useEffect`, `TourAppState` snapshot, "?" button, `<TourPanel />` render |
| Create | `tests/e2e/onboarding.spec.ts` | Playwright e2e: auto-open, tour flow, re-trigger, task guide auto-advance |

---

## Task 1: Step data and types (`tours.ts`)

**Files:**
- Create: `src/lib/tours.ts`

- [ ] **Step 1: Create `src/lib/tours.ts` with all types and data**

```typescript
export interface TourAppState {
  mode: string
  showAISettings: boolean
  imageDataUrl: string | null
  exportOpen: boolean
  compareMode: boolean
  hwPickerOpen: boolean
  aiLoading: boolean
  baseColors: string[]
}

export interface TourStep {
  title: string
  body: string
  hint?: string
  detector?: (s: TourAppState) => boolean
}

export interface TourGuide {
  id: string
  label: string
  steps: TourStep[]
}

export const ONBOARDING_TOUR: TourGuide = {
  id: 'onboarding',
  label: 'Quick tour',
  steps: [
    {
      title: 'Welcome to PIXEL.PAL',
      body: 'Generates pixel-art palette ramps. Pick an input mode below to start.',
    },
    {
      title: 'Input modes',
      body: 'Three ways in: type a hex color, describe a palette with AI, or extract colors from an image.',
    },
    {
      title: 'Palette ramps',
      body: 'Each ramp shows 4-8 shades in 3 contrast styles: Punchy, Balanced, Muted. Adjust HSV, pin shades, or shuffle.',
    },
    {
      title: 'Export',
      body: 'Export as plain text or .gpl for Aseprite, Krita, or GIMP. Done — go make something.',
    },
  ],
}

export const TASK_GUIDES: TourGuide[] = [
  {
    id: 'hex-palette',
    label: 'Generate from a hex color',
    steps: [
      {
        title: 'Switch to Single Color',
        body: 'The Single Color tab lets you build ramps from any hex color.',
        hint: '→ click Single Color',
        detector: (s) => s.mode === 'color',
      },
      {
        title: 'Enter a hex color',
        body: 'Type any hex color in the input field and press Enter or click Generate.',
        hint: 'e.g. #3b82f6',
        detector: (s) => s.baseColors[0] !== '#ff00ff',
      },
      {
        title: 'Ramps generated',
        body: 'Your ramps appear below. Try the HSV sliders on any ramp to shift hue, saturation, or value.',
      },
    ],
  },
  {
    id: 'ai-assist',
    label: 'Use AI Assist',
    steps: [
      {
        title: 'Switch to AI Assist',
        body: 'AI Assist generates palettes from a text prompt using a language model.',
        hint: '→ click AI Assist',
        detector: (s) => s.mode === 'ai',
      },
      {
        title: 'Add your API key',
        body: 'Open settings and paste in your API key. Supports OpenAI, Anthropic, and compatible providers.',
        hint: '→ click the gear icon',
        detector: (s) => s.showAISettings,
      },
      {
        title: 'Generate from a prompt',
        body: 'Close settings, type a description (e.g. "sunset over ocean"), and click Generate.',
        detector: (s) => s.aiLoading,
      },
      {
        title: 'Palette generated',
        body: 'Colors extracted from the AI response and built into ramps.',
      },
    ],
  },
  {
    id: 'image-import',
    label: 'Extract from an image',
    steps: [
      {
        title: 'Switch to From Image',
        body: 'The From Image tab extracts dominant colors from any image.',
        hint: '→ click From Image',
        detector: (s) => s.mode === 'image',
      },
      {
        title: 'Load an image',
        body: 'Drag an image onto the drop zone, paste with Ctrl+V, or click to open the file picker.',
        detector: (s) => s.imageDataUrl !== null,
      },
      {
        title: 'Colors extracted',
        body: 'Ramps built from dominant colors. Use the eyedropper to manually pick specific colors.',
      },
    ],
  },
  {
    id: 'pin-shade',
    label: 'Pin a shade to a custom hex',
    steps: [
      {
        title: 'Generate a palette first',
        body: 'Any input mode works. You need at least one ramp before pinning.',
        detector: (s) => s.baseColors[0] !== '#ff00ff' || s.imageDataUrl !== null,
      },
      {
        title: 'Right-click a swatch',
        body: 'Right-click any color swatch in a ramp to open the pin menu.',
        hint: '→ right-click a swatch',
      },
      {
        title: 'Lock it to a hex',
        body: 'Click the hex field in the pin menu and type your target color. The shade stays fixed when you adjust the ramp.',
      },
    ],
  },
  {
    id: 'hardware-lock',
    label: 'Snap to hardware colors',
    steps: [
      {
        title: 'Open the Export panel',
        body: 'The Export panel at the bottom contains the Hardware Lock controls.',
        hint: '→ click Export at the bottom',
        detector: (s) => s.exportOpen,
      },
      {
        title: 'Choose a hardware target',
        body: 'Click a hardware palette: NES, Game Boy DMG, CGA 16, EGA 64, or C64.',
        hint: '→ click Hardware Lock',
        detector: (s) => s.hwPickerOpen,
      },
      {
        title: 'Shades snapped',
        body: 'All unlocked shades now use the nearest legal color for that hardware.',
      },
    ],
  },
  {
    id: 'harmonize',
    label: 'Harmonize ramps',
    steps: [
      {
        title: 'Generate two or more ramps',
        body: 'Harmonize works across multiple ramps. Add a second base color first.',
        detector: (s) => s.baseColors.length >= 2,
      },
      {
        title: 'Click Harmonize',
        body: 'Click the Harmonize button below the ramps and choose a color theory option: complementary, analogous, triadic, etc.',
        hint: '→ find Harmonize below the ramps',
      },
      {
        title: 'Ramps harmonized',
        body: 'Unlocked ramps are rotated to color-theory positions relative to your anchor ramp.',
      },
    ],
  },
  {
    id: 'export-gpl',
    label: 'Export as .gpl',
    steps: [
      {
        title: 'Open the Export panel',
        body: 'All export controls live in the collapsible Export panel at the bottom.',
        hint: '→ click Export at the bottom',
        detector: (s) => s.exportOpen,
      },
      {
        title: 'Choose a contrast style',
        body: 'Select Punchy, Balanced, or Muted to control which shade set goes into the file.',
      },
      {
        title: 'Download the file',
        body: 'Click Download .gpl. The file works in Aseprite, Krita, GIMP, and any app that accepts GIMP palette files.',
      },
    ],
  },
  {
    id: 'wcag-compare',
    label: 'Check contrast (WCAG)',
    steps: [
      {
        title: 'Enable Compare Mode',
        body: 'Compare Mode lets you check WCAG contrast between any two swatches in your palette.',
        hint: '→ click Compare Mode',
        detector: (s) => s.compareMode,
      },
      {
        title: 'Pick two swatches',
        body: 'Click one swatch as foreground, then another as background. The WCAG panel appears top-right.',
      },
      {
        title: 'Read the result',
        body: 'The panel shows AA and AAA pass/fail for normal and large text contrast ratios.',
      },
    ],
  },
]
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npm run build
```

Expected: no errors from `src/lib/tours.ts`. If there are errors, fix before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tours.ts
git commit -m "feat: add tour step data and types"
```

---

## Task 2: Write failing e2e tests

**Files:**
- Create: `tests/e2e/onboarding.spec.ts`

- [ ] **Step 1: Create `tests/e2e/onboarding.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

// Helper: clear the tour-seen flag so every test starts fresh
async function clearTourSeen(page) {
  await page.evaluate(() => localStorage.removeItem('pixel-pal-tour-seen'))
}

test.describe('Onboarding tour', () => {
  test('auto-opens on first launch', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Panel should appear automatically (component renders "Guides", CSS uppercase is visual only)
    await expect(page.getByText('Guides')).toBeVisible({ timeout: 2000 })
    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible()
  })

  test('completes tour and sets localStorage flag', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Click through all 4 steps
    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Input modes')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Palette ramps')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page.getByText('Export')).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()

    // Panel should close and localStorage flag set
    await expect(page.getByText('Guides')).not.toBeAttached()
    const seen = await page.evaluate(() => localStorage.getItem('pixel-pal-tour-seen'))
    expect(seen).toBe('1')
  })

  test('does NOT auto-open on subsequent launches', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Set the flag directly so we simulate a returning user
    await page.evaluate(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(800) // wait longer than the 600ms delay

    await expect(page.getByText('Welcome to PIXEL.PAL')).not.toBeAttached()
  })

  test('skip closes tour and sets flag', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await clearTourSeen(page)
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Welcome to PIXEL.PAL')).toBeVisible({ timeout: 2000 })
    await page.getByRole('button', { name: 'Skip' }).click()

    await expect(page.getByText('Guides')).not.toBeAttached()
    const seen = await page.evaluate(() => localStorage.getItem('pixel-pal-tour-seen'))
    expect(seen).toBe('1')
  })
})

test.describe('"?" button and guide select', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Suppress auto-open so tests control when panel appears
    await page.evaluate(() => localStorage.setItem('pixel-pal-tour-seen', '1'))
    await page.reload()
    await page.waitForLoadState('networkidle')
  })

  test('"?" button opens guide-select panel', async ({ page }) => {
    await page.getByRole('button', { name: '?' }).click()
    await expect(page.getByText('Guides')).toBeVisible()
    await expect(page.getByText('Quick tour')).toBeVisible()
    await expect(page.getByText('Show me how to...')).toBeVisible()
  })

  test('"?" button closes open panel', async ({ page }) => {
    await page.getByRole('button', { name: '?' }).click()
    await expect(page.getByText('GUIDES')).toBeVisible()
    await page.getByRole('button', { name: '?' }).click()
    await expect(page.getByText('Guides')).not.toBeAttached()
  })

  test('all 8 task guides listed', async ({ page }) => {
    await page.getByRole('button', { name: '?' }).click()
    await expect(page.getByText('Generate from a hex color')).toBeVisible()
    await expect(page.getByText('Use AI Assist')).toBeVisible()
    await expect(page.getByText('Extract from an image')).toBeVisible()
    await expect(page.getByText('Pin a shade to a custom hex')).toBeVisible()
    await expect(page.getByText('Snap to hardware colors')).toBeVisible()
    await expect(page.getByText('Harmonize ramps')).toBeVisible()
    await expect(page.getByText('Export as .gpl')).toBeVisible()
    await expect(page.getByText('Check contrast (WCAG)')).toBeVisible()
  })

  test('task guide auto-advances when condition met', async ({ page }) => {
    // Start "hex-palette" guide. App starts on Single Color tab (mode='color')
    // so step 1 detector is already true at entry — baseline=true, won't auto-advance.
    // Step 2 detector fires when baseColors[0] !== '#ff00ff'.
    await page.getByRole('button', { name: '?' }).click()
    await page.getByText('Generate from a hex color').click()

    // Step 1: "Switch to Single Color" — already there, must click Next manually
    await expect(page.getByText('Switch to Single Color')).toBeVisible()
    await page.getByRole('button', { name: 'Next →' }).click()

    // Step 2: "Enter a hex color"
    await expect(page.getByText('Enter a hex color')).toBeVisible()

    // Type a different color to trigger detector (baseColors[0] !== '#ff00ff')
    const colorInput = page.locator('input[type="text"]').first()
    await colorInput.fill('#3b82f6')
    await colorInput.press('Enter')

    // Should auto-advance to step 3
    await expect(page.getByText('Ramps generated')).toBeVisible({ timeout: 2000 })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
npm run test:e2e -- --project=chromium tests/e2e/onboarding.spec.ts
```

Expected: ALL tests fail. Look for errors like "page.getByText('GUIDES')" timing out — the panel doesn't exist yet. If tests pass unexpectedly, something is wrong.

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/e2e/onboarding.spec.ts
git commit -m "test: add failing e2e tests for onboarding tour"
```

---

## Task 3: TourPanel component

**Files:**
- Create: `src/components/TourPanel.tsx`

- [ ] **Step 1: Create `src/components/TourPanel.tsx`**

```tsx
import { useEffect, useRef } from 'react'
import { ONBOARDING_TOUR, TASK_GUIDES, TourAppState } from '../lib/tours'
import type { TourGuide, TourStep } from '../lib/tours'

interface TourPanelProps {
  open: boolean
  onClose: () => void
  appState: TourAppState
  tourGuideId: string | null
  tourStep: number
  onSetGuide: (id: string | null) => void
  onSetStep: (step: number) => void
  onMarkSeen: () => void
}

const ALL_GUIDES: TourGuide[] = [ONBOARDING_TOUR, ...TASK_GUIDES]

export function TourPanel({
  open,
  onClose,
  appState,
  tourGuideId,
  tourStep,
  onSetGuide,
  onSetStep,
  onMarkSeen,
}: TourPanelProps) {
  // Stores the detector's return value at the moment a step is entered.
  // Auto-advance only fires on false→true transition (edge-triggered).
  const detectorBaselineRef = useRef<boolean | null>(null)

  // Reset baseline when step changes
  useEffect(() => {
    if (!tourGuideId) return
    const guide = ALL_GUIDES.find(g => g.id === tourGuideId)
    const step = guide?.steps[tourStep]
    detectorBaselineRef.current = step?.detector ? step.detector(appState) : null
    // appState intentionally omitted: baseline captures state at step-entry only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourGuideId, tourStep])

  // Auto-advance on false→true detector transition
  useEffect(() => {
    if (!open || !tourGuideId) return
    const guide = ALL_GUIDES.find(g => g.id === tourGuideId)
    if (!guide) return
    const step: TourStep | undefined = guide.steps[tourStep]
    if (!step?.detector) return
    if (detectorBaselineRef.current === null) return

    const current = step.detector(appState)
    if (detectorBaselineRef.current === false && current === true) {
      const isLast = tourStep === guide.steps.length - 1
      const timer = setTimeout(() => {
        if (isLast) {
          if (tourGuideId === 'onboarding') onMarkSeen()
          onSetGuide(null)
        } else {
          onSetStep(tourStep + 1)
        }
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [appState, open, tourGuideId, tourStep, onMarkSeen, onSetGuide, onSetStep])

  if (!open) return null

  const currentGuide = tourGuideId ? ALL_GUIDES.find(g => g.id === tourGuideId) ?? null : null
  const currentStep: TourStep | null = currentGuide?.steps[tourStep] ?? null
  const isOnboarding = tourGuideId === 'onboarding'
  const isLastStep = currentGuide ? tourStep === currentGuide.steps.length - 1 : false

  const advance = () => {
    if (!currentGuide) return
    if (isLastStep) {
      if (isOnboarding) onMarkSeen()
      onSetGuide(null)
    } else {
      onSetStep(tourStep + 1)
    }
  }

  const back = () => {
    if (tourStep > 0) onSetStep(tourStep - 1)
  }

  return (
    <div
      className="fixed left-0 top-0 h-full z-40 flex flex-col shadow-2xl"
      style={{ width: 260, background: '#1e1b4b', borderRight: '2px solid #7c3aed' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #4c1d95' }}>
        <span className="font-bold text-sm tracking-widest uppercase" style={{ color: '#c4b5fd' }}>
          Guides
        </span>
        <button
          onClick={onClose}
          title="Close guides"
          className="text-lg leading-none transition-colors"
          style={{ color: '#7c3aed' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#7c3aed')}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Guide-select mode */}
        {!tourGuideId && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { onSetGuide('onboarding'); onSetStep(0) }}
              className="text-left rounded px-3 py-2 text-sm font-medium transition-colors"
              style={{ background: '#312e81', color: '#c4b5fd' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#3730a3')}
              onMouseLeave={e => (e.currentTarget.style.background = '#312e81')}
            >
              ▶ Quick tour (4 steps)
            </button>
            <div
              className="text-xs uppercase tracking-widest mt-3 mb-1"
              style={{ color: '#6d28d9' }}
            >
              Show me how to...
            </div>
            {TASK_GUIDES.map(guide => (
              <button
                key={guide.id}
                onClick={() => { onSetGuide(guide.id); onSetStep(0) }}
                className="text-left rounded px-3 py-1.5 text-sm transition-colors"
                style={{ color: '#a78bfa' }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#fff'
                  e.currentTarget.style.background = '#312e81'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#a78bfa'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {guide.label}
              </button>
            ))}
          </div>
        )}

        {/* Tour or task-guide mode */}
        {tourGuideId && currentGuide && currentStep && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => onSetGuide(null)}
              className="text-xs text-left transition-colors"
              style={{ color: '#6d28d9' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6d28d9')}
            >
              ← All guides
            </button>
            <h3 className="font-semibold text-sm" style={{ color: '#e9d5ff' }}>
              {currentStep.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#c4b5fd' }}>
              {currentStep.body}
            </p>
            {currentStep.hint && (
              <p className="text-xs italic" style={{ color: '#7c3aed' }}>
                {currentStep.hint}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer (tour/task-guide mode only) */}
      {tourGuideId && currentGuide && (
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid #4c1d95' }}
        >
          <span className="text-xs" style={{ color: '#6d28d9' }}>
            {tourStep + 1} / {currentGuide.steps.length}
          </span>
          <div className="flex gap-2 items-center">
            {tourStep > 0 && (
              <button
                onClick={back}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: '#7c3aed' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = '#7c3aed')}
              >
                ← Back
              </button>
            )}
            <button
              onClick={advance}
              className="text-xs px-3 py-1 rounded font-medium transition-colors"
              style={{ background: '#7c3aed', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
              onMouseLeave={e => (e.currentTarget.style.background = '#7c3aed')}
            >
              {isLastStep ? (isOnboarding ? 'Done' : 'Finish') : 'Next →'}
            </button>
            {isOnboarding && !isLastStep && (
              <button
                onClick={() => { onMarkSeen(); onSetGuide(null) }}
                className="text-xs px-2 py-1 transition-colors"
                style={{ color: '#6d28d9' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6d28d9')}
              >
                Skip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npm run build
```

Expected: no errors. Fix any before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/components/TourPanel.tsx
git commit -m "feat: add TourPanel component"
```

---

## Task 4: App.tsx — state hooks and first-launch `useEffect`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add 3 tour state hooks**

Find this block in App.tsx (around line 885):
```javascript
  const [baseColors, setBaseColors] = useState(['#ff00ff']);
  const [copiedHex, setCopiedHex] = useState(null);
```

Add the three new hooks immediately before the `baseColors` line:
```javascript
  const [tourOpen, setTourOpen] = useState(false);
  const [tourGuideId, setTourGuideId] = useState(null);
  const [tourStep, setTourStep] = useState(0);
  const [baseColors, setBaseColors] = useState(['#ff00ff']);
  const [copiedHex, setCopiedHex] = useState(null);
```

- [ ] **Step 2: Add first-launch `useEffect`**

Find this block in App.tsx (around line 1625):
```javascript
  useEffect(() => {
    loadAIConfigAsync().then(({ config }) => {
      setAiConfigured(config !== null);
    });
  }, []);
```

Add the tour `useEffect` immediately after that block:
```javascript
  useEffect(() => {
    loadAIConfigAsync().then(({ config }) => {
      setAiConfigured(config !== null);
    });
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('pixel-pal-tour-seen')) {
      setTimeout(() => {
        setTourOpen(true);
        setTourGuideId('onboarding');
        setTourStep(0);
      }, 600);
    }
  }, []);
```

- [ ] **Step 3: Add `onMarkSeen` handler**

Find the `handleAISettingsClose` function (around line 1636):
```javascript
  function handleAISettingsClose() {
    setShowAISettings(false);
    setAiConfigured(getCachedAIConfig() !== null);
  }
```

Add `handleTourMarkSeen` immediately after it:
```javascript
  function handleAISettingsClose() {
    setShowAISettings(false);
    setAiConfigured(getCachedAIConfig() !== null);
  }

  function handleTourMarkSeen() {
    localStorage.setItem('pixel-pal-tour-seen', '1');
  }
```

- [ ] **Step 4: Add the import for TourPanel at the top of App.tsx**

Find the existing import line (line 15):
```javascript
import { AISettingsPanel } from './settings/AISettingsPanel';
```

Add TourPanel import on the next line:
```javascript
import { AISettingsPanel } from './settings/AISettingsPanel';
import { TourPanel } from './components/TourPanel';
```

- [ ] **Step 5: Verify TypeScript compiles**

```powershell
npm run build
```

Expected: no errors. Fix any before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add tour state hooks and first-launch detection"
```

---

## Task 5: App.tsx — "?" button and TourPanel render

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add "?" button to the header**

Find this block in App.tsx (around line 5310):
```javascript
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-6 relative">
          <h1 className="text-5xl font-bold mb-2" style={{ color: t.titleColor, textShadow: t.titleGlow, letterSpacing: '0.15em' }}>PIXEL.PAL</h1>
```

The `<div className="text-center mb-6 relative">` already has `relative` positioning. Add the "?" button as an absolutely-positioned element inside it, before the `<h1>`:

```javascript
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-6 relative">
          <div className="absolute top-0 left-0 z-20">
            <button
              onClick={() => {
                if (tourOpen) {
                  setTourOpen(false);
                } else {
                  setTourOpen(true);
                  setTourGuideId(null);
                  setTourStep(0);
                }
              }}
              title="Open guides"
              className={`px-3 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}
            >?</button>
          </div>
          <h1 className="text-5xl font-bold mb-2" style={{ color: t.titleColor, textShadow: t.titleGlow, letterSpacing: '0.15em' }}>PIXEL.PAL</h1>
```

- [ ] **Step 2: Render TourPanel alongside AISettingsPanel**

Find this block at the very end of the return statement (line 7336):
```javascript
      {showAISettings && <AISettingsPanel onClose={handleAISettingsClose} />}
    </div>
  );
```

Add `<TourPanel />` after AISettingsPanel:
```javascript
      {showAISettings && <AISettingsPanel onClose={handleAISettingsClose} />}
      <TourPanel
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        appState={{
          mode,
          showAISettings,
          imageDataUrl,
          exportOpen,
          compareMode,
          hwPickerOpen,
          aiLoading,
          baseColors,
        }}
        tourGuideId={tourGuideId}
        tourStep={tourStep}
        onSetGuide={(id) => { setTourGuideId(id); setTourStep(0); }}
        onSetStep={setTourStep}
        onMarkSeen={handleTourMarkSeen}
      />
    </div>
  );
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
npm run build
```

Expected: no errors. Fix any before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire TourPanel into app — ? button and render"
```

---

## Task 6: Run e2e tests and fix failures

**Files:**
- May modify: `src/components/TourPanel.tsx`, `src/App.tsx`

- [ ] **Step 1: Start the dev server**

```powershell
npm run electron:dev
```

Leave this running in a separate terminal.

- [ ] **Step 2: Run the full onboarding test suite**

In a second terminal:
```powershell
npm run test:e2e -- --project=chromium tests/e2e/onboarding.spec.ts
```

Expected: all 8 tests pass. If any fail, read the error output carefully.

**Common failure patterns and fixes:**

- `getByRole('button', { name: '?' })` not found: verify the "?" button has text content `?` (not `? ` with extra whitespace)
- `getByText('Guides')` not found: Tailwind `uppercase` is a CSS visual transform only; DOM text is `Guides`, not `GUIDES`. Tests already account for this.
- Auto-advance test flaky: the 400ms delay + test assertion timing can conflict. If the `Ramps generated` assertion times out, increase its timeout to `{ timeout: 3000 }`
- `toBeAttached()` vs `not.toBeAttached()`: use `not.toBeAttached()` for elements that are removed from DOM (panel hidden via `if (!open) return null`), not `not.toBeVisible()`

- [ ] **Step 3: Commit passing tests**

```bash
git add src/components/TourPanel.tsx src/App.tsx tests/e2e/onboarding.spec.ts
git commit -m "test: all onboarding e2e tests passing"
```

---

## Task 7: Run full test suite and check for regressions

- [ ] **Step 1: Run all JS unit tests**

```powershell
foreach ($f in Get-ChildItem tests\test_*.js) { node $f }
```

Expected: all pass. The new files don't touch `pixel-pal.tsx` or `color.ts`, so no regressions expected.

- [ ] **Step 2: Run full Playwright suite**

```powershell
npm run test:e2e -- --project=chromium
```

Expected: all existing tests still pass. If `app.spec.ts` fails with "auto-open blocked content", ensure the `tours.ts` guard condition `!localStorage.getItem('pixel-pal-tour-seen')` works correctly in the test environment (localStorage is fresh per test in Playwright's default isolation).

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "feat: onboarding tour and interactive guides complete"
```

---

## Notes

- **CVD selector** lives at `fixed top-4 right-4` (not left). The "?" button is `absolute top-0 left-0` inside the header's `relative` container — no collision.
- **localStorage isolation**: Playwright tests get fresh localStorage per test by default. The `clearTourSeen` helper is a belt-and-suspenders guard; existing tests in `app.spec.ts` are unaffected because they don't interact with tour state.
- **Theme compatibility**: TourPanel uses inline styles and Tailwind with hardcoded purple values. It renders as a fixed overlay and is visually distinct in all three themes (Dark/Neutral/Light).
- **`// @ts-nocheck` in App.tsx**: TypeScript errors in App.tsx are suppressed. The `TourPanel` import and usage don't need explicit types there. TourPanel.tsx itself is fully typed.
