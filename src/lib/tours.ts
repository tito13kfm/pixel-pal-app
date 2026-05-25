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
  target?: string
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
      body: 'Pixel-art palette generator. Pick an input mode to get started.',
      target: 'mode-tabs',
    },
    {
      title: 'Input modes',
      body: 'Three ways in: type a hex color, describe a palette with AI, or extract colors from an image.',
      target: 'mode-tabs',
    },
    {
      title: 'Palette ramps',
      body: 'Generate a palette to see ramps here. Each ramp shows 4-8 shades in 3 contrast styles.',
      target: 'ramp-area',
    },
    {
      title: 'Export',
      body: 'Click Export at the bottom to open the export panel. Download as .txt or .gpl for Aseprite, Piskel, GIMP, and Krita.',
      target: 'export-panel',
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
