# PIXEL.PAL

Color palette generator for pixel art. Takes a base color, text description, or image and produces sorted color ramps in three contrast styles: Punchy, Balanced, and Muted.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

- Color ramps of 4-8 shades with pixel-art-canonical slot labels
- Three contrast styles per ramp: Punchy, Balanced, Muted
- Hue shifting built in (shadows lean cool, highlights lean warm)
- Per-ramp HSV controls, saturation multiplier, shade pins and locks
- Color harmony tools (complementary, analogous, triadic, and more)
- Hardware palette constraints: NES, Game Boy DMG, CGA 16, EGA 64, C64
- Sprite previews on 32x32 built-in sprites; import custom sprites from Piskel
- WCAG contrast checking and color vision deficiency simulation
- Side-by-side palette comparison
- Mosaic, lightness distribution, and chromatic plot visualizations
- Import/export: plain text and GIMP `.gpl` (compatible with Aseprite, Krita, Piskel)
- Undo/redo history (last 20 states), local palette storage
- Three themes: Dark, Neutral, Light

## Getting Started

### Prerequisites

- Node.js 18+

### Install & Run

```bash
git clone https://github.com/tito13kfm/pixel-pal-app.git
cd pixel-pal-app
npm install

# Desktop app
npm run electron:dev

# Browser only
npm run dev
```

### Build

```bash
npm run build    # type-check + web build
npm run dist     # packaged desktop release, output to release/
```

## Input Modes

**Single Color:** Pick or type a hex, or roll random. Ramps generate around it.

**From Image:** Upload, paste, or drag-and-drop. Extracts 3-6 dominant colors. Eyedropper lets you click individual pixels with up to 8x zoom.

**AI Assist:** Type a description and the app sends it to a language model for color extraction. Requires an API key (your own, never leaves your machine). Supported providers: OpenAI, Anthropic, Google Gemini, Mistral, xAI Grok, DeepSeek, Ollama, and any OpenAI-compatible endpoint. Configure in Settings on first launch.

## What This Is Not

- Not a pixel art editor. Use Aseprite, Piskel, or Pixelorama for painting.
- Not a cloud service. Palettes save to local browser storage, no account required.
- Not a hardware accuracy tool for emulation. Hardware palettes are artist references, not bit-exact captures.

## License

MIT
