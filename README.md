# PIXEL.PAL

**A palette studio for pixel artists: build the whole palette before you open the canvas, then hand it off to the editor you already paint in.**

Start from a hex color, an image, or a text prompt. Get labeled shade ramps in three contrast styles, bend them with curve editors and per-shade pins, lock them to real hardware (NES, Game Boy, CGA, EGA, C64), and check them for WCAG contrast and color-blindness, then export a GIMP `.gpl` or PNG strip that Aseprite, Pixelorama, GrafX2, GIMP, and Krita read directly.

It runs on a perceptual OKLCH engine, so shading *starts* visually even and the cool-shadow / warm-highlight shift is a dial you set on purpose, not a side effect of the math you have to fight. That's the floor, not the pitch. The point is everything you do to a palette in one place before a single pixel is painted.

![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Windows%20%7C%20macOS%20%7C%20Linux-blue)
![License](https://img.shields.io/badge/license-MIT-green)

![PIXEL.PAL screenshot](media/screenshot-main.png)

## Try It In Your Browser

No install, no download: **[tito13kfm.github.io/pixel-pal-app](https://tito13kfm.github.io/pixel-pal-app/)**

The web version is feature-complete for everything except a few desktop-only conveniences (see [Web vs Desktop](#web-vs-desktop) below). Open the link, paste a hex color or an image, generate ramps, export `.txt` or `.gpl`. Your palettes save to browser local storage, so they persist across visits on the same browser profile.

The hosted build is rebuilt and deployed on every tagged release.

## Download (Desktop)

Pre-built installers for Windows, macOS, and Linux are on the [Releases page](https://github.com/tito13kfm/pixel-pal-app/releases). A standalone portable Windows `.exe` (no installer, no auto-update) ships in each release as `PIXEL.PAL_<version>_x64-portable.exe`.

The desktop build adds native Save As dialogs and in-app auto-update.

## Features

**Input**
- Single hex color: type, pick, or roll random
- Image upload, paste, or drag-and-drop: extracts 3-6 dominant colors; eyedropper with up to 8x zoom lets you click individual pixels
- Example ramps inspired from classic palettes: DawnBringer 16, PICO-8, Sweetie 16, Game Boy, NES Super Mario Bros, EDG32, CGA, and more.
  - (These are to emulate a feel of the palette, not full palettes.  Intentional design choice, trust me you dont't want 12000+ color swatches showing at once)
- Import GIMP .gpl files
- Lospec palette browser: search or browse the Lospec catalog by tag, color count, and name, then load a result straight into a new set of ramps. Browsing/filtering uses the app's built-in API key; loading by slug/URL and searching by name work with no key at all. You can also paste your own free Lospec API key into the panel's settings to use your own rate-limit budget instead of the shared one. Every result shows title, author, and a link back to its Lospec page, and that provenance is kept when you save the palette.

**Output**
- 4-8 shade ramps with pixel-art slot labels (outline, shadow, base, highlight, bright)
- Three contrast styles per ramp: Punchy, Balanced, Muted
- Perceptual OKLCH engine: lightness-uniform shading, predictable contrast
- Even shade distribution: light and dark base colors get a balanced spread of
  shadows and highlights instead of bunching toward one end of the ramp
- Hue shift built in: shadows lean cool, highlights lean warm; strength is adjustable

**Per-ramp controls**
- H/S/V sliders adjust the base color, then the engine derives shades from there
- Saturation multiplier
- Per-shade count override
- Pin individual shades to a fixed hex across all three styles
- Right-click a shade to hide it across all three styles
- Lock ramp from global operations
- Drag a ramp by its grip to reorder it; the new order propagates everywhere ramps are used in order: the ramp grid, Mosaic, Adjacency, Dither, and every export. All per-ramp settings (pins, sizes, locks, curves, gamut, and more) move with the ramp
- **Advanced disclosure** (closed by default): interactive lightness curve editor and saturation curve editor (drag anchors, click to add, preset chips for one-click shapes), plus gamut strategy (auto / clip / chroma-preserve)

**Global tools**
- Harmonize: rotate unlocked ramps to color-theory positions relative to an anchor ramp
- Color harmony derivation: complementary, analogous, triadic, split-complementary, tetradic, square
- Hardware Lock: snap all shades to the nearest legal color (perceptual ΔE_OK distance) for NES, Game Boy DMG, CGA 16, EGA 64, or C64
- Base-color dock: a floating, draggable panel listing your base colors, delete any one (or jump to its ramp) from anywhere on the page; collapsible, and it reshapes into a grid for large palettes

**Image tools**
- Remap any uploaded image to your active palette, with optional error-diffusion dithering (Floyd-Steinberg, Atkinson, or Stucki)
- Side-by-side view of original vs. palette-remapped image; the preview scales with the selected export scale so you can judge the remapped pixels before downloading
- Export the remapped image at multiple scale options

**Views**
- Mosaic preview (export to PNG)
- Lightness distribution strip: colors placed on a 0→100 lightness axis so gaps in tonal coverage are visible (export to PNG)
- Chromatic polar plot
- Adjacency matrix: every color paired with every other, with an optional ΔE_OK heatmap that surfaces clashes and near-duplicate colors (export to PNG)
- Dither-blend preview: ordered-dither mix of ramp shades, the optical "in-between" shade you get when dithering at sprite scale. Pick a pattern (2×2 / 4×4 / 8×8 Bayer, clustered-dot, scanline, cross-hatch), zoom 1×/2×/4×, or switch to a cross-ramp grid that dithers every ramp's base against every other (export to PNG)
- Sprite previews on 4 built-in 32x32 sprites; import custom sprites from Piskel
- Side-by-side palette comparison

**Accessibility**
- WCAG contrast check with Compare Mode: click any two swatches to see their contrast ratio
- Color vision deficiency simulation: protanopia, deuteranopia, tritanopia

**State and export**
- Up to 100 saved palettes in local storage
- 50-entry session history with undo, redo, and direct jump to any point
- Three themes: Dark, Neutral, Light (persists across sessions)
- Customizable layout: drag the main section cards (Color Ramps, Harmony, Playground, Visualize, Saved, History, Export) by their grips to reorder them; the arrangement persists, and a Reset Layout button restores defaults
- Auto-updates: desktop checks for new releases and prompts you to install; web reflects the latest deploy on refresh
- Export: a format dropdown covers GIMP `.gpl` (Aseprite/GIMP/Krita/Piskel), JASC `.pal` (GrafX2/Paint Shop Pro), Adobe Swatch Exchange `.ase`, a PNG palette strip (drag onto any editor's canvas and eyedrop), and plain `.txt`, each in the Punchy/Balanced/Muted style you select. Desktop adds "Reveal in folder" after a save. Separate one-click PNG export of the Mosaic, Lightness Distribution, Adjacency Matrix, and Dither-Blend views remains (from the view itself or the export panel).
  - **Note:** Adobe `.ase` targets Photoshop / Illustrator / Krita, **not** Aseprite. Despite the shared extension, Aseprite's `.ase`/`.aseprite` are sprite files; Aseprite imports palettes as `.gpl`, `.pal`, or PNG. Pick one of those for Aseprite.

## Getting Started

### Prerequisites

For running a downloaded release: nothing extra on Windows or macOS. Linux requires runtime libraries (see Linux section below).

For building from source:
- Node.js 20+
- Rust (stable) from [rustup.rs](https://rustup.rs)
- macOS: Xcode Command Line Tools (`xcode-select --install`)

### Install and Run from Source

```bash
git clone https://github.com/tito13kfm/pixel-pal-app.git
cd pixel-pal-app
npm install

# Desktop app
npm run tauri:dev

# Browser dev server (plain browser, no Tauri)
npm run dev
```

### Build

```bash
npm run build         # type-check + Tauri-targeted web assets (base './')
npm run build:web     # static build for GH Pages hosting (base '/pixel-pal-app/')
npm run dist          # packaged desktop installer, output to src-tauri/target/release/bundle/
```

## Environment Variables

- `VITE_LOSPEC_API_KEY`: enables browsing/filtering the Lospec catalog by tag and
  color count in the Lospec palette browser. Optional: without it, the browse/filter
  view is unavailable, but loading a palette by slug/URL and searching by name still
  work through Lospec's public endpoints. This key isn't a secret in the traditional
  sense once it ships in a built app; it just identifies PIXEL.PAL to Lospec's
  rate limiter. It's still supplied via a local `.env` file (never committed) for
  source builds and a GitHub Actions secret for CI/release builds.

  Separately, any user can paste their own free Lospec API key into the panel's
  settings field, no build or env change needed. That key is stored locally
  (`window.storage`, key `lospec:userApiKey`) and takes precedence over the
  built-in one, so it never needs to be set as an environment variable.

## Web vs Desktop

| Feature | Web | Desktop |
| --- | --- | --- |
| Generate ramps, edit, save palettes | yes | yes |
| Export `.txt` / `.gpl` | yes (anchor download to Downloads folder) | yes (native Save As, remembers folder per file type) |
| Auto-update | automatic on page refresh (always the latest deploy) | in-app update prompt |
| Offline use | no | yes (once installed) |
| Install required | no | yes |

## What This Is Not

- Not a pixel art editor. Use Aseprite, Piskel, or Pixelorama for painting.
- Not a cloud service. Palettes save to local storage, no account required.
- Not a hardware accuracy tool for emulation. Hardware palettes are artist references, not bit-exact captures.

## Linux Requirements

For the pre-built release, install these runtime libraries:

```bash
sudo apt-get install libwebkit2gtk-4.1-0
```

For building from source, you need the development packages:

```bash
sudo apt-get install libwebkit2gtk-4.1-dev librsvg2-dev patchelf
```

For non-Debian/Ubuntu distributions, install the equivalent package: WebKit2GTK 4.1 runtime (and its -dev variant for building).

## Windows Notes

Windows 11 and most Windows 10 installations include WebView2 (required by Tauri). If the app fails to launch on Windows 10, install the [WebView2 runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) from Microsoft.

## AI Assistance

This project was built with AI coding assistance. AI was used for code generation, refactoring, testing, and debugging throughout development.

All artwork in project is human created by me, except that one diamond sprite.  I borrowed that from Stardew Valley.  I hope Concerned Ape doesn't mind.

## License

MIT
