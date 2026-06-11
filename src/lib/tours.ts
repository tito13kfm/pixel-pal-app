export interface TourAppState {
  mode: string
  imageDataUrl: string | null
  exportOpen: boolean
  compareMode: boolean
  hwPickerOpen: boolean
  baseColors: string[]
  harmonized: boolean
}

export interface TourStep {
  title: string
  body: string
  hint?: string
  target?: string
  setup?: string
  advance?: 'next' | 'detector'
  detector?: (s: TourAppState) => boolean
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
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
      advance: 'next',
      placement: 'bottom',
    },
    {
      title: 'Input modes',
      body: 'Single Color: type or pick a hex. From Image: drag, paste, or open a photo.',
      target: 'mode-tabs',
      advance: 'next',
      placement: 'bottom',
    },
    {
      title: 'Palette ramps',
      body: 'Generate a palette to see ramps here. Each ramp shows 4-8 shades, rendered in your choice of three contrast styles (Punchy, Balanced, Muted).',
      target: 'ramp-area',
      advance: 'next',
      placement: 'auto',
    },
    {
      title: 'Export',
      body: 'Click the Export & Tools header to expand it. Pick an export format from the dropdown: .gpl, .pal, Adobe .ase, a PNG strip, or .txt, then Download.',
      target: 'export-header',
      advance: 'next',
      placement: 'auto',
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
        target: 'mode-single',
        advance: 'detector',
        detector: (s) => s.mode === 'color',
        placement: 'bottom',
      },
      {
        title: 'Enter a hex color',
        body: 'Type a hex color or use the color picker. Then continue.',
        hint: 'e.g. #3b82f6',
        target: 'hex-input',
        advance: 'next',
        placement: 'bottom',
      },
      {
        title: 'Generate the ramps',
        body: 'Click New palette to build ramps from your color.',
        hint: '→ click New palette',
        target: 'new-palette-btn',
        advance: 'next',
        placement: 'bottom',
      },
      {
        title: 'Tune the ramp',
        body: 'Your ramps appear here. Click the sliders icon (Edit base color) at a ramp card\'s top-right to open its editor: Hue, Sat, and Value sliders, a Shades count, and an Advanced disclosure with lightness/saturation curves, a gamut strategy, and a hue-shift control.',
        target: 'ramp-area',
        advance: 'next',
        placement: 'auto',
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
        target: 'mode-image',
        advance: 'detector',
        detector: (s) => s.mode === 'image',
        placement: 'bottom',
      },
      {
        title: 'Load an image',
        body: 'Drag an image onto the drop zone, paste with Ctrl+V, or click to open the file picker.',
        target: 'image-dropzone',
        advance: 'detector',
        detector: (s) => s.imageDataUrl !== null,
        placement: 'auto',
      },
      {
        title: 'Colors extracted',
        body: 'Ramps built from dominant colors. Use the eyedropper to manually pick specific colors.',
        advance: 'next',
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
        target: 'ramp-area',
        advance: 'detector',
        detector: (s) => s.baseColors[0] !== '#ff00ff' || s.imageDataUrl !== null,
        placement: 'auto',
      },
      {
        title: 'Reveal a shade\'s pin',
        body: 'Hover any shade swatch (except the base) to reveal its pushpin icon, then click it to pin that shade. The pin editor opens inline.',
        hint: '→ hover a swatch, then click its pushpin',
        target: 'ramp-area',
        advance: 'next',
        placement: 'auto',
      },
      {
        title: 'Set the target hex',
        body: 'Type a hex color in the pin editor. That shade stays fixed when you adjust the ramp or change styles.',
        advance: 'next',
      },
    ],
  },
  {
    id: 'hardware-lock',
    label: 'Snap to hardware colors',
    steps: [
      {
        title: 'Open the Export panel',
        body: 'Hardware Lock lives in the Export & Tools panel. Open it to continue.',
        hint: '→ click Export & Tools',
        target: 'export-header',
        advance: 'detector',
        detector: (s) => s.exportOpen,
        placement: 'bottom',
      },
      {
        title: 'Open the hardware picker',
        body: 'Click Hardware Lock to reveal the console palettes: NES, Game Boy, CGA 16, EGA 64, C64.',
        hint: '→ click Hardware Lock',
        target: 'hardware-lock-btn',
        setup: 'export',
        advance: 'detector',
        detector: (s) => s.hwPickerOpen,
        placement: 'bottom',
      },
      {
        title: 'Pick a platform',
        body: 'Choose a console (NES, Game Boy, CGA 16, EGA 64, or C64) to snap every unlocked shade to that hardware\'s nearest legal color.',
        advance: 'next',
      },
    ],
  },
  {
    id: 'harmonize',
    label: 'Harmonize ramps',
    steps: [
      {
        title: 'Switch to Single Color',
        body: 'Harmonize works on hex-based ramps. Switch to Single Color mode first.',
        hint: '→ click Single Color',
        target: 'mode-single',
        advance: 'detector',
        detector: (s) => s.mode === 'color',
        placement: 'bottom',
      },
      {
        title: 'Add a second ramp',
        body: 'Harmonize needs at least two ramps. Click the Complementary swatch in Harmony Colors to add it as a second base.',
        hint: '→ click the Complementary swatch',
        target: 'harmony-complementary-swatch',
        setup: 'harmony',
        advance: 'detector',
        detector: (s) => s.baseColors.length >= 2,
        placement: 'auto',
      },
      {
        title: 'Click Harmonize',
        body: 'In the Harmony Colors section, click Harmonize. It rotates unlocked ramps to color-theory positions relative to your anchor: complement, analogous, triadic, and more.',
        hint: '→ click Harmonize',
        target: 'harmonize-btn',
        setup: 'harmony',
        advance: 'detector',
        detector: (s) => s.harmonized,
        placement: 'auto',
      },
      {
        title: 'Ramps harmonized',
        body: 'Unlocked ramps are rotated to color-theory positions relative to your anchor ramp.',
        advance: 'next',
      },
    ],
  },
  {
    id: 'export-gpl',
    label: 'Export your palette',
    steps: [
      {
        title: 'Open the Export panel',
        body: 'All export controls live in the collapsible Export & Tools panel. Open it to continue.',
        hint: '→ click Export & Tools',
        target: 'export-header',
        advance: 'detector',
        detector: (s) => s.exportOpen,
        placement: 'bottom',
      },
      {
        title: 'Choose a contrast style',
        body: 'Select Punchy, Balanced, or Muted to control which shade set goes into the file.',
        target: 'export-panel',
        setup: 'export',
        advance: 'next',
        placement: 'auto',
      },
      {
        title: 'Pick a format and download',
        body: 'Choose a format in the dropdown: .gpl (Aseprite/GIMP/Krita), .pal (GrafX2), Adobe .ase, a PNG strip for any eyedropper, or plain .txt, then click Download. Note: Adobe .ase is for Photoshop/Illustrator/Krita, not Aseprite; Aseprite users want .gpl, .pal, or the PNG strip.',
        target: 'gpl-export-btn',
        setup: 'export',
        advance: 'next',
        placement: 'auto',
      },
    ],
  },
  {
    id: 'wcag-compare',
    label: 'Check contrast (WCAG)',
    steps: [
      {
        title: 'Open the Export panel',
        body: 'WCAG Check lives in the Export & Tools panel. Open it to continue.',
        hint: '→ click Export & Tools',
        target: 'export-header',
        advance: 'detector',
        detector: (s) => s.exportOpen,
        placement: 'bottom',
      },
      {
        title: 'Enable WCAG Check',
        body: 'Click WCAG Check to enter pick-two mode. It compares contrast between any two ramp swatches.',
        hint: '→ click WCAG Check',
        target: 'wcag-check-btn',
        setup: 'export',
        advance: 'detector',
        detector: (s) => s.compareMode,
        placement: 'auto',
      },
      {
        title: 'Pick two swatches',
        body: 'Click any ramp swatch to set the anchor color, then click a second swatch to compute the contrast ratio. The WCAG Contrast panel appears top-right.',
        target: 'ramp-area',
        advance: 'next',
        placement: 'auto',
      },
      {
        title: 'Read the result',
        body: 'The panel shows AA and AAA pass/fail for normal and large text contrast ratios.',
        advance: 'next',
      },
    ],
  },
]

export function effectiveAdvance(step: TourStep): 'next' | 'detector' {
  if (step.advance) return step.advance
  return step.detector ? 'detector' : 'next'
}
