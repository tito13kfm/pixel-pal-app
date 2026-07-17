export interface TourAppState {
  mode: string
  imageDataUrl: string | null
  exportOpen: boolean
  compareMode: boolean
  hwPickerOpen: boolean
  baseColors: string[]
  harmonized: boolean
  savedOpen: boolean
  savedCount: number
  sbsOpen: boolean
  cvdMode: string
  hiddenCount: number
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
      body: 'Generate a palette to see ramps here. Each ramp shows 2-64 shades, rendered in your choice of three contrast styles (Punchy, Balanced, Muted, all fully editable).',
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
    id: 'hide-shade',
    label: 'Hide a shade',
    steps: [
      {
        title: 'Right-click a swatch',
        body: 'Right-click (or long-press on touch) any shade swatch to hide that shade across all 3 styles for that base. The last visible shade in a ramp cannot be hidden.',
        hint: '→ right-click any shade swatch',
        target: 'ramp-area',
        advance: 'detector',
        detector: (s) => s.hiddenCount > 0,
        placement: 'auto',
      },
      {
        title: 'Hidden everywhere it matters',
        body: 'Hidden shades are excluded from .gpl and .txt exports and from every visualization, so what you see is what you ship.',
        advance: 'next',
      },
      {
        title: 'Restore hidden shades',
        body: 'A yellow Restore button appears on a ramp card whenever it has hidden shades. Click it to bring them all back.',
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
    id: 'save-palette',
    label: 'Save & load palettes',
    steps: [
      {
        title: 'Open Saved Palettes',
        body: 'The Saved Palettes section stores up to 100 palettes locally on this device. Open it to continue.',
        hint: '→ click Saved Palettes',
        target: 'saved-header',
        advance: 'detector',
        detector: (s) => s.savedOpen,
        placement: 'bottom',
      },
      {
        title: 'Name and save',
        body: 'Type a name and click Save Current. Saved palettes persist across sessions in this browser.',
        hint: '→ click Save Current',
        target: 'save-controls',
        setup: 'saved',
        advance: 'detector',
        detector: (s) => s.savedCount > 0,
        placement: 'auto',
      },
      {
        title: 'Load it back',
        body: 'Click any saved palette to load it, replacing the current one. Use the pencil and trash icons to rename or delete, and the classic loader below the list for the "inspired by" presets (DB16, PICO-8, Game Boy, and more).',
        advance: 'next',
      },
    ],
  },
  {
    id: 'side-by-side',
    label: 'Compare side-by-side',
    steps: [
      {
        title: 'Open Visualize & Compare',
        body: 'All comparison views live in the Visualize & Compare section. Open it to continue.',
        hint: '→ click Visualize & Compare',
        target: 'viz-header',
        advance: 'detector',
        detector: (s) => s.sbsOpen,
        placement: 'bottom',
      },
      {
        title: 'Fill Slot B',
        body: 'Slot A holds the palette being visualized (your working palette by default). Pick a second palette in the Slot B dropdown, saved or classic, to switch every view into two-column compare mode.',
        target: 'sbs-right-select',
        setup: 'viz',
        advance: 'next',
        placement: 'auto',
      },
      {
        title: 'Read the views',
        body: 'The Chromatic Plot shows hue and saturation spread, the Lightness Distribution reveals missing tonal ranges, and the Mosaic lines up raw swatches. Clear Slot B to return to single-column view.',
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
  {
    id: 'cvd-sim',
    label: 'Simulate colorblindness',
    steps: [
      {
        title: 'Pick a simulation',
        body: 'The buttons under the header simulate color vision deficiency: Pro (protanopia, red-blind), Deu (deuteranopia, green-blind), Tri (tritanopia, blue-blind). Click one to filter the whole palette view.',
        hint: '→ click Pro, Deu, or Tri',
        target: 'cvd-buttons',
        advance: 'detector',
        detector: (s) => s.cvdMode !== 'none',
        placement: 'bottom',
      },
      {
        title: 'Check and iterate',
        body: 'The simulation is display-only: hex values and exports are unaffected. If two swatches become hard to tell apart, push their lightness or hue further apart. The eye button returns to normal vision.',
        advance: 'next',
      },
    ],
  },
]

export function effectiveAdvance(step: TourStep): 'next' | 'detector' {
  if (step.advance) return step.advance
  return step.detector ? 'detector' : 'next'
}
