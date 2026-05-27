﻿// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Copy, Shuffle, Palette, Sparkles, Download, Sun, Wand2, Upload, Image as ImageIcon, Dice5, Pipette, Monitor, MonitorOff, ChevronDown, ChevronUp, BarChart3, Save, Trash2, FolderOpen, Sliders, Pin, Moon, Contrast, Cpu, Eye, Plus, Columns, Lock, Unlock, History, RotateCcw, Edit2, Check, X, CopyPlus } from 'lucide-react';
import {
  hexToHsl, hslToHex, hexToRgb, rgbToHex,
  rgbToHsl, hslToRgb, hexToHsv, hsvToHex, hsvToRgb,
} from './lib/color';
import { generateRamp as generateRampNew } from './lib/ramp-engine';
import { hexToOklch, deltaEOK } from './lib/oklch';
import { saveFile } from './lib/save-file';
import {
  WORD_POOL, spriteVase, spriteWalkman, spriteCassette,
  spriteDiamond, DEFAULT_SPRITE_LIBRARY, CLASSIC_PALETTES,
  HARDWARE_PALETTES,
} from './lib/constants';
import { getCachedAIConfig, loadAIConfigAsync, createAIClient, generatePaletteFromPrompt } from './lib/ai';
import { AISettingsPanel } from './settings/AISettingsPanel';
import { TourPanel } from './components/TourPanel'
import { RampAdvancedPanel } from './components/RampAdvancedPanel';
import type { CurvePresetSerialized, GamutStrategySerialized } from './lib/palette';
import { ONBOARDING_TOUR, TASK_GUIDES } from './lib/tours';
import type { UpdateInfo } from './lib/tauri-bridge';

// ---------- window.storage shim ----------
// The original artifact used a custom async window.storage key-value API.
// We adapt it to localStorage at module load so existing call sites keep
// working unchanged. Returns Promises so `await` still parses correctly.
if (typeof window !== 'undefined' && !(window as any).storage) {
  (window as any).storage = {
    get: async (key) => {
      const v = localStorage.getItem(key);
      return v == null ? null : { value: v };
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
      return { ok: true };
    },
    delete: async (key) => {
      localStorage.removeItem(key);
      return { ok: true };
    },
    list: async (prefix) => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      return { keys };
    },
  };
}

// ---------- Color utilities (kept inline: WCAG helpers not extracted to lib) ----------

// WCAG 2.1 relative luminance per
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
const wcagRelativeLuminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

// WCAG 2.1 contrast ratio per
// https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
// Returns a number in [1, 21]. Order of arguments does not matter.
const wcagContrast = (hex1, hex2) => {
  const L1 = wcagRelativeLuminance(hex1);
  const L2 = wcagRelativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
};

// AA-tier classification for a contrast ratio. Returns the strongest tier
// the ratio satisfies, or 'fail' if it doesn't meet UI minimum.
// Thresholds from WCAG 2.1 AA:
//   - 4.5:1 for normal text (1.5.3.1)
//   - 3.0:1 for large text (>=18pt, or >=14pt bold) AND non-text UI (1.4.11)
const wcagAaTier = (ratio) => {
  if (ratio >= 4.5) return 'AA';            // normal text passes
  if (ratio >= 3.0) return 'AA Large';      // large text + UI components pass
  return 'fail';                            // below UI minimum
};

// rgbToHex, rgbToHsl, hslToRgb, hexToHsl, hslToHex: imported from ./lib/color

// HSV conversion helpers. We use HSV (also called HSB) for the base-color
// editor because it matches the mental model used by pixel art tools like
// Aseprite. Note: HSV's V (value) goes from black at V=0 to a pure saturated
// color at V=100, but reaches white only when S is also 0. This differs from
// HSL where L=100 is always white regardless of S.
// rgbToHsv, hsvToRgb, hexToHsv, hsvToHex, getShadowHueShift,
// getHighlightHueShift, seededRandom, generateRamp:
// imported from ./lib/color (original definitions removed).

// ---------- Image color extraction ----------
const extractDominantColors = (imageData, targetCount = 4) => {
  const data = imageData.data;
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const hex = rgbToHex(r, g, b);
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const result = [];
  for (const hex of sorted) {
    const hsl = hexToHsl(hex);
    const isDupe = result.some(existing => {
      const e = hexToHsl(existing);
      const hueDist = Math.min(Math.abs(hsl.h - e.h), 360 - Math.abs(hsl.h - e.h));
      return hueDist < 30 && Math.abs(hsl.l - e.l) < 25;
    });
    if (!isDupe) result.push(hex);
    if (result.length >= targetCount) break;
  }
  return result;
};

// Sprites, DEFAULT_SPRITE_LIBRARY, CLASSIC_PALETTES, HARDWARE_PALETTES:
// imported from ./lib/constants (original definitions removed).


// quantizeToPalette: given a target hex and an array of palette hex strings,
// find the nearest palette color using a weighted HSL distance.
//
// Weights (tuned via testing against the NES, C64, Game Boy, CGA, and EGA
// palettes):
//   hue:        2.0x  (dominant perceptual signal when colors are saturated)
//   saturation: 0.5x  (matters for tie-breaking but should not override hue)
//   lightness:  1.5x  (lightness drift is perceptually obvious at any sat)
//
// Hue weight fades to zero as the SMALLER of (target, candidate) saturation
// approaches zero. This protects two cases:
//   1. A gray input must not be pulled into a hue family (hue is meaningless
//      at S=0; any candidate hue would be an arbitrary pick).
//   2. A saturated input must not snap to a gray candidate just because the
//      gray happens to have a nominal hue close to the input's.
// The fade ramps linearly from 0 at S=0 to full weight at S>=15. The S=15
// threshold was picked because below ~S=15 colors read as "tinted gray"
// rather than as a named hue.
//
// Earlier versions used hueWeight = min(target.s, candidate.s) / 100 with no
// upper cap. That under-weighted hue across the entire saturated range,
// causing severe mismatches (e.g. a warm brown at H=20 would snap to a
// royal purple at H=251 because the saturation similarity was 'closer'
// than the orange's saturation gap). The new formulation caps the fade
// at S=15 so hue gets full weight wherever color is visually perceived.
//
// Returns the nearest hex from paletteColors. Returns the input hex
// unchanged if paletteColors is empty or missing (degenerate input is a
// no-op, not a crash).
//
// This function is the workhorse for the image remap preview feature.
// Hardware-lock snapping is handled separately by quantizeToHardware (OKLCH
// perceptual distance, lives further down).
const quantizeToPalette = (hex, paletteColors) => {
  if (!paletteColors || paletteColors.length === 0) return hex;
  const target = hexToHsl(hex);
  let bestHex = paletteColors[0];
  let bestDist = Infinity;
  for (const candidate of paletteColors) {
    const c = hexToHsl(candidate);
    // Hue distance is circular (0 and 359 are adjacent). Use shortest arc.
    let hueDiff = Math.abs(target.h - c.h);
    if (hueDiff > 180) hueDiff = 360 - hueDiff;
    // Hue is on 0-360, lightness/sat on 0-100. Scale hue so 360 maps to
    // ~100 to keep the dimensions comparable.
    const hueScaled = (hueDiff / 360) * 100;
    const satDiff = target.s - c.s;
    const lightDiff = target.l - c.l;
    // Gray-fade hue weighting: full hue weight when both colors are at
    // least somewhat saturated (S>=15); ramp linearly to zero as the
    // less-saturated of the two approaches gray.
    const minSat = Math.min(target.s, c.s);
    const hueFade = Math.min(1, minSat / 15);
    const hueWeight = hueFade * 2.0;
    const dist = (hueScaled * hueScaled * hueWeight)
               + (satDiff * satDiff * 0.5)
               + (lightDiff * lightDiff * 1.5);
    if (dist < bestDist) {
      bestDist = dist;
      bestHex = candidate;
    }
  }
  return bestHex;
};

// dedupeHexes: collapse duplicate hex strings preserving first occurrence
// and original casing. Used for visualization, export, and copy where the
// hardware-locked ramp can produce repeats (e.g. an 8-shade Game Boy ramp
// collapses to 4 unique colors). The main per-ramp editor UI keeps duplicates
// visible so the user sees the full shadow→highlight sequence; only
// downstream consumers dedupe.
const dedupeHexes = (hexes) => {
  const seen = new Set();
  const out = [];
  for (const hex of hexes) {
    if (typeof hex !== 'string') continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hex);
  }
  return out;
};

// quantizeToHardware: nearest hardware color search using ΔE_OK (perceptual
// distance in OKLab). Used by applyHardwareLock and bakeHardwareLock for
// every snap. The image-remap path uses quantizeToPalette directly with its
// own HSL-weighted distance — that lives elsewhere and is unrelated.
const quantizeToHardware = (hex, hardware) => {
  if (!hardware || !hardware.colors || hardware.colors.length === 0) return hex;
  const target = hexToOklch(hex);
  if (!target) return hardware.colors[0];
  let bestHex = hardware.colors[0];
  let bestDist = Infinity;
  for (const candidate of hardware.colors) {
    const co = hexToOklch(candidate);
    if (!co) continue;
    const d = deltaEOK(target, co);
    if (d < bestDist) { bestDist = d; bestHex = candidate; }
  }
  return bestHex;
};

// ---------- Image remap preview ----------
// remapImageToPalette: given a source image (as { width, height, data }
// where data is a Uint8ClampedArray of RGBA bytes), remap every pixel to
// its nearest palette color and return a new image of the same shape.
//
// The input shape is structurally compatible with browser ImageData but
// not nominally typed against it; this lets Node-side tests construct
// inputs directly. The function does not call any DOM API.
//
// Options:
//   dither       'none' (default) | 'floyd-steinberg'
//   maxDimension positive int (default 512). If the source is larger than
//                this on either axis, the caller is expected to downsample
//                first (via a canvas with imageSmoothingEnabled=false); this
//                function does not resize. Kept in the signature for forward
//                compatibility and so the caller has a single source of
//                truth for the cap.
//
// Alpha policy (see IMAGE_REMAP_PLAN.md G5 and session 5 decision):
//   - alpha === 0   : fully transparent. Output pixel is (0, 0, 0, 0). No
//                     error diffusion into or out of this pixel.
//   - alpha === 255 : fully opaque. Remap RGB normally, keep alpha 255.
//   - 0 < alpha < 255 : semi-transparent. Composite RGB against white
//                     (255, 255, 255) using the source alpha as weight,
//                     then remap that composited color, then write back
//                     with the ORIGINAL alpha. This produces sensible
//                     output for anti-aliased PNG edges (where the rendered
//                     color the user sees is the composited one) while
//                     preserving the alpha so downstream consumers still
//                     get a transparent sprite.
//
// Floyd-Steinberg implementation follows the Wikipedia pseudocode:
//   error = old - new
//   neighbor[+1, 0]  += error * 7/16
//   neighbor[-1,+1]  += error * 3/16
//   neighbor[ 0,+1]  += error * 5/16
//   neighbor[+1,+1]  += error * 1/16
// Error is accumulated in a separate Float32Array of length width*height*3
// so that quantization always operates on the working error-adjusted RGB
// and not on the already-quantized output. Per the alpha policy, error
// diffusion targets a neighbor only if that neighbor has alpha > 0; this
// prevents stray error from accumulating in invisible pixels and from
// "bleeding" across hard transparency boundaries.
//
// A unique-color cache (Map<srcHex, dstHex>) is used for the no-dither path
// to skip redundant distance computations for repeated source colors.
// Floyd-Steinberg cannot use the cache because each pixel's input is
// error-adjusted and effectively unique.
const remapImageToPalette = (image, paletteColors, options) => {
  const opts = options || {};
  const dither = opts.dither || 'none';
  // Degenerate inputs: empty palette or empty image. Return a copy of input
  // shape so callers do not get a shared reference back.
  if (!image || !image.data || image.width <= 0 || image.height <= 0) {
    return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
  }
  const w = image.width;
  const h = image.height;
  const src = image.data;
  const out = new Uint8ClampedArray(src.length);
  if (!paletteColors || paletteColors.length === 0) {
    // Pass-through: copy source bytes verbatim. Documented degenerate case.
    out.set(src);
    return { width: w, height: h, data: out };
  }
  // Pre-compute palette RGB tuples once to avoid re-parsing hex per pixel.
  // quantizeToPalette internally calls hexToHsl on every candidate per call;
  // for image-scale work we want a cheaper per-pixel inner loop. Instead of
  // duplicating the HSL math here, we keep using quantizeToPalette (so the
  // perceptual weights stay in lockstep with the hardware lock) but cache
  // its output per unique source color in the no-dither path.

  // Helper: pack RGB into a small integer cache key. Faster than hex
  // strings and produces identical hits.
  const packKey = (r, g, b) => (r << 16) | (g << 8) | b;
  const toHex = (r, g, b) => {
    const hh = (n) => n.toString(16).padStart(2, '0');
    return '#' + hh(r) + hh(g) + hh(b);
  };
  const hexToTuple = (hex) => {
    const s = hex[0] === '#' ? hex.slice(1) : hex;
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  };

  if (dither === 'floyd-steinberg') {
    // Per-channel accumulated error. Float32 to avoid integer overflow at
    // strong gradients. Stride 3 (RGB only; alpha is not diffused).
    const err = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = src[i + 3];
        if (a === 0) {
          // Fully transparent: skip entirely. Output zeros.
          out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
          continue;
        }
        // Read source RGB and composite against white if semi-transparent.
        let r = src[i], g = src[i + 1], b = src[i + 2];
        if (a < 255) {
          const af = a / 255;
          r = Math.round(r * af + 255 * (1 - af));
          g = Math.round(g * af + 255 * (1 - af));
          b = Math.round(b * af + 255 * (1 - af));
        }
        // Add accumulated error and clamp to [0, 255].
        const ei = (y * w + x) * 3;
        let er = r + err[ei];
        let eg = g + err[ei + 1];
        let eb = b + err[ei + 2];
        if (er < 0) er = 0; else if (er > 255) er = 255;
        if (eg < 0) eg = 0; else if (eg > 255) eg = 255;
        if (eb < 0) eb = 0; else if (eb > 255) eb = 255;
        const srcHex = toHex(Math.round(er), Math.round(eg), Math.round(eb));
        const dstHex = quantizeToPalette(srcHex, paletteColors);
        const [dr, dg, db] = hexToTuple(dstHex);
        out[i] = dr; out[i + 1] = dg; out[i + 2] = db; out[i + 3] = a;
        // Compute quantization error and diffuse to neighbors that have
        // alpha > 0. Neighbors with alpha === 0 absorb no error (prevents
        // error pooling in invisible pixels and bleeding across edges).
        const qr = er - dr;
        const qg = eg - dg;
        const qb = eb - db;
        const diffuse = (nx, ny, weight) => {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
          const ni = (ny * w + nx) * 4;
          if (src[ni + 3] === 0) return;
          const nei = (ny * w + nx) * 3;
          err[nei]     += qr * weight;
          err[nei + 1] += qg * weight;
          err[nei + 2] += qb * weight;
        };
        diffuse(x + 1, y,     7 / 16);
        diffuse(x - 1, y + 1, 3 / 16);
        diffuse(x,     y + 1, 5 / 16);
        diffuse(x + 1, y + 1, 1 / 16);
      }
    }
    return { width: w, height: h, data: out };
  }

  // No-dither path. Use a unique-color cache keyed by the composited
  // RGB tuple (semi-transparent pixels composite differently from opaque
  // pixels with the same RGB, so the cache key must include the alpha
  // bucket: 0, 255, or 'composited-from-alpha').
  const cache = new Map();
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a === 0) {
      out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0;
      continue;
    }
    let r = src[i], g = src[i + 1], b = src[i + 2];
    if (a < 255) {
      const af = a / 255;
      r = Math.round(r * af + 255 * (1 - af));
      g = Math.round(g * af + 255 * (1 - af));
      b = Math.round(b * af + 255 * (1 - af));
    }
    const key = packKey(r, g, b);
    let dstHex = cache.get(key);
    if (dstHex === undefined) {
      const srcHex = toHex(r, g, b);
      dstHex = quantizeToPalette(srcHex, paletteColors);
      cache.set(key, dstHex);
    }
    const [dr, dg, db] = hexToTuple(dstHex);
    out[i] = dr; out[i + 1] = dg; out[i + 2] = db; out[i + 3] = a;
  }
  return { width: w, height: h, data: out };
};

// computeRemapScaleOptions: given the natural size of the uploaded image
// and an upper-bound max-pixel ceiling per axis, return the set of valid
// scale multipliers from { 0.25, 0.5, 1, 2, 4, 8 } that produce an output
// staying under the ceiling on both axes.
//
// Pure / no DOM / no React. Used by the Export Scale dropdown so the user
// only sees scales that will not blow out PNG dimensions or hit canvas
// size limits. Many browsers and graphics drivers cap canvas size at
// roughly 8192px or 16384px per axis; we use 8192 as the ceiling because
// it is the conservative floor and matches WebGL spec MAX_TEXTURE_SIZE on
// many consumer devices. Output dimensions must also round to at least 1
// pixel after applying the scale; 0.25 of a 3x3 image is 0.75 which
// floors to 0, so the helper also rejects scales producing < 1px output.
//
// Returns the scales as an array of numbers in ascending order. The
// caller picks a sensible default (typically 1x if available, otherwise
// the largest scale <= 1x).
const computeRemapScaleOptions = (naturalW, naturalH, maxDim) => {
  const cap = (typeof maxDim === 'number' && maxDim > 0) ? maxDim : 8192;
  const all = [0.25, 0.5, 1, 2, 4, 8];
  const out = [];
  for (const s of all) {
    const w = Math.max(0, Math.floor(naturalW * s));
    const h = Math.max(0, Math.floor(naturalH * s));
    if (w < 1 || h < 1) continue;
    if (w > cap || h > cap) continue;
    out.push(s);
  }
  return out;
};

// estimateRemapCost: rough cost projection for a full-resolution remap.
// Returns the number of inner-loop distance computations the remap will
// perform. Used to decide whether to warn the user before kicking off a
// potentially long-running export.
//
// Cost model:
//   no-dither: bounded above by uniqueColorsCap x paletteSize + pixels.
//              uniqueColorsCap is a pessimistic ceiling on the unique-
//              color count; for a photograph we cap at min(pixels, 65536)
//              since the cache cannot have more entries than distinct
//              24-bit colors that fit in the image (and most photographs
//              have far fewer). The +pixels term covers the cache lookup
//              pass.
//   floyd-steinberg: pixels x paletteSize. FS cannot use the cache (each
//              input is error-adjusted and effectively unique), so this
//              is the realistic cost.
//
// Both modes return a count of distance ops. The caller compares to a
// warn threshold (currently 50M, roughly 10 seconds at 200ns / op on
// typical consumer hardware).
const estimateRemapCost = (w, h, paletteSize, dither) => {
  const pixels = Math.max(0, w * h);
  if (paletteSize <= 0) return 0;
  if (dither === 'floyd-steinberg') {
    return pixels * paletteSize;
  }
  // no-dither
  const uniqueCap = Math.min(pixels, 65536);
  return uniqueCap * paletteSize + pixels;
};

// ---------- Side-by-side palette regeneration helper ----------
// Given a "snapshot" of a palette (the same shape as a saved-palette payload
// or a synthesized snapshot of the live working palette), regenerate the
// ramps for a single style. Self-contained: does NOT depend on component
// state. The component's useMemos use their own per-style applyOverrides
// and applyHardwareLock closures; we duplicate the tiny pure logic here
// rather than refactor those (low risk, easy to test).
//
// Snapshot fields used (all optional except baseColors and rampSize):
//   baseColors: string[]                 required
//   rampSize: 4|5|6|7|8                  required
//   shuffleSeed: number                  default 0
//   overrides: { [baseIdx]: { [shadeIdx]: { punchy?, balanced?, muted? } } }
//   rampSizeOverrides: { [baseIdx]: 4..8 }
//   rampSatOverrides: { [baseIdx]: number (saturation multiplier) }
//   rampShuffleOffsets: { [baseIdx]: number }
//   hiddenShades: { [baseIdx]: number[] }
//   hardwareLock: null | string (HARDWARE_PALETTES id)
//   hueShiftStrength: number (default 1.0; scales shadow/highlight hue shift)
//   curvePerRamp: { [baseIdx]: 'linear'|'eased'|'s-curve'|'ease-in'|'ease-out' }
//   gamutPerRamp: { [baseIdx]: 'auto'|'clip'|'chroma-preserve' }
//
// Returns array<array<hex>>, one inner array per baseColor, in the order
// of baseColors, with hidden shades already filtered out.
//
// v0.6 perceptual engine: this function now uses generateRampNew (perceptual
// OKLCH). The shuffle seed / rampShuffleOffsets are ignored by the engine —
// they were jitter inputs to the old HSV engine. Snapshots produced before
// v0.6 (history undo entries from older sessions) render via the new engine
// and may look different than they did at capture time; this matches the
// migration banner's "Keep new look" semantics.
const buildRampsForSnapshot = (snapshot, style) => {
  if (!snapshot || !Array.isArray(snapshot.baseColors) || snapshot.baseColors.length === 0) {
    return [];
  }
  const {
    baseColors,
    rampSize = 5,
    overrides = {},
    rampSizeOverrides = {},
    rampSatOverrides = {},
    hiddenShades = {},
    hardwareLock = null,
    hueShiftStrength = 1.0,
    curvePerRamp = {},
    gamutPerRamp = {},
  } = snapshot;

  const hardware = hardwareLock
    ? (HARDWARE_PALETTES.find(hw => hw.id === hardwareLock) || null)
    : null;

  // Resolve effective base hex for ramp `i`, applying per-ramp saturation
  // multiplier if present. Mirrors resolveBaseForRamp in the component.
  const resolveBase = (hex, baseIndex) => {
    const mult = rampSatOverrides[baseIndex];
    if (mult === undefined || mult === 1) return hex;
    const hsl = hexToHsl(hex);
    const newSat = Math.max(0, Math.min(100, hsl.s * mult));
    return hslToHex({ h: hsl.h, s: newSat, l: hsl.l });
  };

  // Resolve effective shade count for ramp `i`. Mirrors resolveSizeForRamp.
  const resolveSize = (baseIndex) => {
    const override = rampSizeOverrides[baseIndex];
    if (override && [4, 5, 6, 7, 8].includes(override)) return override;
    return rampSize;
  };

  // Style-keyed applyOverrides. Mirrors the component-scope version.
  const pinRamp = (ramp, baseIndex) => {
    const pinsForBase = overrides[baseIndex];
    if (!pinsForBase) return ramp;
    let next = null;
    for (const k of Object.keys(pinsForBase)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= ramp.length) continue;
      const styleMap = pinsForBase[k];
      if (!styleMap || typeof styleMap !== 'object') continue;
      const hex = styleMap[style];
      if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
      if (next === null) next = ramp.slice();
      next[idx] = hex.toLowerCase();
    }
    return next || ramp;
  };

  // Snap to hardware palette + dedupe consecutive duplicates. Mirrors
  // applyHardwareLock in the component.
  const snapHardware = (ramp) => {
    if (!hardware || !hardware.colors || hardware.colors.length === 0) return ramp;
    const snapped = ramp.map(hex => quantizeToHardware(hex, hardware));
    const deduped = [];
    for (const hex of snapped) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== hex) {
        deduped.push(hex);
      }
    }
    return deduped;
  };

  // Filter out hidden shade indices for base `i`. Operates on the post-pin,
  // post-hardware ramp; we use the pre-snap length to interpret hidden
  // indices, which matches how the working pipeline displays things (hidden
  // is computed against the un-snapped index space).
  const filterHidden = (ramp, baseIndex) => {
    const hidden = hiddenShades[baseIndex];
    if (!Array.isArray(hidden) || hidden.length === 0) return ramp;
    const hiddenSet = new Set(hidden);
    const out = [];
    for (let j = 0; j < ramp.length; j++) {
      if (!hiddenSet.has(j)) out.push(ramp[j]);
    }
    return out;
  };

  return baseColors.map((c, i) => {
    const shades = generateRampNew(resolveBase(c, i), {
      style,
      size: resolveSize(i),
      hueShiftStrength,
      curve: curvePerRamp[i] ?? curvePerRamp[String(i)],
      gamut: gamutPerRamp[i] ?? gamutPerRamp[String(i)],
    });
    const raw = shades.map(s => s.hex);
    const pinned = pinRamp(raw, i);
    const locked = snapHardware(pinned);
    return filterHidden(locked, i);
  });
};

// ---------- Sprite renderer ----------
const PixelSprite = ({ palette, scale = 6, spriteKey = 'vase', spriteLibrary }) => {
  const lib = spriteLibrary || DEFAULT_SPRITE_LIBRARY;
  const sprite = lib[spriteKey] || lib.vase || DEFAULT_SPRITE_LIBRARY.vase;
  if (!sprite) return null;
  const pattern = sprite.pattern;
  if (!pattern || pattern.length === 0) return null;
  const size = pattern[0].length;
  const spriteShades = sprite.numShades || 5;

  const mapIndex = (idx) => {
    if (spriteShades <= 1) return Math.floor(palette.length / 2);
    if (palette.length === 1) return 0;
    const ratio = idx / (spriteShades - 1);
    return Math.max(0, Math.min(palette.length - 1, Math.round(ratio * (palette.length - 1))));
  };

  const parseChar = (ch) => {
    if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
    if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 87;
    return 0;
  };

  return (
    <svg width={size * scale} height={pattern.length * scale} style={{ imageRendering: 'pixelated', display: 'block' }}>
      {pattern.map((row, y) =>
        row.split('').map((ch, x) => {
          if (ch === '.') return null;
          const colorIdx = mapIndex(parseChar(ch));
          return <rect key={`${x}-${y}`} x={x * scale} y={y * scale} width={scale} height={scale} fill={palette[colorIdx]} />;
        })
      )}
    </svg>
  );
};

// ---------- Piskel C parser ----------
const parsePiskelC = (text) => {
  try {
    const hexValues = text.match(/0x[0-9a-fA-F]{8}/g);
    if (!hexValues || hexValues.length < 16) return null;

    let width = null, height = null;
    const widthMatch = text.match(/FRAME_WIDTH\s+(\d+)/);
    const heightMatch = text.match(/FRAME_HEIGHT\s+(\d+)/);
    if (widthMatch) width = parseInt(widthMatch[1]);
    if (heightMatch) height = parseInt(heightMatch[1]);

    if (!width || !height) {
      const sqrt = Math.sqrt(hexValues.length);
      if (Number.isInteger(sqrt)) { width = sqrt; height = sqrt; }
      else return null;
    }
    if (hexValues.length < width * height) return null;

    const pixelCount = width * height;
    const pixels = hexValues.slice(0, pixelCount);

    const uniqueColors = new Map();
    for (const hex of pixels) {
      if (hex === '0x00000000') continue;
      if (hex.substring(0, 4).toLowerCase() === '0x00') continue;
      if (!uniqueColors.has(hex)) {
        const colorPart = hex.slice(4);
        const r = parseInt(colorPart.slice(0, 2), 16);
        const g = parseInt(colorPart.slice(2, 4), 16);
        const b = parseInt(colorPart.slice(4, 6), 16);
        uniqueColors.set(hex, rgbToHsl({ r, g, b }).l);
      }
    }
    if (uniqueColors.size === 0) return null;

    const sortedColors = Array.from(uniqueColors.entries()).sort((a, b) => a[1] - b[1]);
    const numShades = sortedColors.length;
    const colorToIndex = new Map();
    sortedColors.forEach(([hex], i) => colorToIndex.set(hex, i));

    const pattern = [];
    for (let y = 0; y < height; y++) {
      let row = '';
      for (let x = 0; x < width; x++) {
        const hex = pixels[y * width + x];
        if (hex === '0x00000000' || hex.substring(0, 4).toLowerCase() === '0x00') {
          row += '.';
        } else {
          const idx = colorToIndex.get(hex);
          row += idx < 10 ? String(idx) : String.fromCharCode(87 + idx);
        }
      }
      pattern.push(row);
    }
    return { pattern, width, height, numShades };
  } catch (err) {
    console.error('Parse failed:', err);
    return null;
  }
};

// ---------- GIMP Palette (.gpl) parser ----------
// Handles GIMP canonical format plus common dialects:
// - Aseprite's "Channels: RGBA" extension (we just ignore the alpha column)
// - Piskel's "Name: Untitled" non-issue (name is purely cosmetic on import)
// - Tolerates blank lines, leading/trailing whitespace, comment lines (#),
//   and tabs or any whitespace between R G B values.
// Returns { name, colors } where colors is an array of '#rrggbb' strings,
// or null if parsing failed. Duplicate colors are NOT collapsed here; the
// caller decides (the modal shows the raw count).
const parseGpl = (text) => {
  try {
    if (typeof text !== 'string') return null;
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return null;
    // First non-empty line must be "GIMP Palette" (case-insensitive).
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) return null;
    if (lines[i].trim().toLowerCase() !== 'gimp palette') return null;
    i++;

    let name = '';
    let hasRgba = false; // Aseprite extension: 4 values per line instead of 3.
    const colors = [];

    for (; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (line === '') continue;
      if (line.startsWith('#')) continue;

      // Header lines: "Name:", "Columns:", "Channels:" etc.
      const headerMatch = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
      if (headerMatch) {
        const key = headerMatch[1].toLowerCase();
        const val = headerMatch[2].trim();
        if (key === 'name') name = val;
        else if (key === 'channels' && /rgba/i.test(val)) hasRgba = true;
        // Other headers (Columns, etc.) are ignored.
        continue;
      }

      // Color line: 3 (or 4 if RGBA) whitespace-separated ints, optionally
      // followed by a name. We capture the first 3-4 integers and ignore
      // anything after.
      const nums = line.split(/\s+/).filter(Boolean);
      const expected = hasRgba ? 4 : 3;
      if (nums.length < expected) continue;
      const r = parseInt(nums[0], 10);
      const g = parseInt(nums[1], 10);
      const b = parseInt(nums[2], 10);
      // Some files have RGBA without declaring Channels. Detect by looking
      // at whether the fourth token is also a clamped int 0-255 and the
      // first non-numeric token comes after position 4.
      if (!hasRgba && nums.length >= 4) {
        const a = parseInt(nums[3], 10);
        if (!Number.isNaN(a) && a >= 0 && a <= 255) {
          // Could be RGBA or RGB with a numeric name like "255". Ambiguous.
          // Conservative call: assume RGB and let the 4th token be name-ish.
        }
      }
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) continue;
      if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) continue;
      colors.push(rgbToHex(r, g, b));
    }

    if (colors.length === 0) return null;
    return { name: name || 'Imported Palette', colors };
  } catch {
    return null;
  }
};

// ---------- GPL auto-subset heuristic ----------
// Given a flat array of hex colors, pick 4-6 representative bases by:
// 1. Deduplicating exact hex matches.
// 2. Filtering to "mid-lightness" range (L between 30 and 70) since the
//    ramp generator produces both shadows and highlights from each base.
//    Pure-dark and pure-light bases produce degenerate ramps.
// 3. Sorting by hue and sampling N evenly-spaced colors where N is the
//    midpoint of 4-6 unless the filtered pool is smaller.
// 4. Fallback: if mid-lightness filtering leaves <3 colors, fall back to
//    all unique colors and sample from there.
const subsetGplColors = (colors) => {
  if (!Array.isArray(colors) || colors.length === 0) return [];
  // Dedupe (case-insensitive, normalized).
  const seen = new Set();
  const unique = [];
  for (const hex of colors) {
    const n = hex.toLowerCase();
    if (!seen.has(n)) { seen.add(n); unique.push(n); }
  }
  if (unique.length <= 6) return unique;

  // Filter mid-lightness.
  const mid = unique.filter(hex => {
    const { l } = hexToHsl(hex);
    return l >= 30 && l <= 70;
  });
  const pool = mid.length >= 3 ? mid : unique;

  // Sort by hue (grayscale colors get hue 0; that's fine for ordering).
  const sorted = [...pool].sort((a, b) => hexToHsl(a).h - hexToHsl(b).h);

  // Target 5 representatives.
  const target = Math.min(5, sorted.length);
  if (target === sorted.length) return sorted;
  const out = [];
  for (let k = 0; k < target; k++) {
    const idx = Math.round((k * (sorted.length - 1)) / (target - 1));
    out.push(sorted[idx]);
  }
  // Dedupe again in case the spacing landed on the same hex twice.
  return [...new Set(out)];
};

// ---------- Harmony ----------
const generateHarmony = (baseHexes) => {
  let anchor = baseHexes[0], maxSat = 0;
  for (const hex of baseHexes) {
    const hsl = hexToHsl(hex);
    if (hsl.s > maxSat) { maxSat = hsl.s; anchor = hex; }
  }
  const base = hexToHsl(anchor);
  const tone = (hsl) => ({
    h: hsl.h,
    s: Math.min(95, Math.max(55, hsl.s)),
    l: Math.min(70, Math.max(40, hsl.l))
  });
  return {
    complementary: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    analogous1: hslToHex(tone({ h: base.h + 30, s: base.s, l: base.l })),
    analogous2: hslToHex(tone({ h: base.h - 30, s: base.s, l: base.l })),
    triadic1: hslToHex(tone({ h: base.h + 120, s: base.s, l: base.l })),
    triadic2: hslToHex(tone({ h: base.h + 240, s: base.s, l: base.l })),
    splitComp1: hslToHex(tone({ h: base.h + 150, s: base.s, l: base.l })),
    splitComp2: hslToHex(tone({ h: base.h + 210, s: base.s, l: base.l })),
    // Tetradic: rectangle on the wheel, two complementary pairs at 60° + 180° + 240°
    tetradic1: hslToHex(tone({ h: base.h + 60, s: base.s, l: base.l })),
    tetradic2: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    tetradic3: hslToHex(tone({ h: base.h + 240, s: base.s, l: base.l })),
    // Square: even 90° spacing
    square1: hslToHex(tone({ h: base.h + 90, s: base.s, l: base.l })),
    square2: hslToHex(tone({ h: base.h + 180, s: base.s, l: base.l })),
    square3: hslToHex(tone({ h: base.h + 270, s: base.s, l: base.l })),
  };
};

// ---------- Randomizer pools ----------
const _WORD_POOL_IMPORTED = true; // WORD_POOL imported from ./lib/constants

const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

const buildRandomDescription = () => {
  const patterns = [
    () => `${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.materials)} ${pickRandom(WORD_POOL.nouns)}`,
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.colorAdjectives)} ${pickRandom(WORD_POOL.nouns)}`,
    () => pickRandom(WORD_POOL.scenes),
    () => `${pickRandom(WORD_POOL.qualityAdjectives)} ${pickRandom(WORD_POOL.scenes)}`,
  ];
  return pickRandom(patterns)();
};

const buildRandomHex = () => {
  const hue = Math.floor(Math.random() * 360);
  const sat = 55 + Math.floor(Math.random() * 40);
  const light = 35 + Math.floor(Math.random() * 25);
  return hslToHex({ h: hue, s: sat, l: light });
};

// ---------- Panel state persistence ----------
const PANEL_STORAGE_KEY = 'ui:panels'
const PANEL_DEFAULTS = { harmonyOpen: true, tipsOpen: false, hwPickerOpen: false, exportOpen: true, historyOpen: false, savedOpen: false, sbsOpen: false }
function loadPanelState() {
  try {
    const raw = localStorage.getItem(PANEL_STORAGE_KEY)
    return raw ? { ...PANEL_DEFAULTS, ...JSON.parse(raw) } : PANEL_DEFAULTS
  } catch { return PANEL_DEFAULTS }
}
const _panels = loadPanelState()

// ---------- Main ----------
export default function PixelPalGenerator() {
  const [mode, setMode] = useState('color');
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(undefined);
  const [colorInput, setColorInput] = useState('#ff00ff');
  const [aiInput, setAiInput] = useState('a holographic jellyfish');
  const [aiReasoning, setAiReasoning] = useState('');
  const [aiColorNames, setAiColorNames] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageColorCount, setImageColorCount] = useState(4);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  // Image zoom for eyedropper precision. Integer multipliers ONLY because we
  // use image-rendering: pixelated to display at the scaled size. The
  // underlying image data is never resampled, so no new colors are invented.
  // The eyedropper math already maps mouse coords back to naturalWidth /
  // naturalHeight via getBoundingClientRect, so zoom changes display only.
  // Note: 1x means CSS max-h-48 (192px) applies; >1x removes the cap and
  // explicitly sets width=naturalWidth*zoom so the scroll container can size
  // correctly.
  const [imageZoom, setImageZoom] = useState(1);
  // naturalWidth/Height of the loaded image. Captured in the img's onLoad
  // and used to compute display width when zoom > 1. Stored in state rather
  // than a ref because we need re-renders to pick up the new value when the
  // user uploads a different image. Defaults to 0 so the conditional in the
  // img style waits until the image actually loads.
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);
  const [hoveredColor, setHoveredColor] = useState(null);
  const [rampSize, setRampSize] = useState(4);
  // hueShiftStrength scales the shadow/highlight hue shifts applied
  // inside generateRamp. 1.0 = default (current behavior, byte-identical
  // to pre-E saved palettes). 0.0 = no hue shift (flatter ramps).
  // 2.0 = double shift (more painterly stylized). Stored as a number
  // in [0.0, 2.0]; UI surfaces it as a percentage. Per-palette, NOT a
  // global user preference: it's a creative choice that belongs to the
  // palette's identity.
  const [hueShiftStrength, setHueShiftStrength] = useState(1.0);
  const [crtEnabled, setCrtEnabled] = useState(true);
  // UI theme: 'dark' is the original vaporwave look; 'neutral' uses 18% gray
  // (~#777777, the photography/Zone V middle-gray standard) for unbiased
  // color perception when judging palettes; 'light' uses an off-white that's
  // easier on the eyes than pure white. Persisted globally under the
  // 'ui:theme' storage key so all palettes inherit the user's choice. NOT
  // saved per-palette since theme is a viewing preference, not a property of
  // the palette itself.
  const [theme, setTheme] = useState('dark');
  // Color Vision Deficiency simulation mode. Applies an SVG color matrix
  // filter to the main content area to approximate what the palette looks
  // like to users with protanopia, deuteranopia, or tritanopia. Purely
  // visual: hex labels and underlying state are untouched. Persisted under
  // 'ui:cvdMode' so the accessibility preference sticks across sessions.
  // Same rationale as theme persistence.
  const [cvdMode, setCvdMode] = useState('none');
  const [spriteKey, setSpriteKey] = useState('vase');
  const [customSprites, setCustomSprites] = useState({});
  const [showSpriteImporter, setShowSpriteImporter] = useState(false);
  const [spriteImportText, setSpriteImportText] = useState('');
  const [spriteImportName, setSpriteImportName] = useState('');
  const [spriteImportError, setSpriteImportError] = useState('');
  const [spriteDragging, setSpriteDragging] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [tourGuideId, setTourGuideId] = useState(null);
  const [tourStep, setTourStep] = useState(0);
  const [baseColors, setBaseColors] = useState(['#ff00ff']);
  const [copiedHex, setCopiedHex] = useState(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [exportFeedback, setExportFeedback] = useState('');
  // Brief inline feedback shown next to the "Add to Palette" button on the
  // Single Color tab. Separate from exportFeedback because the export
  // badge lives near the bottom of the page and is invisible to a user
  // working at the top. Clears itself via setTimeout.
  const [addBaseFeedback, setAddBaseFeedback] = useState('');
  // WCAG Check (internal state: compareMode): when on, clicking a swatch sets the compareAnchor
  // instead of copying the hex. A second click on a different swatch
  // (in any ramp / style) populates compareResult with the ratio.
  // Click the anchored swatch again to unlock. Click any swatch when
  // a result is showing to start a fresh comparison from that swatch.
  // All transient; not persisted.
  const [compareMode, setCompareMode] = useState(false);
  const [compareAnchor, setCompareAnchor] = useState(null); // { baseIndex, shadeIndex, style, hex } | null
  const [compareResult, setCompareResult] = useState(null); // { aHex, bHex, ratio, tier } | null
  const [gplStyle, setGplStyle] = useState('punchy');
  const [vizStyle, setVizStyle] = useState('punchy');
  const [harmonizeMode, setHarmonizeMode] = useState('complement');
  const [harmonizeBaseline, setHarmonizeBaseline] = useState(null);
  const [harmonyOpen, setHarmonyOpen] = useState(_panels.harmonyOpen);
  const [tipsOpen, setTipsOpen] = useState(_panels.tipsOpen);
  const [hwPickerOpen, setHwPickerOpen] = useState(_panels.hwPickerOpen);
  const [exportOpen, setExportOpen] = useState(_panels.exportOpen);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  // Per-ramp export style. Independent of vizStyle (which controls the
  // Visualization panel near the bottom of the page) and of gplStyle
  // (which controls the full-palette .gpl Download button in the bottom
  // export bar). Used by the per-ramp Copy and Download buttons on every
  // ramp card. Initialized to match the default vizStyle so a brand-new
  // session has both at 'punchy'; from then on they diverge as the user
  // chooses. Not undoable, not saved with palettes (matches vizStyle and
  // gplStyle treatment as UI / export preferences rather than palette
  // content). See "Per-ramp export style is independent" in ARCHITECTURE.
  const [rampExportStyle, setRampExportStyle] = useState('punchy');
  // ----- Image Remap Preview state -----
  // Separate image slot from the From Image extraction feature. The user
  // uploads a reference image and remaps every pixel to the nearest color
  // in the currently active palette (vizStyle, hidden shades, hardware
  // lock applied). Manual refresh via a button. None of this state is
  // persisted (matches the From Image mode), saved with palettes, or in
  // the history snapshot. See IMAGE_REMAP_PLAN.md and ARCHITECTURE.md's
  // remap section for the full design.
  //
  // remapImageDataUrl: the uploaded image as a data URL, or null. Survives
  // palette edits (the user uploaded it intentionally; only the OUTPUT is
  // invalidated by palette changes).
  // remapImageNaturalSize: { w, h } of the uploaded image's natural size.
  // remapOutput: the cached remap result as { width, height, data }. Stays
  // up after a palette change to let the user compare visually; a stale
  // badge appears above it. Cleared by reset paths via clearRemapOutput().
  // remapOutputSignature: a string capturing the inputs that produced the
  // current remapOutput. Compared to the LIVE signature each render; when
  // they differ, the output is stale.
  // remapDither: 'none' | 'floyd-steinberg'. Session-only (not persisted,
  // matches the v1 decision; easy to upgrade later).
  // remapLoading: shown during the actual remap call.
  // remapError: surfaced upload / processing errors.
  const [remapImageDataUrl, setRemapImageDataUrl] = useState(null);
  const [remapImageNaturalSize, setRemapImageNaturalSize] = useState(null);
  const [remapOutput, setRemapOutput] = useState(null);
  const [remapOutputSignature, setRemapOutputSignature] = useState(null);
  const [remapDither, setRemapDither] = useState('none');
  const [remapLoading, setRemapLoading] = useState(false);
  const [remapError, setRemapError] = useState('');
  const [remapImageName, setRemapImageName] = useState('');
  // remapDownloadScale: float multiplier applied to the UPLOAD's natural
  // size at export time. The valid set is computed dynamically from the
  // upload size by computeRemapScaleOptions; scales are filtered so the
  // output stays under 8192px per axis (a conservative canvas-size
  // ceiling that matches the WebGL MAX_TEXTURE_SIZE floor on consumer
  // devices). Default 1 (one-to-one with the upload) when 1 is in the
  // valid set, else the largest available scale <= 1. Session-only,
  // no undo, no persistence.
  //
  // Note: this is the EXPORT scale, not the PREVIEW scale. The on-screen
  // preview always runs against the downsampled (<= 512px) source for
  // responsiveness; the export re-decodes the data URL and runs the
  // remap math against the ORIGINAL upload at this multiplier so the
  // PNG is a true full-resolution result rather than an upscaled
  // version of the preview.
  const [remapDownloadScale, setRemapDownloadScale] = useState(1);
  // remapDownloadConfirmPending: when true, the next Download click
  // commits a potentially long-running full-resolution export. Set by
  // the first click when projected cost exceeds the warn threshold;
  // cleared by a 5-second auto-disarm timer or by a successful commit.
  // Same two-click pattern as confirmReset.
  const [remapDownloadConfirmPending, setRemapDownloadConfirmPending] = useState(false);
  const remapDownloadConfirmTimerRef = useRef(null);
  // remapDragOver: true while a file is being dragged over the panel's
  // empty-state drop zone. Drives a visual highlight (border color +
  // background) so the user knows the drop will land. Cleared on drop
  // or drag leave. Panel-local; no relation to the From Image mode's
  // `isDragging` state, which is gated on `mode === 'image'`.
  const [remapDragOver, setRemapDragOver] = useState(false);
  // Side-by-Side image remap. When the Image Preview panel has an uploaded
  // image, each SBS slot also renders a remap of that same image against
  // its slot palette. This lets the user compare how two palettes handle
  // the same reference image. Source decoded once at 256px longest axis
  // (smaller than the main panel's 512px because each slot renders at a
  // smaller display size and we run TWO remaps per palette change here).
  // Dither toggle is SHARED with the main panel via remapDither; we do
  // not add a second control. None of this state is undoable, persisted,
  // or in saved-palette payloads (matches the main remap state policy).
  // sbsRemapSource: ImageData decoded from remapImageDataUrl at up to
  // SBS_REMAP_MAX_DIMENSION on the longer axis. Decoded once per upload
  // and reused by both slots. Cleared when the image is removed or
  // replaced. Null when no image is loaded.
  const [sbsRemapSource, setSbsRemapSource] = useState(null);
  // Per-slot remap output cache and loading flag. Auto-recomputes when
  // the slot palette signature, the source, or the dither setting
  // changes. Signature includes the slot's effective palette joined
  // lowercase plus the dither mode, same shape as buildRemapSignature.
  const [sbsLeftRemap, setSbsLeftRemap] = useState(null);
  const [sbsRightRemap, setSbsRightRemap] = useState(null);
  const [sbsLeftRemapLoading, setSbsLeftRemapLoading] = useState(false);
  const [sbsRightRemapLoading, setSbsRightRemapLoading] = useState(false);
  // harmonyAnchor: index into baseColors[] used as the source for the Harmony
  // Colors panel. Originally hardcoded to 0; now user-selectable via the
  // thumbnail row at the top of the Harmony section. When a base is removed
  // we clamp the anchor in removeRamp; if the anchor base itself is removed,
  // it falls back to 0. We deliberately do NOT auto-switch the anchor when
  // new bases are added (e.g. via Add Both / Add All in the harmony panel
  // itself), since that would yank the harmony view out from under the user
  // mid-click.
  const [harmonyAnchor, setHarmonyAnchor] = useState(0);
  // hardwareLock: when non-null, all generated ramp shades and added harmony
  // colors are snapped to the nearest color in the named hardware palette.
  // Values: null (no lock, free generation), 'nes', 'gameboy', 'cga16',
  // 'ega64', or 'c64'. Persisted with the palette since the lock IS part
  // of the palette's identity (a "Game Boy palette" loses meaning if you
  // load it free).
  // When set, the per-ramp output is also deduped (consecutive duplicates
  // collapsed) and capped at min(rampSize, hardwarePaletteSize). The dedupe
  // means a Game Boy ramp with 8 requested shades visually shows 4 since
  // the hardware only has 4 colors.
  const [hardwareLock, setHardwareLock] = useState(null);

  // Base color editor (feature #1). At most one ramp's editor is open at a
  // time; toggling another closes the previous. editorHsv holds the live
  // slider values for the currently-open editor; we keep HSV as the editor's
  // source of truth so slider drags feel continuous (writing through hex would
  // jitter due to round-trip quantization). When the editor opens, editorHsv
  // is seeded from the corresponding baseColors[i] via hexToHsv.
  //
  // HSV (also called HSB) is chosen over HSL because it matches the mental
  // model of pixel art tools like Aseprite. Note that in HSV, V=100 with
  // S=100 is the pure saturated color (not white); reaching white requires
  // S=0 AND V=100. This is by design.
  const [editingIndex, setEditingIndex] = useState(null);
  const [editorHsv, setEditorHsv] = useState({ h: 0, s: 0, v: 0 });

  // Per-shade overrides (feature A). Sparse map keyed by baseIndex then
  // shadeIndex: { [baseIndex]: { [shadeIndex]: '#rrggbb' } }. Overrides are
  // applied AFTER generateRamp returns and AFTER its internal sortByLightness,
  // so a pinned shade can sit anywhere in the ramp regardless of its
  // lightness. This is intentional: the user pinned it on purpose and the
  // pushpin badge makes the override visible. Overrides are SHARED across the
  // three styles (Punchy/Balanced/Muted): a pin on base i, shade j means
  // shade j of base i is the pinned hex in all three styles. When the user
  // removes a base, overrides for that base are dropped and later indices
  // shift down (see removeRamp). When the ramp size changes, overrides on
  // shade indices >= the new size become inert but stay in state so that
  // switching back to a larger size restores them.
  const [overrides, setOverrides] = useState({});
  // pinEditor: which shade's editor is currently open. null when closed.
  // Shape: { baseIndex, shadeIndex } or null. At most one pin editor open at
  // a time, mirroring how the base editor works.
  const [pinEditor, setPinEditor] = useState(null);

  // Per-ramp overrides (in addition to per-shade pins). Both are sparse maps
  // keyed by baseIndex; absent entries inherit the global default.
  //   rampSizeOverrides[i] = 4..8     overrides the global rampSize for ramp i
  //   rampSatOverrides[i] = 0.5..2.0  multiplies the base color's saturation
  //                                   before passing it to generateRamp.
  // Range/validation enforcement happens at the setter site. Both are cleared
  // on every full-palette-replace path (Generate, AI, image load, classics).
  // removeRamp also shifts later keys down by 1.
  const [rampSizeOverrides, setRampSizeOverrides] = useState({});
  const [rampSatOverrides, setRampSatOverrides] = useState({});

  // Per-ramp shuffle offsets. Sparse map keyed by baseIndex; value is a
  // non-negative integer that the user has incremented by clicking the
  // per-ramp Shuffle button. Feeds into the generator's jitter seed so
  // each ramp can be reshuffled independently. Without an entry the
  // offset is treated as 0, so the user only pays the state-bloat cost
  // for ramps they actually shuffled. Cleared on full-palette replace.
  // Shifted on removeRamp via shiftBaseKeyedMap.
  const [rampShuffleOffsets, setRampShuffleOffsets] = useState({});

  // Hidden shades per base. Sparse map keyed by baseIndex; value is an
  // array of shadeIndex numbers that should be filtered out of display
  // and export for that base. Filtering applies across all three styles
  // simultaneously (a single decision per base). Ramps are still
  // computed at their full size internally so pin overrides keep their
  // shade-position semantics; the hidden indices are filtered at
  // display/export time only. Cleared on every full-palette-replace
  // path. Shifted on removeRamp via shiftBaseKeyedMap.
  const [hiddenShades, setHiddenShades] = useState({});


  // Per-base ramp-card collapse state. A Set of baseIndex values that are
  // currently collapsed (showing only the three sprite icons, hiding the
  // swatch rows). Transient UI state, not persisted across sessions. NOT
  // cleared on palette-replace paths because the threshold-transition
  // effect below handles defaults: <=2 bases auto-expands, >=3 auto-collapses.
  // Manual toggles persist as long as the base count stays in the same bucket.
  // Keys must be shifted on removeRamp the same way overrides are.
  const [collapsedRamps, setCollapsedRamps] = useState(() => new Set());

  // lockedRamps: Set of base indices whose per-ramp inputs are exempt from
  // global regeneration. When a ramp is locked, the global Generate / Shuffle
  // / dice button does NOT alter its base color, size override, sat override,
  // or effective shuffle seed. Pins and hidden shades on locked ramps are
  // ALSO preserved (they were anyway, since they're addressed by index).
  // Hardware lock still applies to locked ramps (it's a global output
  // filter, not an input). The harmonize() helper uses this set to decide
  // which ramps to leave alone vs which to nudge to harmony positions.
  //
  // Implementation note: ramps are computed by useMemo from baseColors
  // and shuffleSeed (a global counter). To keep a locked ramp visually
  // unchanged when shuffleSeed advances, we compensate by setting that
  // ramp's `rampShuffleOffsets[i]` to a counter-value such that the
  // effective per-ramp seed stays constant. See `bumpShuffleSeed` below.
  //
  // Keys must be shifted on removeRamp the same way overrides are.
  const [lockedRamps, setLockedRamps] = useState(() => new Set());

  // ============================================================
  // History (undo / redo / jump-to-state)
  // ============================================================
  // Photoshop-style: a collapsible list of past states, each labeled
  // with the action that produced it and the time it happened. Users
  // can Cmd+Z / Cmd+Y for sequential navigation or click any entry in
  // the panel to jump.
  //
  // Architecture: whole-state snapshots, NOT diff patches. Each entry
  // holds a JSON-serializable snapshot of every undoable state field
  // (the working-palette fields, plus lockedRamps and collapsedRamps;
  // see buildUndoSnapshot below for the full list). 20-entry cap;
  // overflow drops the oldest. Session-only (NOT persisted to storage):
  // a page reload starts fresh with a single "Initial state" entry.
  //
  // Sprite library, theme/CRT/CVD chrome preferences, side-by-side
  // slot assignments, compare-mode state, save-name input, pin editor
  // and base editor open state are all NOT in the snapshot. Those are
  // asset-library / UI-chrome / transient-edit-mode state. Undo only
  // covers "what is the palette", not "how am I viewing it".
  //
  // Watcher effect (declared further down, near the other useEffects):
  // observes a serialized snapshot, debounces 300ms so a slider drag
  // collapses into a single history entry, and pushes a new entry when
  // the snapshot stabilizes at a value different from the current
  // entry's. The `isReplayingHistory` ref short-circuits the watcher
  // during undo/redo/jump so replayed states don't recursively create
  // new entries (which would also break the redo stack).
  //
  // pendingLabel: handler-tagged actions (Generate, Harmonize, Load,
  // etc) set this before mutating state. The watcher consumes it as
  // the new entry's label. Anything that mutates state without setting
  // this gets a label inferred by diffing the new snapshot against
  // the current one.
  const HISTORY_DEPTH_CAP = 20;
  const HISTORY_DEBOUNCE_MS = 300;
  const [historyEntries, setHistoryEntries] = useState(() => [
    { snapshot: null, label: 'Initial state', timestamp: Date.now() },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(_panels.historyOpen);
  const isReplayingHistoryRef = useRef(false);
  const historyDebounceRef = useRef(null);
  const pendingLabelRef = useRef(null);

  // Saved palettes (persisted via window.storage). Each entry is a small index
  // record { slug, name, savedAt, baseColors }; the full payload lives at
  // `palettes:{slug}`. We keep an in-memory list to avoid re-listing on every
  // render. Loading the full payload happens on demand when the user clicks
  // Load. Storage operations are best-effort; failures show in `savedError`.
  const [savedPalettes, setSavedPalettes] = useState([]);
  const [curvePerRamp, setCurvePerRamp] = useState<Record<string, CurvePresetSerialized>>({});
  const [gamutPerRamp, setGamutPerRamp] = useState<Record<string, GamutStrategySerialized>>({});
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({});
  const [savedOpen, setSavedOpen] = useState(_panels.savedOpen);
  // Side-by-side compare: dedicated section with two slots. Each slot
  // holds either null (empty), the string 'working' (the live working
  // palette, which re-renders live as edits happen), or a saved palette
  // slug. The section starts collapsed; sbsOpen is the user's UI choice
  // and persists across palette resets (matches savedOpen).
  // Slot assignments are transient analysis state, NOT part of a saved
  // palette's identity, so they reset on every "new palette" path.
  // Named sbsLeft/sbsRight rather than compareLeft/compareRight to avoid
  // confusion with the existing WCAG Check (formerly "Compare Mode") picker.
  const [sbsOpen, setSbsOpen] = useState(_panels.sbsOpen);
  const [sbsLeft, setSbsLeft] = useState('working');
  const [sbsRight, setSbsRight] = useState(null);
  // Per-slot async payload cache. When a slot points at a saved palette
  // slug, the full payload is fetched from storage and stored here so
  // ramps render at full fidelity (pins, hidden shades, hardware, sizes,
  // sats). 'working' and null slots leave this at null and build the
  // snapshot inline from live state at render time. Errors during fetch
  // surface in sbs*Error so the slot can show a clear message.
  const [sbsLeftPayload, setSbsLeftPayload] = useState(null);
  const [sbsRightPayload, setSbsRightPayload] = useState(null);
  const [sbsLeftError, setSbsLeftError] = useState('');
  const [sbsRightError, setSbsRightError] = useState('');
  const [sbsLeftLoading, setSbsLeftLoading] = useState(false);
  const [sbsRightLoading, setSbsRightLoading] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savedError, setSavedError] = useState('');
  const [savedBusy, setSavedBusy] = useState(false);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState(null);
  const confirmTimerRef = useRef(null);
  // Rename UI state. renamingSlug holds the slug whose row is in rename
  // mode (or null if no rename is active); renameDraft is the in-progress
  // text; renameError is per-row inline validation. Only one palette can
  // be in rename mode at a time. Click Rename to enter the mode, Enter or
  // the check button to commit, Escape or the X button to cancel.
  const [renamingSlug, setRenamingSlug] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState('');
  // Ref to the Save Palette name input. Used by the `S` keyboard
  // shortcut to scroll the saved-palettes section into view and focus
  // the field for immediate typing. Set via the ref attribute on the
  // input element down in the JSX tree.
  const saveNameInputRef = useRef(null);
  const SAVED_PALETTE_LIMIT = 100;
  // Two-click confirmation for the Reset to Defaults button. First click
  // arms it (button shows "Confirm?"), second click within 3s commits.
  const [confirmReset, setConfirmReset] = useState(false);
  const resetConfirmTimerRef = useRef(null);
  // Text filter for the Saved Palettes list. Case-insensitive substring
  // match on palette name. Render-only: does not mutate savedPalettes.
  const [savedFilter, setSavedFilter] = useState('');
  // Compact classics loader dropdown selection (lives inside the Saved
  // Palettes section). UI-local, ephemeral, no persistence. Defaults to
  // the first classic so the preview row below the dropdown shows
  // something on first render. Empty string is not a valid value
  // because we always want a classic selected when the section is open.
  const [classicLoaderId, setClassicLoaderId] = useState(
    CLASSIC_PALETTES.length > 0 ? CLASSIC_PALETTES[0].id : ''
  );

  // applyOverrides: given the raw ramp for base `i` and the current overrides
  // map, substitute any pinned shade indices. Out-of-range pin indices (e.g.
  // an old pin on shade 7 when the ramp is now size 4) are silently ignored,
  // matching the "keep them around but inert" policy in the state comment.
  // Map from ramp size to its position labels. The 5/7 sizes are symmetric
  // (2/3 shades below base + 2/3 above) so they fit naturally between the
  // existing 4 and 8. Centralize the mapping so we only have to add new
  // sizes in one place.
  const shadeLabelsFor = (n) => {
    if (n === 4) return ['outline', 'shadow', 'base', 'highlight'];
    if (n === 5) return ['outline', 'shadow', 'base', 'highlight', 'bright'];
    if (n === 6) return ['outline', 'deep shadow', 'shadow', 'base', 'highlight', 'bright'];
    if (n === 7) return ['outline', 'deep shadow', 'shadow', 'base', 'mid highlight', 'highlight', 'bright'];
    return ['outline', 'deep shadow', 'shadow', 'mid shadow', 'base', 'mid highlight', 'highlight', 'bright'];
  };

  // labelsForRamp: returns labels positioned so 'base' lands on whatever
  // slot in the sorted ramp actually holds the input base hex. This
  // corrects a labeling drift in generateRamp: the sort-by-lightness step
  // at the end can place a style-computed shade (e.g. midHighlight clamped
  // to a ceiling that's darker than the actual base) ahead of the base,
  // pushing the base into a slot the label table expects to hold a
  // different shade. Without this fix, the "base" label points at
  // whatever sorted into slot N/2 regardless of which hex is actually
  // the input base.
  //
  // Strategy: find the input base hex in the sorted ramp (case-insensitive
  // since generateRamp lowercases its output). Take the dark-side and
  // light-side label sequences from shadeLabelsFor(n) and rebuild the
  // label array with 'base' centered on the found slot. If the slot
  // count on either side doesn't match shadeLabelsFor's expected count,
  // labels closest to base are duplicated (with an index suffix) to fill,
  // or labels furthest from base are dropped. This keeps the most
  // recognizable labels (outline, bright) at the extremes.
  //
  // Fallback: if the base hex isn't found in the ramp at all (e.g. when
  // a pin or hardware lock has replaced the base shade), use the original
  // shadeLabelsFor(n) array. The "base" label in that case marks whichever
  // slot the original table puts it at, matching the prior behavior so
  // pinned-base or hardware-locked palettes label the same as before.
  const labelsForRamp = (sortedRamp, baseHex) => {
    const n = sortedRamp.length;
    const defaultLabels = shadeLabelsFor(n);
    if (typeof baseHex !== 'string') return defaultLabels;
    const target = baseHex.toLowerCase();
    let basePos = -1;
    for (let i = 0; i < sortedRamp.length; i++) {
      if (sortedRamp[i].toLowerCase() === target) { basePos = i; break; }
    }
    if (basePos < 0) return defaultLabels;
    // Find where 'base' sits in the default label table.
    const defaultBasePos = defaultLabels.indexOf('base');
    if (defaultBasePos < 0 || defaultBasePos === basePos) {
      // Nothing to shift, or the base hex landed exactly where the
      // default table expects.
      return defaultLabels;
    }
    // Build new labels. Dark-side labels are defaultLabels[0..defaultBasePos-1].
    // Light-side labels are defaultLabels[defaultBasePos+1..end]. We need
    // basePos dark labels and (n - basePos - 1) light labels.
    const darkSrc = defaultLabels.slice(0, defaultBasePos);
    const lightSrc = defaultLabels.slice(defaultBasePos + 1);
    const labels = new Array(n);
    labels[basePos] = 'base';
    // Dark side: anchor 'outline' to slot 0, fill the slots adjacent to
    // base with the labels nearest to base in the default ordering.
    // If we have more dark slots than dark labels, duplicate the label
    // nearest to base with an index suffix. If we have fewer, drop
    // labels nearest to base (preserving outline at slot 0).
    const darkNeeded = basePos;
    if (darkNeeded <= darkSrc.length) {
      // Use darkSrc[0..darkNeeded-1], keeping outline (index 0) anchored
      // at slot 0 and the labels closest to base get the slots closest
      // to base.
      const keep = darkSrc.slice(0, darkNeeded);
      for (let i = 0; i < darkNeeded; i++) labels[i] = keep[i];
    } else {
      // More dark slots than labels: place all darkSrc labels and pad
      // the slots adjacent to base with a suffixed duplicate of the
      // last (nearest-to-base) label.
      for (let i = 0; i < darkSrc.length; i++) labels[i] = darkSrc[i];
      const nearBase = darkSrc[darkSrc.length - 1] || 'shadow';
      let dupIdx = 2;
      for (let i = darkSrc.length; i < darkNeeded; i++) {
        labels[i] = `${nearBase} ${dupIdx++}`;
      }
    }
    // Light side: mirror the dark-side logic. Slots after base.
    const lightNeeded = n - basePos - 1;
    if (lightNeeded <= lightSrc.length) {
      // Use lightSrc[end - lightNeeded..end], keeping 'bright' (last) at
      // slot n-1 and the labels closest to base near base.
      const keep = lightSrc.slice(lightSrc.length - lightNeeded);
      for (let i = 0; i < lightNeeded; i++) labels[basePos + 1 + i] = keep[i];
    } else {
      // More light slots than labels: pad slots adjacent to base with a
      // suffixed duplicate of the first (nearest-to-base) label.
      const nearBase = lightSrc[0] || 'highlight';
      let dupIdx = 2;
      let writePos = basePos + 1;
      const extra = lightNeeded - lightSrc.length;
      for (let i = 0; i < extra; i++) {
        labels[writePos++] = `${nearBase} ${dupIdx++}`;
      }
      for (let i = 0; i < lightSrc.length; i++) {
        labels[writePos++] = lightSrc[i];
      }
    }
    return labels;
  };

  // applyOverrides: given the raw ramp for base `i` and the current overrides
  // map, substitute any pinned shade indices. Out-of-range pin indices (e.g.
  // an old pin on shade 7 when the ramp is now size 4) are silently ignored,
  // matching the "keep them around but inert" policy in the state comment.
  //
  // Schema: overrides[baseIndex][shadeIndex] is a per-style object
  // { punchy?, balanced?, muted? }, each entry a 6-digit hex. Pins are
  // applied only to the matching style; ramps for the other two styles
  // are unaffected at that shade index. The `style` arg picks which key.
  const applyOverrides = (ramp, baseIndex, overrideMap, style) => {
    const pinsForBase = overrideMap[baseIndex];
    if (!pinsForBase) return ramp;
    let next = null;
    for (const k of Object.keys(pinsForBase)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= ramp.length) continue;
      const styleMap = pinsForBase[k];
      if (!styleMap || typeof styleMap !== 'object') continue;
      const hex = styleMap[style];
      if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
      if (next === null) next = ramp.slice();
      next[idx] = hex.toLowerCase();
    }
    return next || ramp;
  };

  // filterHidden: returns { hexes, labels, originalIndices } with the
  // hidden shades for base `baseIndex` removed. Internally ramps are
  // still computed at their full size (so pins, harmony anchor, and the
  // generator's lightness curves keep their position semantics); this
  // helper filters at the boundary right before display/export.
  // originalIndices is parallel to hexes/labels and gives the pre-filter
  // shade-index for each surviving entry, used by the swatch grid so
  // the right-click handler can target the correct position.
  const filterHidden = (ramp, labels, baseIndex) => {
    const hidden = hiddenShades[baseIndex];
    if (!Array.isArray(hidden) || hidden.length === 0) {
      return { hexes: ramp, labels, originalIndices: ramp.map((_, j) => j) };
    }
    const hiddenSet = new Set(hidden);
    const hexes = [];
    const filteredLabels = [];
    const originalIndices = [];
    for (let j = 0; j < ramp.length; j++) {
      if (hiddenSet.has(j)) continue;
      hexes.push(ramp[j]);
      filteredLabels.push(labels[j]);
      originalIndices.push(j);
    }
    return { hexes, labels: filteredLabels, originalIndices };
  };

  // resolveBaseForRamp: returns the base hex to feed into generateRamp for
  // ramp `i`, applying any per-ramp saturation multiplier. The multiplier
  // adjusts the base's HSL saturation BEFORE generateRamp runs; the style
  // curves (Punchy/Balanced/Muted) then operate on the adjusted saturation
  // and produce a ramp with the new tonal feel. We deliberately do NOT
  // scale anywhere inside generateRamp itself since that would change its
  // byte-identity. Multiplier clamped to [0, 100] internally.
  const resolveBaseForRamp = (hex, baseIndex) => {
    const mult = rampSatOverrides[baseIndex];
    if (mult === undefined || mult === 1) return hex;
    const hsl = hexToHsl(hex);
    const newSat = Math.max(0, Math.min(100, hsl.s * mult));
    return hslToHex({ h: hsl.h, s: newSat, l: hsl.l });
  };

  // resolveSizeForRamp: returns the shade count for ramp `i`, applying any
  // per-ramp override. Falls back to the global rampSize.
  const resolveSizeForRamp = (baseIndex) => {
    const override = rampSizeOverrides[baseIndex];
    if (override && [4, 5, 6, 7, 8].includes(override)) return override;
    return rampSize;
  };

  // Active hardware palette object when locked, otherwise null. Resolved
  // here once so the ramp useMemos don't re-do the find on every iteration.
  const activeHardware = useMemo(() => {
    if (!hardwareLock) return null;
    return HARDWARE_PALETTES.find(hw => hw.id === hardwareLock) || null;
  }, [hardwareLock]);

  // applyHardwareLock: snap every shade to the nearest hardware color, then
  // dedupe consecutive duplicates (after the inner lightness sort in
  // generateRamp, duplicates land adjacent). Returns the snapped+deduped
  // ramp. When the hardware palette is small (Game Boy = 4 colors), an
  // 8-shade input ramp will collapse to <=4 unique entries. This is correct:
  // the platform CAN'T display more than 4 unique colors, so showing them
  // would be a lie.
  const applyHardwareLock = (ramp, hardware) => {
    if (!hardware || !hardware.colors || hardware.colors.length === 0) return ramp;
    const snapped = ramp.map(hex => quantizeToHardware(hex, hardware));
    // Dedupe consecutive duplicates while preserving lightness order. We
    // don't fully dedupe set-style because that could reorder things; the
    // input is already sorted by lightness (sortByLightness in generateRamp),
    // so consecutive dedupe preserves that order.
    const deduped = [];
    for (const hex of snapped) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== hex) {
        deduped.push(hex);
      }
    }
    return deduped;
  };

  // Adapter over generateRampNew that returns hex[] (matches the rest of the
  // pipeline, which works in flat hex arrays). Threads per-ramp curve + gamut
  // from local state. The old HSV engine took a positional `seed`; the new
  // perceptual engine is deterministic from (base, style, size, hueShift,
  // curve, gamut, satMult) — no jitter source needed.
  const generateRamp = (baseHex: string, numColors: number, style: 'punchy' | 'balanced' | 'muted', hueShiftStrength: number, rampIdx?: number): string[] => {
    const rampKey = rampIdx !== undefined ? String(rampIdx) : undefined;
    const curve = rampKey !== undefined ? curvePerRamp[rampKey] : undefined;
    const gamut = rampKey !== undefined ? gamutPerRamp[rampKey] : undefined;
    const shades = generateRampNew(baseHex, {
      style,
      size: numColors,
      hueShiftStrength,
      curve,
      gamut,
    });
    return shades.map(s => s.hex);
  };

  const rampsPunchy = useMemo(() => baseColors.map((c, i) => applyHardwareLock(applyOverrides(generateRamp(resolveBaseForRamp(c, i), resolveSizeForRamp(i), 'punchy', hueShiftStrength, i), i, overrides, 'punchy'), activeHardware)), [baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, activeHardware, hueShiftStrength, curvePerRamp, gamutPerRamp]);
  const rampsBalanced = useMemo(() => baseColors.map((c, i) => applyHardwareLock(applyOverrides(generateRamp(resolveBaseForRamp(c, i), resolveSizeForRamp(i), 'balanced', hueShiftStrength, i), i, overrides, 'balanced'), activeHardware)), [baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, activeHardware, hueShiftStrength, curvePerRamp, gamutPerRamp]);
  const rampsMuted = useMemo(() => baseColors.map((c, i) => applyHardwareLock(applyOverrides(generateRamp(resolveBaseForRamp(c, i), resolveSizeForRamp(i), 'muted', hueShiftStrength, i), i, overrides, 'muted'), activeHardware)), [baseColors, rampSize, overrides, rampSizeOverrides, rampSatOverrides, activeHardware, hueShiftStrength, curvePerRamp, gamutPerRamp]);
  const ramps = rampsPunchy; // legacy alias for places that just need a representative ramp

  const ALL_TOUR_GUIDES = useMemo(() => [ONBOARDING_TOUR, ...TASK_GUIDES], [])
  const activeTourTarget = useMemo(() => {
    if (!tourOpen || !tourGuideId) return null
    const guide = ALL_TOUR_GUIDES.find(g => g.id === tourGuideId)
    return guide?.steps[tourStep]?.target ?? null
  }, [tourOpen, tourGuideId, tourStep, ALL_TOUR_GUIDES])

  useEffect(() => {
    if (!activeTourTarget) return
    const el = document.querySelector(`[data-tour-id="${activeTourTarget}"]`)
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeTourTarget])

  // Resolve the safe anchor index: if harmonyAnchor is out of bounds (e.g.
  // briefly after a remove before the clamp effect runs, or after a load
  // restores fewer bases than were present before), fall back to 0.
  const safeAnchor = harmonyAnchor >= 0 && harmonyAnchor < baseColors.length ? harmonyAnchor : 0;
  const harmony = useMemo(() => {
    const raw = generateHarmony([baseColors[safeAnchor]]);
    if (!activeHardware) return raw;
    // Snap each harmony color to the nearest hardware-legal hex. This means
    // "Add complementary" etc. always produces a hardware-legal new base.
    // Without the snap, clicking Add would unlock the user from their own
    // constraint and silently add a non-legal color.
    const snapped = {};
    for (const key of Object.keys(raw)) {
      snapped[key] = quantizeToHardware(raw[key], activeHardware);
    }
    return snapped;
  }, [baseColors, safeAnchor, activeHardware]);
  const spriteLibrary = useMemo(() => ({ ...DEFAULT_SPRITE_LIBRARY, ...customSprites }), [customSprites]);

  const handleGenerate = () => {
    pendingLabelRef.current = mode === 'color' ? 'New palette' : 'Shuffle';
    if (mode === 'color') {
      setBaseColors([colorInput]); setAiReasoning(''); setAiColorNames([]);
      resetPaletteState();
      // Hard reset path: lockedRamps just got cleared. Bump shuffleSeed
      // directly rather than via bumpShuffleSeed, because the latter
      // reads the OLD lockedRamps closure value and would take the
      // lock-aware branch on a render where lock has already been
      // cleared in the same batched update.
      setShuffleSeed(s => s + 1);
    } else {
      // Non-reset path: respect existing lockedRamps so the user can
      // hold one ramp in place and Generate to re-roll only the others.
      bumpShuffleSeed();
    }
  };

  const handleAiGenerate = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true); setAiError(''); setAiReasoning(''); setAiColorNames([]);
    try {
      const cfg = getCachedAIConfig();
      if (!cfg) {
        setAiError('No AI provider configured. Click the gear icon to add one.');
        setAiReasoning('Configure an AI provider in settings (gear icon) to use AI Assist.');
        return;
      }
      const aiClient = createAIClient(cfg);
      const result = await generatePaletteFromPrompt(aiClient, cfg.model, `Pixel art palette for: ${aiInput}`);
      const hexes = (result.colors || []).filter(h => /^#[0-9a-fA-F]{6}$/.test(h));
      if (hexes.length === 0) throw new Error('No valid colors in AI response');
      const names = (result.names && result.names.length === result.colors.length)
        ? hexes.map((_, i) => result.names[i] || `Color ${i + 1}`)
        : hexes.map((_, i) => `Color ${i + 1}`);
      pendingLabelRef.current = 'AI generate';
      setBaseColors(hexes); setAiColorNames(names); setAiReasoning(result.description || '');
      resetPaletteState();
      setShuffleSeed(s => s + 1);
    } catch (err) {
      console.error(err);
      const msg = `Signal lost: ${err && err.message ? err.message : 'unknown error'}`;
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiRandom = async () => {
    setAiLoading(true); setAiError(''); setAiReasoning(''); setAiColorNames([]);
    try {
      const cfg = getCachedAIConfig();
      if (!cfg) {
        setAiError('No AI provider configured. Click the gear icon to add one.');
        setAiReasoning('Configure an AI provider in settings (gear icon) to use AI Assist.');
        return;
      }
      const seedHint = buildRandomDescription();
      const prompt = `Invent a creative pixel art subject and give me its palette. For variety, lean toward something in the spirit of: "${seedHint}" (but you can pick anything). Subject should be tangible (object/creature/scene), visually specific, and suited for pixel art. Use rich saturated colors at mid lightness. Include a "subject" field in your JSON with a short 2-5 word title for the subject you invented.`;
      const aiClient = createAIClient(cfg);
      const result = await generatePaletteFromPrompt(aiClient, cfg.model, prompt);
      const hexes = (result.colors || []).filter(h => /^#[0-9a-fA-F]{6}$/.test(h));
      if (hexes.length === 0) throw new Error('No valid colors in AI response');
      const names = (result.names && result.names.length === result.colors.length)
        ? hexes.map((_, i) => result.names[i] || `Color ${i + 1}`)
        : hexes.map((_, i) => `Color ${i + 1}`);
      pendingLabelRef.current = 'Surprise me';
      if (result.subject) setAiInput(result.subject);
      setBaseColors(hexes); setAiColorNames(names); setAiReasoning(result.description || '');
      resetPaletteState();
      setShuffleSeed(s => s + 1);
    } catch (err) {
      console.error(err);
      const msg = `Signal lost: ${err && err.message ? err.message : 'unknown error'}`;
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  const handleImageUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setImageError('Please upload an image file'); return; }
    setImageLoading(true); setImageError(''); setAiReasoning(''); setAiColorNames([]);
    // Reset zoom and naturalSize so the new image starts at 1x and the
    // onLoad handler captures fresh dimensions.
    setImageZoom(1);
    setImageNaturalSize({ width: 0, height: 0 });
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setImageDataUrl(dataUrl);
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 150;
          const scale = img.width > maxDim || img.height > maxDim ? Math.min(maxDim / img.width, maxDim / img.height) : 1;
          const w = Math.max(1, Math.floor(img.width * scale));
          const h = Math.max(1, Math.floor(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const colors = extractDominantColors(imageData, imageColorCount);
          if (colors.length === 0) { setImageError('No colors found'); setImageLoading(false); return; }
          const finalColors = colors.slice(0, imageColorCount);
          pendingLabelRef.current = 'Extract from image';
          setBaseColors(finalColors);
          setAiColorNames(finalColors.map((_, i) => `Color ${i + 1}`));
          resetPaletteState();
          setShuffleSeed(s => s + 1);
          setImageLoading(false);
        } catch (err) { setImageError('Failed: ' + err.message); setImageLoading(false); }
      };
      img.onerror = () => { setImageError('Failed to load'); setImageLoading(false); };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const reExtractFromImage = () => {
    if (!imageDataUrl) return;
    setImageLoading(true);
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 150;
        const scale = img.width > maxDim || img.height > maxDim ? Math.min(maxDim / img.width, maxDim / img.height) : 1;
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const colors = extractDominantColors(imageData, imageColorCount);
        const finalColors = colors.slice(0, imageColorCount);
        pendingLabelRef.current = 'Re-extract from image';
        setBaseColors(finalColors);
        setAiColorNames(finalColors.map((_, i) => `Color ${i + 1}`));
        resetPaletteState();
        setShuffleSeed(s => s + 1);
        setImageLoading(false);
      } catch (err) { setImageError('Failed: ' + err.message); setImageLoading(false); }
    };
    img.src = imageDataUrl;
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); if (mode === 'image') setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (mode !== 'image') return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageUpload(file);
  };

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

  useEffect(() => {
    window.electronAPI?.onUpdateAvailable?.((info) => setUpdateInfo(info));
    window.electronAPI?.onUpdateReady?.((info) => { setUpdateInfo(info); setUpdateReady(true); setUpdateDownloading(false); });
    window.electronAPI?.onUpdateError?.((err) => { console.error('Update failed:', err); setUpdateDownloading(false); setUpdateInfo(null); });
  }, []);

  useEffect(() => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ harmonyOpen, tipsOpen, hwPickerOpen, exportOpen, historyOpen, savedOpen, sbsOpen }))
  }, [harmonyOpen, tipsOpen, hwPickerOpen, exportOpen, historyOpen, savedOpen, sbsOpen]);

  function handleAISettingsClose() {
    setShowAISettings(false);
    setAiConfigured(getCachedAIConfig() !== null);
  }

  function handleTourMarkSeen() {
    localStorage.setItem('pixel-pal-tour-seen', '1');
  }

  useEffect(() => {
    const pasteHandler = (e) => {
      if (mode !== 'image') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) { handleImageUpload(file); break; }
        }
      }
    };
    if (mode === 'image') {
      window.addEventListener('paste', pasteHandler);
      return () => window.removeEventListener('paste', pasteHandler);
    }
  }, [mode]);

  const getPixelColorFromImage = (event) => {
    if (!imageDataUrl) return null;
    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const naturalX = Math.floor((x / rect.width) * img.naturalWidth);
    const naturalY = Math.floor((y / rect.height) * img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0);
    try {
      const data = ctx.getImageData(naturalX, naturalY, 1, 1).data;
      return { hex: rgbToHex(data[0], data[1], data[2]), alpha: data[3] };
    } catch { return null; }
  };

  const handleImageHover = (event) => {
    if (!eyedropperActive) return;
    const result = getPixelColorFromImage(event);
    if (result && result.alpha > 0) setHoveredColor(result.hex);
  };

  const handleImageLeave = () => setHoveredColor(null);

  const handleImageClick = (event) => {
    if (!eyedropperActive) return;
    const result = getPixelColorFromImage(event);
    if (!result || result.alpha < 128) return;
    if (!baseColors.includes(result.hex)) {
      pendingLabelRef.current = 'Eyedropper add';
      setBaseColors(prev => [...prev, result.hex]);
      setAiColorNames(prev => {
        const padded = [...prev];
        while (padded.length < baseColors.length) padded.push('');
        padded.push('Eyedropper');
        return padded;
      });
      // Non-reset path: respect lockedRamps. New ramp (just appended) is
      // unlocked by default, so it'll receive the offset bump like any
      // other unlocked ramp.
      bumpShuffleSeed();
    }
  };

  // ----- Image Remap Preview handlers -----
  // The visible-palette computation matches what the Visualization section
  // shows in mosaic/lightness/chromatic plot. We compute it lazily inside
  // refreshRemap so it always reflects the current state (vizStyle, hidden
  // shades, hardware lock all baked in through the ramp memos). Pulling
  // from the same activeRamps the viz uses guarantees parity.
  //
  // Performance note: the source image is downsampled to remapMaxDimension
  // (default 512) on the longer axis before the actual remap. This keeps
  // Floyd-Steinberg responsive on photographic inputs and matches the
  // worst-case bounds in IMAGE_REMAP_PLAN.md.
  const REMAP_MAX_DIMENSION = 512;

  // Compute the active palette for remap. Reads vizStyle and the active
  // ramp memo for that style, filters hidden shades, dedupes. The result
  // is the SAME flat hex set the chromatic plot dots come from.
  const getActiveRemapPalette = () => {
    const rampsForStyle = vizStyle === 'balanced' ? rampsBalanced
                       : vizStyle === 'muted'    ? rampsMuted
                       :                            rampsPunchy;
    const visible = rampsForStyle.map((ramp, i) => {
      const effectiveBase = resolveBaseForRamp(baseColors[i], i);
      const labels = labelsForRamp(ramp, effectiveBase);
      return filterHidden(ramp, labels, i).hexes;
    });
    const all = visible.flat();
    // Dedupe while preserving order; the remapper does not need uniqueness
    // for correctness but a smaller palette is faster.
    const seen = new Set();
    const out = [];
    for (const hex of all) {
      const k = hex.toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(hex); }
    }
    return out;
  };

  // Build a signature string capturing the inputs that produced a remap
  // output. Two outputs are considered "the same" iff their signatures
  // match. Used by the stale-output badge: when the live signature
  // differs from remapOutputSignature, the user sees a warning.
  //
  // Includes: dither mode, the active palette (joined), the active style.
  // Excludes: the image itself (a new image always triggers a fresh remap
  // through its own code path, not the stale-badge logic).
  const buildRemapSignature = (paletteColors, dither) => {
    return dither + '|' + paletteColors.map(c => c.toLowerCase()).join(',');
  };

  // Handle a freshly-uploaded image for the remap panel. Stores the data
  // URL and the natural size, clears any prior output, and clears any
  // previous error. Also picks an appropriate default export scale based
  // on the upload's natural size: 1x if it fits under the 8192px ceiling,
  // otherwise the largest available scale <= 1.
  const handleRemapImageUpload = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setRemapError('Please upload an image file');
      return;
    }
    setRemapError('');
    setRemapOutput(null);
    setRemapOutputSignature(null);
    setRemapImageName(file.name || 'image');
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const probe = new Image();
      probe.onload = () => {
        const nw = probe.naturalWidth;
        const nh = probe.naturalHeight;
        setRemapImageNaturalSize({ w: nw, h: nh });
        setRemapImageDataUrl(dataUrl);
        // Pick the default export scale: prefer 1x when valid, else the
        // largest available <= 1. Compute the options synchronously here
        // since the dropdown render does the same computation; staying in
        // lock-step with the dropdown's options avoids a flash of an
        // invalid value.
        const opts = computeRemapScaleOptions(nw, nh, 8192);
        let pick = 1;
        if (opts.includes(1)) {
          pick = 1;
        } else {
          // Largest option <= 1, or smallest option if none <= 1.
          const leOne = opts.filter(s => s <= 1);
          pick = leOne.length > 0 ? leOne[leOne.length - 1] : (opts[0] || 1);
        }
        setRemapDownloadScale(pick);
        setRemapDownloadConfirmPending(false);
        if (remapDownloadConfirmTimerRef.current) {
          clearTimeout(remapDownloadConfirmTimerRef.current);
          remapDownloadConfirmTimerRef.current = null;
        }
      };
      probe.onerror = () => { setRemapError('Failed to load image'); };
      probe.src = dataUrl;
    };
    reader.onerror = () => { setRemapError('Failed to read file'); };
    reader.readAsDataURL(file);
  };

  // Clear the uploaded image and all derived state.
  const clearRemapImage = () => {
    setRemapImageDataUrl(null);
    setRemapImageNaturalSize(null);
    setRemapImageName('');
    setRemapOutput(null);
    setRemapOutputSignature(null);
    setRemapError('');
    setRemapDownloadConfirmPending(false);
    if (remapDownloadConfirmTimerRef.current) {
      clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = null;
    }
  };

  // The actual remap: loads the data URL into an Image, draws to a
  // canvas (downsampling if needed with imageSmoothingEnabled=false to
  // preserve pixel-art aesthetics), reads ImageData, and calls
  // remapImageToPalette. The result is stored in remapOutput and a fresh
  // signature is captured.
  //
  // Wrapped in setTimeout(..., 0) so React renders the "Computing..."
  // badge before the synchronous remap work begins. Otherwise the loading
  // flag would only render AFTER the work finished (the work blocks the
  // main thread).
  const refreshRemap = () => {
    if (!remapImageDataUrl) {
      setRemapError('No image loaded');
      return;
    }
    setRemapError('');
    setRemapLoading(true);
    setTimeout(() => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const palette = getActiveRemapPalette();
            // Downsample to REMAP_MAX_DIMENSION on the longer axis.
            const longer = Math.max(img.naturalWidth, img.naturalHeight);
            const scale = longer > REMAP_MAX_DIMENSION ? REMAP_MAX_DIMENSION / longer : 1;
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            // Nearest-neighbor on downsample: preserve source pixel hexes
            // and the pixel-art aesthetic. See IMAGE_REMAP_PLAN.md G4.
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, w, h);
            const source = ctx.getImageData(0, 0, w, h);
            const result = remapImageToPalette(source, palette, { dither: remapDither });
            setRemapOutput(result);
            setRemapOutputSignature(buildRemapSignature(palette, remapDither));
            setRemapLoading(false);
          } catch (err) {
            setRemapError('Failed: ' + (err && err.message ? err.message : 'unknown error'));
            setRemapLoading(false);
          }
        };
        img.onerror = () => {
          setRemapError('Failed to decode image');
          setRemapLoading(false);
        };
        img.src = remapImageDataUrl;
      } catch (err) {
        setRemapError('Failed: ' + (err && err.message ? err.message : 'unknown error'));
        setRemapLoading(false);
      }
    }, 0);
  };

  // Canvas ref for drawing the remap output.
  const remapCanvasRef = useRef(null);
  // Canvas refs for the Side-by-Side image preview row (one per slot).
  const sbsLeftRemapCanvasRef = useRef(null);
  const sbsRightRemapCanvasRef = useRef(null);

  // Auto-refresh the main Image Preview on any relevant state change.
  // Debounced 300ms so slider drags (hue shift strength, HSV editor
  // sliders) and rapid clicks (style toggle, hidden-shade toggling)
  // coalesce into a single remap rather than firing one per change.
  //
  // The trigger is `livePaletteSig`, a string capturing the active
  // palette plus dither mode (computed in the render body below from
  // `buildRemapSignature(getActiveRemapPalette(), remapDither)`).
  // React tracks all the underlying palette state because the sig
  // string is recomputed every render, so any change that affects
  // the active palette also changes the sig string. We then key the
  // useEffect on the SIG (plus remapImageDataUrl for the upload-
  // arrival case), which is stable across renders that don't change
  // the palette.
  //
  // Refresh button removed: the Refresh control existed because we
  // used to require explicit opt-in to the (potentially slow) remap.
  // With debouncing in place the auto-fire is responsive enough that
  // a manual trigger is redundant; the stale-output badge is also
  // gone for the same reason (steady state is never stale).
  //
  // The remapDither dep stays IMPLICIT via livePaletteSig (the sig
  // includes the dither mode). Keeping it out of the deps array
  // avoids double-firing on dither change (sig changes -> effect
  // fires; remapDither change as a separate dep -> effect fires
  // again on the next render). Same reasoning for vizStyle etc.
  const livePaletteSig = remapImageDataUrl
    ? buildRemapSignature(getActiveRemapPalette(), remapDither)
    : '';
  useEffect(() => {
    if (!remapImageDataUrl) return;
    const timer = setTimeout(() => {
      refreshRemap();
    }, 300);
    return () => clearTimeout(timer);
    // refreshRemap reads closure state; the sig is the canonical
    // change indicator. ESLint can't infer this; suppress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapImageDataUrl, livePaletteSig]);

  // Draw the remapped pixels to the on-screen canvas whenever the
  // output changes. Using a ref + effect avoids redrawing on every
  // unrelated render, which would be wasteful for a 512x512 canvas.
  useEffect(() => {
    const canvas = remapCanvasRef.current;
    if (!canvas) return;
    if (!remapOutput || remapOutput.width === 0) return;
    canvas.width = remapOutput.width;
    canvas.height = remapOutput.height;
    const ctx = canvas.getContext('2d');
    try {
      const imgData = new ImageData(remapOutput.data, remapOutput.width, remapOutput.height);
      ctx.putImageData(imgData, 0, 0);
    } catch {
      // Fallback for environments where the ImageData ctor is unavailable:
      // use createImageData and copy bytes manually.
      const imgData = ctx.createImageData(remapOutput.width, remapOutput.height);
      imgData.data.set(remapOutput.data);
      ctx.putImageData(imgData, 0, 0);
    }
  }, [remapOutput]);

  // Draw the SBS slot remap outputs to their canvases when they change.
  // Identical pattern to the main remap canvas effect; one effect per
  // slot. When the SBS panel is collapsed the refs are null and these
  // effects no-op (refs only attach to mounted JSX).
  useEffect(() => {
    const canvas = sbsLeftRemapCanvasRef.current;
    if (!canvas) return;
    if (!sbsLeftRemap || sbsLeftRemap.width === 0) return;
    canvas.width = sbsLeftRemap.width;
    canvas.height = sbsLeftRemap.height;
    const ctx = canvas.getContext('2d');
    try {
      const imgData = new ImageData(sbsLeftRemap.data, sbsLeftRemap.width, sbsLeftRemap.height);
      ctx.putImageData(imgData, 0, 0);
    } catch {
      const imgData = ctx.createImageData(sbsLeftRemap.width, sbsLeftRemap.height);
      imgData.data.set(sbsLeftRemap.data);
      ctx.putImageData(imgData, 0, 0);
    }
  }, [sbsLeftRemap]);
  useEffect(() => {
    const canvas = sbsRightRemapCanvasRef.current;
    if (!canvas) return;
    if (!sbsRightRemap || sbsRightRemap.width === 0) return;
    canvas.width = sbsRightRemap.width;
    canvas.height = sbsRightRemap.height;
    const ctx = canvas.getContext('2d');
    try {
      const imgData = new ImageData(sbsRightRemap.data, sbsRightRemap.width, sbsRightRemap.height);
      ctx.putImageData(imgData, 0, 0);
    } catch {
      const imgData = ctx.createImageData(sbsRightRemap.width, sbsRightRemap.height);
      imgData.data.set(sbsRightRemap.data);
      ctx.putImageData(imgData, 0, 0);
    }
  }, [sbsRightRemap]);

  // Download the current remap as a PNG at the configured scale.
  //
  // Pipeline:
  //   1. Compute the export dimensions: floor(naturalSize * scale).
  //   2. Estimate cost; if it exceeds the warn threshold and the user
  //      has not yet confirmed (remapDownloadConfirmPending), arm the
  //      two-click confirmation and stop. The second click within 5
  //      seconds commits.
  //   3. Decode remapImageDataUrl into an Image at its full natural size.
  //   4. Draw it onto a canvas at export dimensions with
  //      imageSmoothingEnabled = false. This gives us a fresh ImageData
  //      at the actual export resolution that the remap runs against.
  //   5. Run remapImageToPalette against THAT image with the current
  //      dither setting. The remap math runs on real pixels, not on
  //      upscaled preview pixels. Result is a true full-resolution PNG.
  //   6. Render the result to an export canvas and toBlob it.
  //
  // Notes:
  //   - We do NOT use the cached remapOutput. That is the downsampled
  //     PREVIEW; export does its own full-res computation so the user
  //     gets pixel-accurate output for their actual upload size.
  //   - For very large outputs (e.g. 4K Floyd-Steinberg), the work
  //     happens synchronously on the main thread and can freeze the tab.
  //     The warn-then-confirm guard exists precisely for this case.
  //   - Wrapped in setTimeout(..., 0) for the same reason refreshRemap
  //     is: gives React a chance to paint the "Computing..." badge
  //     before the freeze.
  const downloadRemap = () => {
    if (!remapImageDataUrl || !remapImageNaturalSize) {
      setRemapError('No image loaded');
      return;
    }
    const scale = (typeof remapDownloadScale === 'number' && remapDownloadScale > 0) ? remapDownloadScale : 1;
    const exportW = Math.max(1, Math.floor(remapImageNaturalSize.w * scale));
    const exportH = Math.max(1, Math.floor(remapImageNaturalSize.h * scale));
    // Cost projection: use the active palette size and the current dither
    // mode. Warn threshold is 50M distance ops (about 10 seconds of
    // main-thread freeze at 200ns / op). Only the heavy combinations
    // trigger the warning; small images and no-dither at moderate
    // resolutions pass through silently.
    const activePalette = getActiveRemapPalette();
    const projectedCost = estimateRemapCost(exportW, exportH, activePalette.length, remapDither);
    const WARN_THRESHOLD = 50000000;
    if (projectedCost > WARN_THRESHOLD && !remapDownloadConfirmPending) {
      setRemapDownloadConfirmPending(true);
      if (remapDownloadConfirmTimerRef.current) clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = setTimeout(() => {
        setRemapDownloadConfirmPending(false);
        remapDownloadConfirmTimerRef.current = null;
      }, 5000);
      return;
    }
    // Commit path: either cost is under threshold, or the user has
    // confirmed. Disarm the confirmation if it was armed.
    if (remapDownloadConfirmTimerRef.current) {
      clearTimeout(remapDownloadConfirmTimerRef.current);
      remapDownloadConfirmTimerRef.current = null;
    }
    setRemapDownloadConfirmPending(false);
    setRemapError('');
    setRemapLoading(true);
    setTimeout(() => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            // Draw the upload into a canvas at the EXPORT dimensions with
            // nearest-neighbor scaling. This produces the source for the
            // remap run. For scale = 1 the canvas matches natural size.
            // For scale < 1 we downsample; for scale > 1 we upsample.
            // In both cases imageSmoothingEnabled=false preserves the
            // pixel-art aesthetic.
            const sourceCanvas = document.createElement('canvas');
            sourceCanvas.width = exportW;
            sourceCanvas.height = exportH;
            const sourceCtx = sourceCanvas.getContext('2d');
            sourceCtx.imageSmoothingEnabled = false;
            sourceCtx.drawImage(img, 0, 0, exportW, exportH);
            const sourceImageData = sourceCtx.getImageData(0, 0, exportW, exportH);

            // Run the SAME remap helper on the export-resolution source.
            const result = remapImageToPalette(sourceImageData, activePalette, { dither: remapDither });

            // Write the result to a fresh canvas and export.
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = result.width;
            exportCanvas.height = result.height;
            const exportCtx = exportCanvas.getContext('2d');
            try {
              const imgData = new ImageData(result.data, result.width, result.height);
              exportCtx.putImageData(imgData, 0, 0);
            } catch {
              const imgData = exportCtx.createImageData(result.width, result.height);
              imgData.data.set(result.data);
              exportCtx.putImageData(imgData, 0, 0);
            }

            // Filename: sanitize the original upload name (extension
            // stripped, lowercased, non-alphanumeric chars normalized to
            // dashes) and append -remapped-{scale-tag}.png. The scale
            // tag formats integer scales as "{n}x" and fractional scales
            // as "0p25x" etc. so the filename is shell-friendly.
            const sanitize = (s) => s.replace(/\.[^.]+$/, '').toLowerCase().replace(/[\s.]+/g, '-').replace(/[^a-z0-9-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
            const scaleTag = Number.isInteger(scale)
              ? scale + 'x'
              : scale.toString().replace('.', 'p') + 'x';
            const base = remapImageName ? sanitize(remapImageName) : '';
            const filename = (base || 'remapped') + '-remapped-' + scaleTag + '.png';

            exportCanvas.toBlob(async (blob) => {
              if (!blob) {
                setRemapError('Failed to encode PNG');
                setRemapLoading(false);
                return;
              }
              const result = await saveFile({
                defaultName: filename,
                filters: [{ name: 'PNG image', extensions: ['png'] }],
                data: { bytes: blob },
                folderKey: 'png',
              });
              if (!result.ok && !result.canceled) {
                setRemapError('Failed to save PNG');
              }
              setRemapLoading(false);
            }, 'image/png');
          } catch (err) {
            setRemapError('Download failed: ' + (err && err.message ? err.message : 'unknown error'));
            setRemapLoading(false);
          }
        };
        img.onerror = () => {
          setRemapError('Failed to decode source image for export');
          setRemapLoading(false);
        };
        img.src = remapImageDataUrl;
      } catch (err) {
        setRemapError('Download failed: ' + (err && err.message ? err.message : 'unknown error'));
        setRemapLoading(false);
      }
    }, 0);
  };

  // randomizeColor: roll a new random hex into the colorInput field. Does
  // NOT touch baseColors, the ramp customizations, or history. The user
  // decides what to do with the new hex by clicking Add base (append it
  // to the palette) or New palette (replace the palette with this hex).
  //
  // Previous behavior: destructive replace, same as handleGenerate. That
  // got reported as confusing during usability session 2 followup work:
  // a user wanting to "roll until I see something good, then add it" had
  // no way to do that because every roll wiped their pins/locks/anchor.
  // The non-destructive contract matches the AI tab's Random button which
  // only updates aiInput.
  const randomizeColor = () => {
    setColorInput(buildRandomHex());
  };

  // Add the current Single Color tab's colorInput to baseColors as a new
  // base, without leaving the Single Color tab. Lets users batch-build a
  // multi-base palette by picking colors one at a time. The colorInput
  // state stays as-is so the user can keep adjusting.
  // Duplicate detection: case-insensitive hex compare. On a duplicate we
  // do NOT add a second entry; the feedback message becomes "Already in
  // palette" rather than the success count. Hex is normalized to lowercase
  // before write to match the storage convention used elsewhere.
  const addColorAsBase = () => {
    if (!/^#[0-9a-fA-F]{6}$/.test(colorInput)) {
      setAddBaseFeedback('Invalid hex');
      setTimeout(() => setAddBaseFeedback(''), 2000);
      return;
    }
    const norm = colorInput.toLowerCase();
    const alreadyPresent = baseColors.some(h => h.toLowerCase() === norm);
    if (alreadyPresent) {
      setAddBaseFeedback('Already in palette');
      setTimeout(() => setAddBaseFeedback(''), 2000);
      return;
    }
    const newLen = baseColors.length + 1;
    pendingLabelRef.current = 'Add base color';
    setRampSizeOverrides(prev => ({ ...prev, [baseColors.length]: rampSize }));
    setBaseColors(prev => [...prev, norm]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(`Color ${newLen}`);
      return padded;
    });
    setAddBaseFeedback(`Added: now ${newLen} ramp${newLen === 1 ? '' : 's'}`);
    setTimeout(() => setAddBaseFeedback(''), 2000);
  };

  const addHarmonyColor = (hex, name) => {
    if (baseColors.includes(hex)) return;
    setBaseColors(prev => [...prev, hex]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(name);
      return padded;
    });
  };

  const addHarmonyPair = (hex1, hex2, name1, name2) => {
    const toAdd = [], namesToAdd = [];
    if (!baseColors.includes(hex1)) { toAdd.push(hex1); namesToAdd.push(name1); }
    if (!baseColors.includes(hex2) && hex1 !== hex2) { toAdd.push(hex2); namesToAdd.push(name2); }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  };

  // N-ary version for tetradic/square which add 3 derived colors (the base
  // itself is already a ramp). Skips any color that's already in baseColors
  // and any duplicate among the input pairs.
  const addHarmonyMany = (pairs) => {
    const toAdd = [], namesToAdd = [];
    for (const { hex, name } of pairs) {
      if (baseColors.includes(hex)) continue;
      if (toAdd.includes(hex)) continue;
      toAdd.push(hex);
      namesToAdd.push(name);
    }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  };

  const removeRamp = (index) => {
    setBaseColors(prev => prev.filter((_, i) => i !== index));
    setAiColorNames(prev => prev.filter((_, i) => i !== index));
    // Keep editingIndex consistent with the new array. If the removed ramp was
    // the one being edited, close the editor. If a ramp before the edited one
    // was removed, the edited ramp shifts down by 1.
    setEditingIndex(prev => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
    // Per-shade overrides: drop the removed base's overrides entirely, and
    // shift later bases' keys down by 1 to match the new baseColors array.
    setOverrides(prev => {
      const next = {};
      for (const k of Object.keys(prev)) {
        const idx = Number(k);
        if (idx === index) continue; // dropped
        const newIdx = idx > index ? idx - 1 : idx;
        next[newIdx] = prev[k];
      }
      return next;
    });
    // If the pin editor was on the removed ramp, close it. Otherwise shift its
    // baseIndex down if a ramp before it was removed.
    setPinEditor(prev => {
      if (!prev) return null;
      if (prev.baseIndex === index) return null;
      if (prev.baseIndex > index) return { ...prev, baseIndex: prev.baseIndex - 1 };
      return prev;
    });
    // Compare anchor: same shift logic. If the anchor's ramp was removed,
    // clear the anchor (and any in-flight result) so the user has to pick
    // a new one. Otherwise shift the baseIndex down by 1 if a ramp before
    // it was removed.
    setCompareAnchor(prev => {
      if (!prev) return null;
      if (prev.baseIndex === index) {
        setCompareResult(null);
        return null;
      }
      if (prev.baseIndex > index) return { ...prev, baseIndex: prev.baseIndex - 1 };
      return prev;
    });
    // Harmony anchor: if the anchor ramp was removed, fall back to 0. If a
    // ramp before the anchor was removed, shift the anchor down by 1 so it
    // keeps pointing at the same color. The safeAnchor read above also
    // guards against any one-frame staleness here.
    setHarmonyAnchor(prev => {
      if (prev === index) return 0;
      if (prev > index) return prev - 1;
      return prev;
    });
    // Same shift logic for per-ramp size and saturation overrides.
    const shiftBaseKeyedMap = (prev) => {
      const next = {};
      for (const k of Object.keys(prev)) {
        const idx = Number(k);
        if (idx === index) continue;
        const newIdx = idx > index ? idx - 1 : idx;
        next[newIdx] = prev[k];
      }
      return next;
    };
    setRampSizeOverrides(shiftBaseKeyedMap);
    setRampSatOverrides(shiftBaseKeyedMap);
    setHiddenShades(shiftBaseKeyedMap);
    setRampShuffleOffsets(shiftBaseKeyedMap);
    // collapsedRamps is a Set, not an object map. Same shift semantics:
    // drop the removed index, shift later indices down by 1.
    setCollapsedRamps(prev => {
      const next = new Set();
      for (const idx of prev) {
        if (idx === index) continue;
        next.add(idx > index ? idx - 1 : idx);
      }
      return next;
    });
    // lockedRamps follows the same Set-shift semantics as collapsedRamps.
    // If the removed ramp itself was locked, the lock is implicitly
    // dropped (the ramp no longer exists); other locked ramps shift
    // down by 1 if they sat after the removed index.
    setLockedRamps(prev => {
      const next = new Set();
      for (const idx of prev) {
        if (idx === index) continue;
        next.add(idx > index ? idx - 1 : idx);
      }
      return next;
    });
  };

  // duplicateRamp: append a copy of ramp `i` at the end of baseColors,
  // carrying over every per-base-keyed setting (overrides, size override,
  // sat override, hidden shades, ramp shuffle offset, ai color name). The
  // new index is N = baseColors.length BEFORE the append, since we
  // append rather than insert. No existing indices shift, so other
  // base-keyed state doesn't need shifting.
  //
  // lockedRamps is deliberately NOT carried over: the typical reason
  // to duplicate is to vary the duplicate, so starting it unlocked is
  // the useful default.
  //
  // collapsedRamps is left to the existing auto-collapse useEffect
  // (collapses newly-appended indices when total >= 3).
  //
  // v0.6 perceptual engine: the new generateRamp ignores seed. Output is
  // deterministic from (base, style, size, hueShift, curve, gamut, satMult).
  // Since duplicateRamp carries over every per-base setting that the engine
  // reads, the duplicate is byte-identical to the source. The seed formula
  // `shuffleSeed * 17 + i * 31 + offset * 13` is still computed and passed
  // through the adapter shim, but the new engine drops the value — so the
  // N != i discrepancy from the old HSV engine no longer matters.
  const duplicateRamp = (i) => {
    if (i < 0 || i >= baseColors.length) return;
    pendingLabelRef.current = 'Duplicate ramp';
    // Deep-clone helper for per-base entries. Plain JSON is sufficient:
    // the contents are POJO maps / arrays / primitives.
    const deepClone = (entry) => (entry === undefined ? undefined : JSON.parse(JSON.stringify(entry)));
    // Generic appender for sparse base-keyed maps: writes the cloned
    // source entry at index N (the position after append).
    const appendDup = (map) => {
      if (!Object.prototype.hasOwnProperty.call(map, i)) return map;
      const N = baseColors.length;
      return { ...map, [N]: deepClone(map[i]) };
    };
    setBaseColors(prev => [...prev, prev[i]]);
    setAiColorNames(prev => [...prev, prev[i] !== undefined ? prev[i] : '']);
    setOverrides(appendDup);
    setRampSizeOverrides(appendDup);
    setRampSatOverrides(appendDup);
    setHiddenShades(appendDup);
    setRampShuffleOffsets(appendDup);
    setExportFeedback('Duplicated ramp');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Open/close the base-color editor for ramp `index`. Toggling the same index
  // closes it. Opening a different index switches and re-seeds editorHsv from
  // that ramp's current base color.
  const toggleBaseEditor = (index) => {
    if (editingIndex === index) {
      setEditingIndex(null);
      return;
    }
    const hex = baseColors[index];
    if (hex) {
      const hsv = hexToHsv(hex);
      // Round H/S/V for display so the sliders show clean integers initially.
      setEditorHsv({ h: Math.round(hsv.h), s: Math.round(hsv.s), v: Math.round(hsv.v) });
    }
    setEditingIndex(index);
    // If the ramp card is collapsed, auto-expand so the editor's effect
    // on the swatches is visible. Otherwise the user clicks edit and
    // nothing visible changes below the icon row.
    setCollapsedRamps(prev => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  // Commit an HSV update from the editor: writes the corresponding hex back to
  // baseColors[editingIndex] and updates the local HSV state. Called on every
  // slider drag, so it needs to be cheap. We deliberately do NOT bump
  // shuffleSeed; that would re-randomize jitter on every nudge, making the
  // edit feel disconnected from the user's input.
  const updateEditorHsv = (next) => {
    setEditorHsv(next);
    if (editingIndex === null) return;
    const hex = hsvToHex(next);
    setBaseColors(prev => prev.map((c, i) => i === editingIndex ? hex : c));
  };

  // Commit a hex update from the color picker: writes hex through, then syncs
  // the editor's HSV display so the sliders reflect the new value. The picker
  // can produce arbitrary 24-bit values that don't correspond to round HSV
  // numbers, so we let the displayed HSV show the actual derived values.
  const updateEditorHex = (hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const hsv = hexToHsv(hex);
    setEditorHsv({ h: Math.round(hsv.h), s: Math.round(hsv.s), v: Math.round(hsv.v) });
    if (editingIndex === null) return;
    setBaseColors(prev => prev.map((c, i) => i === editingIndex ? hex : c));
  };

  // ---------- Per-shade override helpers ----------
  // Overrides are keyed by (baseIndex, shadeIndex, style). isShadePinned
  // tests for a pin in one specific style; setOverride writes one; clearOverride
  // removes one and prunes empty containers up the tree.
  const isShadePinned = (baseIndex, shadeIndex, style) => {
    const inner = overrides[baseIndex];
    if (!inner) return false;
    const styleMap = inner[shadeIndex];
    if (!styleMap || typeof styleMap !== 'object') return false;
    return typeof styleMap[style] === 'string';
  };

  // togglePinEditor: handle a click on the pin button for (base, shade, style).
  // Three cases, evaluated in this order:
  //   1. Already pinned -> unpin. ALSO close the editor if it was open on
  //      this exact triple, otherwise leave any other editor alone. This
  //      ordering matters: a previous version checked the "editor open on
  //      me" branch first and returned without unpinning, which made
  //      unpinning a swatch with its own editor open take two clicks
  //      (one to close, one to unpin). The pin button is a binary toggle
  //      first, an editor-summoner second.
  //   2. Editor already open on this exact triple (not pinned) -> close
  //      it. This is the dismiss path for the "I pinned then changed my
  //      mind without adjusting" case.
  //   3. Not pinned, editor closed (or open elsewhere) -> commit the
  //      current displayed hex as the pin and open the editor so the
  //      user can adjust if they want.
  // Re-editing a pin is not a direct flow: click unpins, click again
  // re-pins to the new current computed shade. This keeps the pin button
  // a clear binary toggle, matching the user's mental model.
  const togglePinEditor = (baseIndex, shadeIndex, style, currentHex) => {
    if (isShadePinned(baseIndex, shadeIndex, style)) {
      clearOverride(baseIndex, shadeIndex, style);
      // If the editor was open on this exact triple, close it. Editors on
      // other swatches stay where they are.
      if (pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex && pinEditor.style === style) {
        setPinEditor(null);
      }
      return;
    }
    if (pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex && pinEditor.style === style) {
      setPinEditor(null);
      return;
    }
    if (typeof currentHex === 'string') {
      setOverride(baseIndex, shadeIndex, style, currentHex);
    }
    setPinEditor({ baseIndex, shadeIndex, style });
  };

  // setOverride: write or update the pinned hex for (baseIndex, shadeIndex, style).
  const setOverride = (baseIndex, shadeIndex, style, hex) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    if (!['punchy', 'balanced', 'muted'].includes(style)) return;
    const norm = hex.toLowerCase();
    setOverrides(prev => {
      const baseEntry = prev[baseIndex] ? { ...prev[baseIndex] } : {};
      const styleMap = baseEntry[shadeIndex] ? { ...baseEntry[shadeIndex] } : {};
      styleMap[style] = norm;
      baseEntry[shadeIndex] = styleMap;
      return { ...prev, [baseIndex]: baseEntry };
    });
  };

  // clearOverride: remove the pin for (baseIndex, shadeIndex, style). If
  // that shade entry has no remaining styles, drop the shade key. If the
  // base entry has no remaining shade keys, drop the base entry too. This
  // keeps the map sparse so save payloads stay small for mostly-unpinned
  // palettes.
  const clearOverride = (baseIndex, shadeIndex, style) => {
    setOverrides(prev => {
      if (!prev[baseIndex]) return prev;
      const baseEntry = { ...prev[baseIndex] };
      const styleMap = baseEntry[shadeIndex] ? { ...baseEntry[shadeIndex] } : null;
      if (!styleMap || !(style in styleMap)) return prev;
      delete styleMap[style];
      if (Object.keys(styleMap).length === 0) {
        delete baseEntry[shadeIndex];
      } else {
        baseEntry[shadeIndex] = styleMap;
      }
      const next = { ...prev };
      if (Object.keys(baseEntry).length === 0) {
        delete next[baseIndex];
      } else {
        next[baseIndex] = baseEntry;
      }
      return next;
    });
  };

  // hideShade: mark a (baseIndex, shadeIndex) as hidden across all three
  // styles for that base. Refuses to hide the last visible shade so a
  // ramp never renders empty. rampLen is the full pre-filter ramp length
  // for that base; caller passes it (rampsPunchy[baseIndex].length is
  // canonical since all three styles have the same length).
  const hideShade = (baseIndex, shadeIndex, rampLen) => {
    const currentHidden = Array.isArray(hiddenShades[baseIndex]) ? hiddenShades[baseIndex] : [];
    if (currentHidden.includes(shadeIndex)) return; // already hidden
    const wouldBeHidden = currentHidden.length + 1;
    if (wouldBeHidden >= rampLen) {
      // Last visible shade; refuse.
      setExportFeedback('Cannot hide the last visible shade');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    setHiddenShades(prev => {
      const next = { ...prev };
      const existing = Array.isArray(next[baseIndex]) ? next[baseIndex] : [];
      next[baseIndex] = [...existing, shadeIndex].sort((a, b) => a - b);
      return next;
    });
    // If the pin editor was open on this shade for any style, close it
    // since the shade is no longer interactable.
    if (pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex) {
      setPinEditor(null);
    }
  };

  // resetHiddenShades: restore every hidden shade for one base.
  const resetHiddenShades = (baseIndex) => {
    setHiddenShades(prev => {
      if (!prev[baseIndex]) return prev;
      const next = { ...prev };
      delete next[baseIndex];
      return next;
    });
  };

  // shuffleRamp: bump the per-ramp shuffle offset for one base, causing
  // just that ramp to re-jitter while leaving every other ramp's
  // generator output identical. This is distinct from the global
  // shuffleSeed which re-jitters every ramp at once.
  //
  // Locked ramps are silently skipped: re-jittering a locked ramp would
  // contradict the lock contract. The per-ramp dice button on the ramp
  // card is itself hidden for locked ramps, but we double-gate here in
  // case any other caller invokes shuffleRamp programmatically.
  const shuffleRamp = (baseIndex) => {
    if (lockedRamps.has(baseIndex)) return;
    setRampShuffleOffsets(prev => ({
      ...prev,
      [baseIndex]: (prev[baseIndex] || 0) + 1,
    }));
  };

  // bumpShuffleSeed: lock-aware replacement for `setShuffleSeed(s => s + 1)`
  // used by global Generate / dice / image-eyedropper handlers. If nothing
  // is locked, behaves identically to the old call (so existing palettes
  // and tests are unaffected). If at least one ramp is locked, we instead
  // bump rampShuffleOffsets[i] by 1 for every UNLOCKED ramp, and leave
  // shuffleSeed untouched. This re-jitters unlocked ramps (changing the
  // per-ramp seed by +13 instead of +17, but the user only sees that
  // their unlocked ramps changed, which is what they asked for) and
  // leaves locked ramps byte-identical to before the click.
  //
  // The asymmetry between +17 (old, all ramps) and +13 (new, unlocked
  // only) is harmless: the seed formula already mixes both contributors
  // (shuffleSeed * 17 + offset * 13), so both are valid shuffle steps.
  // The only observable difference would be in tests pinning specific
  // hex outputs to specific (shuffleSeed, offset) pairs; the test suite
  // doesn't do that.
  //
  // Called by: handleGenerate (non-reset path), handleAiGenerate,
  // surpriseMe, image extract handlers, handleImageClick eyedropper
  // append, and any other "global shuffle" entry point. Hard-reset
  // entry points (loadClassicPalette, applyGplImport, randomizeColor,
  // load-from-storage) bypass this helper and call setShuffleSeed
  // directly because they're wiping ALL state including lockedRamps.
  const bumpShuffleSeed = () => {
    if (lockedRamps.size === 0) {
      setShuffleSeed(s => s + 1);
      return;
    }
    setRampShuffleOffsets(prev => {
      const next = { ...prev };
      for (let i = 0; i < baseColors.length; i++) {
        if (lockedRamps.has(i)) continue;
        next[i] = (next[i] || 0) + 1;
      }
      return next;
    });
  };

  // resetPaletteState: clears every customization layer that the eight
  // full-palette-replace paths share. Callers are still responsible for
  // setting baseColors (or aiColorNames / aiReasoning when applicable),
  // tagging pendingLabelRef, and bumping the shuffle seed if their path
  // requires it. Preserves rampSize, hardwareLock, theme, CRT, CVD on
  // purpose: those are session-level settings, not per-palette state.
  //
  // See ARCHITECTURE.md "Cross-cutting state-maintenance rules" rule 1.
  // If you add new base-keyed or per-palette state, add its setter here
  // (and verify each of the 8 call sites still does the right thing).
  const resetPaletteState = () => {
    setOverrides({}); setPinEditor(null); setHarmonyAnchor(0);
    setRampSizeOverrides({}); setRampSatOverrides({});
    setHiddenShades({}); setRampShuffleOffsets({});
    setCompareAnchor(null); setCompareResult(null);
    setCollapsedRamps(new Set()); setLockedRamps(new Set());
    setSbsLeft('working'); setSbsRight(null);
    setSbsLeftPayload(null); setSbsRightPayload(null);
    setSbsLeftError(''); setSbsRightError('');
    setSbsLeftLoading(false); setSbsRightLoading(false);
    setHueShiftStrength(1.0);
    // Image remap: clear the cached output and error. The uploaded image
    // itself stays (the user uploaded it intentionally and likely wants to
    // remap against the new palette). See IMAGE_REMAP_PLAN.md reset paths.
    setRemapOutput(null);
    setRemapOutputSignature(null);
    setRemapError('');
  };

  // resetToDefaults: user-visible "wipe my session and start fresh"
  // action. Picks a new random base color, clears the AI prompt, runs
  // the shared reset, and bumps the shuffle seed. Tags history so it's
  // undoable. Two-click confirmation pattern: first click arms, second
  // commits. Auto-disarms after 3 seconds.
  const resetToDefaults = () => {
    if (confirmReset) {
      if (resetConfirmTimerRef.current) { clearTimeout(resetConfirmTimerRef.current); resetConfirmTimerRef.current = null; }
      setConfirmReset(false);
      pendingLabelRef.current = 'Reset to defaults';
      const fresh = buildRandomHex();
      setColorInput(fresh);
      setBaseColors([fresh]);
      setAiInput('');
      setAiReasoning('');
      setAiColorNames([]);
      setEditingIndex(null);
      resetPaletteState();
      // Hard-reset path: lockedRamps just got cleared. Bump shuffleSeed
      // directly rather than via bumpShuffleSeed, since the latter reads
      // the OLD lockedRamps closure and would take the lock-aware branch
      // on a render where lock has already been cleared in the same
      // batched update. Same reasoning as handleGenerate.
      setShuffleSeed(s => s + 1);
      return;
    }
    setConfirmReset(true);
    if (resetConfirmTimerRef.current) clearTimeout(resetConfirmTimerRef.current);
    resetConfirmTimerRef.current = setTimeout(() => {
      setConfirmReset(false);
      resetConfirmTimerRef.current = null;
    }, 3000);
  };

  // toggleRampLock: flip lock state for one ramp index. Used by the
  // padlock icon on each ramp card.
  const toggleRampLock = (baseIndex) => {
    setLockedRamps(prev => {
      const next = new Set(prev);
      if (next.has(baseIndex)) next.delete(baseIndex);
      else next.add(baseIndex);
      return next;
    });
  };

  // harmonize: rotate the hue of every UNLOCKED non-anchor base to a
  // color-theory position relative to the harmony anchor. Saturation and
  // lightness preserved per base. Mode controls the slot pattern used.
  // On first press the current base colors are saved as a baseline so
  // the user can restore pre-harmonize hues without relying on undo.
  const HARMONIZE_MODE_SLOTS = {
    complement:         [180],
    analogous:          [30, 330, 15, 345, 45, 315, 20, 340, 60, 300, 10],
    triadic:            [120, 240, 60, 180, 300, 30, 90, 150, 210, 270, 330],
    'split-complement': [150, 210, 30, 330, 120, 240, 60, 180, 90, 270, 45],
    square:             [90, 180, 270, 45, 135, 225, 315, 30, 60, 120, 150],
    tetradic:           [60, 240, 180, 120, 300, 30, 90, 150, 210, 270, 330],
  };
  const harmonize = () => {
    if (baseColors.length < 2) {
      setExportFeedback('Need at least 2 ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    const anchorIdx = safeAnchor;
    const anchorHex = baseColors[anchorIdx];
    if (!anchorHex) return;
    const anchorHsl = hexToHsl(anchorHex);
    const targets = [];
    for (let i = 0; i < baseColors.length; i++) {
      if (i === anchorIdx) continue;
      if (lockedRamps.has(i)) continue;
      targets.push(i);
    }
    if (targets.length === 0) {
      setExportFeedback('No unlocked ramps to harmonize');
      setTimeout(() => setExportFeedback(''), 2000);
      return;
    }
    if (!harmonizeBaseline) setHarmonizeBaseline(baseColors.slice());
    const slots = HARMONIZE_MODE_SLOTS[harmonizeMode] || HARMONIZE_MODE_SLOTS.complement;
    const newBaseColors = baseColors.slice();
    for (let k = 0; k < targets.length; k++) {
      const i = targets[k];
      const slot = slots[k % slots.length];
      const orig = hexToHsl(baseColors[i]);
      const newH = ((anchorHsl.h + slot) % 360 + 360) % 360;
      newBaseColors[i] = hslToHex({ h: newH, s: orig.s, l: orig.l });
    }
    const modeLabel = harmonizeMode.replace('-', ' ');
    pendingLabelRef.current = `Harmonize (${targets.length}, ${modeLabel})`;
    setBaseColors(newBaseColors);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback(`Harmonized ${targets.length} ramp${targets.length === 1 ? '' : 's'} — ${modeLabel}`);
    setTimeout(() => setExportFeedback(''), 2000);
  };
  const restoreHarmonizeBaseline = () => {
    if (!harmonizeBaseline) return;
    pendingLabelRef.current = 'Restore pre-harmonize hues';
    setBaseColors(harmonizeBaseline.slice());
    setHarmonizeBaseline(null);
    setCompareAnchor(null);
    setCompareResult(null);
    setExportFeedback('Restored original hues');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Toggle compare mode on/off. Turning OFF clears any in-flight anchor
  // and result so the next time the user enters compare mode they get a
  // clean slate. Turning ON does NOT pre-populate anything; user picks.
  const toggleCompareMode = () => {
    setCompareMode(prev => {
      if (prev) {
        setCompareAnchor(null);
        setCompareResult(null);
      }
      return !prev;
    });
  };

  // Pick a swatch while compare mode is on. Behavior:
  // - No anchor yet: this becomes the anchor.
  // - Anchor exists and the clicked swatch IS the anchor: unlock (clear).
  // - Anchor exists and the clicked swatch is different: compute the ratio
  //   and stash both into compareResult. The anchor stays so the user can
  //   keep comparing OTHER swatches against the same anchor; clicking the
  //   anchor again clears everything.
  // The "same swatch" identity uses (baseIndex, shadeIndex, style) since
  // two different ramps can have the same hex value.
  const pickCompareSwatch = (baseIndex, shadeIndex, style, hex) => {
    if (!compareAnchor) {
      setCompareAnchor({ baseIndex, shadeIndex, style, hex });
      setCompareResult(null);
      return;
    }
    const isAnchor = compareAnchor.baseIndex === baseIndex
                  && compareAnchor.shadeIndex === shadeIndex
                  && compareAnchor.style === style;
    if (isAnchor) {
      // Click anchor again -> unlock entirely.
      setCompareAnchor(null);
      setCompareResult(null);
      return;
    }
    // Different swatch -> compute and show result, keep anchor.
    const ratio = wcagContrast(compareAnchor.hex, hex);
    const tier = wcagAaTier(ratio);
    setCompareResult({ aHex: compareAnchor.hex, bHex: hex, ratio, tier });
  };

  const handleSpriteFile = (file) => {
    if (!file) return;
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    if (!spriteImportName.trim()) setSpriteImportName(baseName);
    const reader = new FileReader();
    reader.onload = (e) => { setSpriteImportText(e.target.result); setSpriteImportError(''); };
    reader.onerror = () => setSpriteImportError('Failed to read file');
    reader.readAsText(file);
  };

  const handleSpriteDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setSpriteDragging(true); };
  const handleSpriteDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setSpriteDragging(false); };
  const handleSpriteDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setSpriteDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleSpriteFile(file);
  };

  const importSprite = () => {
    setSpriteImportError('');
    if (!spriteImportName.trim()) { setSpriteImportError('Please give your sprite a name'); return; }
    const parsed = parsePiskelC(spriteImportText);
    if (!parsed) { setSpriteImportError('Could not parse. Paste the full C array text'); return; }
    const key = spriteImportName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (DEFAULT_SPRITE_LIBRARY[key]) { setSpriteImportError('Name conflicts with built-in sprite'); return; }
    setCustomSprites(prev => ({
      ...prev,
      [key]: { name: spriteImportName.trim(), pattern: parsed.pattern, numShades: parsed.numShades }
    }));
    setSpriteKey(key);
    setSpriteImportText(''); setSpriteImportName('');
    setShowSpriteImporter(false);
    setExportFeedback(`Imported ${parsed.width}×${parsed.height}, ${parsed.numShades} shades`);
    setTimeout(() => setExportFeedback(''), 3000);
  };

  const removeCustomSprite = (key) => {
    setCustomSprites(prev => { const n = { ...prev }; delete n[key]; return n; });
    if (spriteKey === key) setSpriteKey('vase');
  };

  const copySpriteSource = (key) => {
    const sprite = spriteLibrary[key];
    if (!sprite || !sprite.pattern) return;
    const width = sprite.pattern[0].length;
    const height = sprite.pattern.length;
    const lines = [];
    lines.push('=== PIXEL.PAL SPRITE EXPORT ===');
    lines.push(`name: ${sprite.name}`);
    lines.push(`size: ${width}x${height}`);
    lines.push(`shades: ${sprite.numShades}`);
    lines.push('pattern:');
    sprite.pattern.forEach(row => lines.push(row));
    lines.push('=== END SPRITE ===');
    const text = lines.join('\n');
    const tryCopy = async () => {
      try {
        await navigator.clipboard.writeText(text);
        setExportFeedback('Sprite source copied!');
      } catch {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          setExportFeedback('Sprite source copied!');
        } catch {
          setExportFeedback('Copy failed: check console');
          console.log(text);
        }
      }
      setTimeout(() => setExportFeedback(''), 2500);
    };
    tryCopy();
  };

  useEffect(() => {
    const randomHex = buildRandomHex();
    setColorInput(randomHex);
    setAiInput(buildRandomDescription());
    setBaseColors([randomHex]);
    setShuffleSeed(s => s + 1);
  }, []);

  // Load theme preference once at mount. We use a try/catch and best-effort
  // semantics: if storage isn't available, just stay on 'dark'. The first
  // render uses 'dark' regardless; once this effect runs we update to the
  // saved value, which may cause a brief flash. Acceptable.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:theme');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['dark', 'neutral', 'light'].includes(parsed)) {
            setTheme(parsed);
          }
        }
      } catch {
        // No saved theme or storage failed; keep default.
      }
    })();
  }, []);

  // Persist theme on change. Skip the initial mount render so we don't
  // immediately overwrite the value we just loaded.
  const themeMountRef = useRef(false);
  useEffect(() => {
    if (!themeMountRef.current) { themeMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:theme', JSON.stringify(theme)); } catch {}
    })();
  }, [theme]);

  // Load saved CVD mode on mount. Same pattern as theme load.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:cvdMode');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['none', 'protan', 'deutan', 'tritan'].includes(parsed)) {
            setCvdMode(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default 'none'.
      }
    })();
  }, []);

  // Persist CVD mode on change. Skip initial mount to avoid overwriting load.
  const cvdMountRef = useRef(false);
  useEffect(() => {
    if (!cvdMountRef.current) { cvdMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:cvdMode', JSON.stringify(cvdMode)); } catch {}
    })();
  }, [cvdMode]);

  // Persisted UI preferences: rampSize, vizStyle, gplStyle, rampExportStyle.
  // These are session-level defaults the app initializes with on cold open.
  // Each value is also restorable per-palette via the saved palette payload
  // (rampSize, vizStyle, gplStyle are in the payload schema; rampExportStyle
  // is not, but it follows the same persistence shape for the UI default).
  // Loading a saved palette overrides whatever the persisted default was,
  // which is the desired behavior. Undo also writes to these states (for
  // rampSize) and that write will persist; the user's "current state" wins.
  // Each setting follows the same pattern as ui:theme and ui:cvdMode:
  // a one-shot load effect on mount and a mountRef-guarded persist effect.
  // Hardcoded defaults stay unchanged for first-time users (no storage hit
  // means we keep the useState initial value). Skipped intentionally:
  // hueShiftStrength is per-palette (saved in the payload, default 1.0 per
  // palette); persisting it as a session pref would conflict with that role.

  // rampSize: persisted at ui:rampSize. Valid values 4..8.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:rampSize');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'number' && [4, 5, 6, 7, 8].includes(parsed)) {
            setRampSize(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);
  const rampSizeMountRef = useRef(false);
  useEffect(() => {
    if (!rampSizeMountRef.current) { rampSizeMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:rampSize', JSON.stringify(rampSize)); } catch {}
    })();
  }, [rampSize]);

  // vizStyle: persisted at ui:vizStyle. Valid values punchy/balanced/muted.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:vizStyle');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['punchy', 'balanced', 'muted'].includes(parsed)) {
            setVizStyle(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);
  const vizStyleMountRef = useRef(false);
  useEffect(() => {
    if (!vizStyleMountRef.current) { vizStyleMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:vizStyle', JSON.stringify(vizStyle)); } catch {}
    })();
  }, [vizStyle]);

  // gplStyle: persisted at ui:gplStyle. Valid values punchy/balanced/muted.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:gplStyle');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['punchy', 'balanced', 'muted'].includes(parsed)) {
            setGplStyle(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);
  const gplStyleMountRef = useRef(false);
  useEffect(() => {
    if (!gplStyleMountRef.current) { gplStyleMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:gplStyle', JSON.stringify(gplStyle)); } catch {}
    })();
  }, [gplStyle]);

  // rampExportStyle: persisted at ui:rampExportStyle. Valid values
  // punchy/balanced/muted. Not part of the saved palette payload (it is
  // a pure UI preference for the per-ramp Copy and Download buttons),
  // but persists as a session-level default like the others.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:rampExportStyle');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['punchy', 'balanced', 'muted'].includes(parsed)) {
            setRampExportStyle(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);
  const rampExportStyleMountRef = useRef(false);
  useEffect(() => {
    if (!rampExportStyleMountRef.current) { rampExportStyleMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    (async () => {
      try { await window.storage.set('ui:rampExportStyle', JSON.stringify(rampExportStyle)); } catch {}
    })();
  }, [rampExportStyle]);

  // Auto-open the visualization section when the user transitions from 1 to 2+
  // base colors, but never force it closed (user can collapse manually any time).
  // Auto-collapse rule for ramp cards: when baseColors grows (a base was
  // appended), collapse ONLY the newly-added indices IF the resulting total
  // is >=3. The original bases retain their current collapse state. On
  // length decrease, the existing shift logic inside removeRamp handles
  // re-keying; the threshold doesn't auto-expand anything. On wholesale
  // palette replace (Generate, AI, Classics, GPL import, image extract),
  // those code paths reset collapsedRamps directly so this effect doesn't
  // need a "replace" branch.
  const prevBaseLenRef = useRef(baseColors.length);
  useEffect(() => {
    const prev = prevBaseLenRef.current;
    const curr = baseColors.length;
    if (prev <= 1 && curr > 1) {
      setSbsOpen(true);
    }
    if (curr > prev && curr >= 3) {
      // Indices [prev, prev+1, ..., curr-1] are the newly-appended bases.
      setCollapsedRamps(existing => {
        const next = new Set(existing);
        for (let k = prev; k < curr; k++) next.add(k);
        return next;
      });
    }
    prevBaseLenRef.current = curr;
    if (harmonizeBaseline && harmonizeBaseline.length !== curr) setHarmonizeBaseline(null);
  }, [baseColors.length]);

  // Close the pin editor if its target shade is no longer addressable. This
  // happens when the user shrinks rampSize while a pin editor is open on a
  // shade index >= the new size. The override itself stays (inert) in case
  // the user goes back to the larger size, but the editor pointing at an
  // invisible shade would be confusing.
  useEffect(() => {
    if (pinEditor && pinEditor.shadeIndex >= rampSize) {
      setPinEditor(null);
    }
    if (pinEditor && pinEditor.baseIndex >= baseColors.length) {
      setPinEditor(null);
    }
  }, [rampSize, baseColors.length, pinEditor]);

  // ---------- Saved palette storage helpers ----------
  // Storage layout:
  //   key `palettes:{slug}` -> JSON.stringify({ name, savedAt, baseColors,
  //     aiColorNames, aiReasoning, rampSize, gplStyle, vizStyle, spriteKey,
  //     shuffleSeed, customSprites }) where customSprites is the FULL custom
  //     sprite library at save time. We snapshot the whole custom library so
  //     that loading a palette later restores any imported sprite it depended
  //     on, even if the user has since removed it. shuffleSeed is required to
  //     reproduce ramp jitter exactly on load (without it, loading the same
  //     palette twice produces visibly different ramps).
  // The slug is derived from the user-provided name; collisions overwrite by
  // design (load-then-save-with-same-name is "update this palette").
  const slugify = (name) => {
    return name.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  };

  // Refresh the in-memory savedPalettes index by listing storage keys and
  // pulling enough data out of each entry to render the list. We pull
  // baseColors so the list can show a small mosaic thumbnail; the rest of
  // the payload is fetched lazily when a palette is loaded.
  const refreshSavedPalettes = async () => {
    if (typeof window === 'undefined' || !window.storage) return;
    try {
      const listResult = await window.storage.list('palettes:');
      if (!listResult || !listResult.keys) { setSavedPalettes([]); return; }
      const entries = [];
      for (const key of listResult.keys) {
        try {
          const got = await window.storage.get(key);
          if (!got || !got.value) continue;
          const parsed = JSON.parse(got.value);
          if (!parsed || !Array.isArray(parsed.baseColors)) continue;
          entries.push({
            slug: key.replace(/^palettes:/, ''),
            name: parsed.name || '(unnamed)',
            savedAt: parsed.savedAt || 0,
            baseColors: parsed.baseColors,
          });
        } catch (err) {
          // Individual key failed; skip it but keep going.
          console.warn('Failed to read palette key', key, err);
        }
      }
      entries.sort((a, b) => b.savedAt - a.savedAt);
      setSavedPalettes(entries);
    } catch (err) {
      console.error('refreshSavedPalettes failed', err);
      setSavedPalettes([]);
    }
  };

  // Load saved palettes once at mount. If storage is unavailable (e.g. running
  // outside the artifact sandbox), the list just stays empty and the panel
  // shows a clear notice.
  useEffect(() => {
    refreshSavedPalettes();
  }, []);

  // Cleanup the confirm-delete timer if the component unmounts mid-confirm.
  useEffect(() => {
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
  }, []);

  // History watcher: observes the snapshot inputs, debounces, and records
  // a new history entry on stabilization.
  //
  // The dependencies are the SNAPSHOT INPUTS, not historyEntries/
  // historyIndex (which would loop). We read those two via refs that
  // are kept in sync with the rendered values via a separate effect
  // below. The ref pattern avoids invalidating this effect's closure
  // every time we push a new entry.
  //
  // The debounce serves two purposes: it collapses rapid slider input
  // into a single entry, and it lets React batch the state updates of
  // a single user action (which often touch multiple state fields)
  // into one snapshot rather than two near-identical ones.
  const historyEntriesRef = useRef(historyEntries);
  const historyIndexRef = useRef(historyIndex);
  useEffect(() => { historyEntriesRef.current = historyEntries; }, [historyEntries]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  useEffect(() => {
    // Replay path: undo/redo/jump set this flag, and React then re-runs
    // this effect because the state fields changed. Clear the flag and
    // skip recording.
    if (isReplayingHistoryRef.current) {
      isReplayingHistoryRef.current = false;
      // Cancel any pending debounce too: we don't want a queued snapshot
      // recording the replayed state.
      if (historyDebounceRef.current) {
        clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = null;
      }
      return;
    }

    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      historyDebounceRef.current = null;
      const entries = historyEntriesRef.current;
      const index = historyIndexRef.current;
      const current = entries[index];
      const newSnap = buildUndoSnapshot();
      // Skip if the snapshot is byte-identical to the current entry.
      // This guards against effect runs where a setter was called with
      // the same value (React still re-runs the effect because the
      // dependency identity may have changed).
      if (current && current.snapshot && JSON.stringify(current.snapshot) === JSON.stringify(newSnap)) {
        return;
      }
      const label = pendingLabelRef.current || inferLabel(current ? current.snapshot : null, newSnap);
      pendingLabelRef.current = null;
      // Truncate forward entries (redo stack) and append the new entry.
      // Cap at HISTORY_DEPTH_CAP by dropping from the front.
      const next = entries.slice(0, index + 1);
      next.push({ snapshot: newSnap, label, timestamp: Date.now() });
      let newIndex = next.length - 1;
      if (next.length > HISTORY_DEPTH_CAP) {
        const dropped = next.length - HISTORY_DEPTH_CAP;
        next.splice(0, dropped);
        newIndex -= dropped;
      }
      setHistoryEntries(next);
      setHistoryIndex(newIndex);
    }, HISTORY_DEBOUNCE_MS);

    // Cleanup: if the effect re-fires before the timer, the new run will
    // clear the old timer at the top.
    return () => {};
  }, [
    baseColors, aiColorNames, aiReasoning, rampSize, shuffleSeed,
    overrides, harmonyAnchor, rampSizeOverrides, rampSatOverrides,
    hiddenShades, rampShuffleOffsets, hardwareLock, hueShiftStrength,
    lockedRamps, collapsedRamps,
  ]);

  // Keyboard shortcuts for undo/redo. Bound at the window level so they
  // fire regardless of focus, but skipped when the focused element is
  // a text input / textarea (so native browser text-undo works inside
  // the hex input, AI prompt, save name field, etc).
  useEffect(() => {
    const handler = (e) => {
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        // Also support Cmd+Shift+Z as an alias for redo. Most users
        // expect it; binding both is cheap.
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [historyEntries, historyIndex]);  // re-bind whenever history changes so handler closures see fresh undo/redo

  // Side-by-side slot fetcher. When a slot points at a saved-palette slug,
  // pull the full payload from storage so ramps render at full fidelity
  // (pins, hidden shades, hardware lock, per-ramp sizes/sats, shuffleSeed).
  // When the slot is 'working' or null, no fetch is needed. We use an
  // ignore flag to avoid late-resolving fetches clobbering newer state.
  useEffect(() => {
    if (sbsLeft === null || sbsLeft === 'working' || (typeof sbsLeft === 'string' && sbsLeft.startsWith('classic:'))) {
      // Empty, working, or a classic palette. None of these require a
      // storage fetch: empty and working render from live state, and
      // classics render from the CLASSIC_PALETTES constant.
      setSbsLeftPayload(null);
      setSbsLeftError('');
      setSbsLeftLoading(false);
      return;
    }
    let ignore = false;
    setSbsLeftLoading(true);
    setSbsLeftError('');
    (async () => {
      try {
        if (typeof window === 'undefined' || !window.storage) {
          throw new Error('Storage unavailable');
        }
        const got = await window.storage.get(`palettes:${sbsLeft}`);
        if (ignore) return;
        if (!got || !got.value) {
          setSbsLeftPayload(null);
          setSbsLeftError('Palette not found');
        } else {
          const parsed = JSON.parse(got.value);
          if (!parsed || !Array.isArray(parsed.baseColors)) {
            setSbsLeftPayload(null);
            setSbsLeftError('Palette payload malformed');
          } else {
            setSbsLeftPayload(parsed);
          }
        }
      } catch (err) {
        if (ignore) return;
        setSbsLeftPayload(null);
        setSbsLeftError(`Load failed: ${err && err.message ? err.message : 'unknown error'}`);
      } finally {
        if (!ignore) setSbsLeftLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [sbsLeft]);

  useEffect(() => {
    if (sbsRight === null || sbsRight === 'working' || (typeof sbsRight === 'string' && sbsRight.startsWith('classic:'))) {
      // Empty, working, or a classic palette. None of these require a
      // storage fetch: empty and working render from live state, and
      // classics render from the CLASSIC_PALETTES constant.
      setSbsRightPayload(null);
      setSbsRightError('');
      setSbsRightLoading(false);
      return;
    }
    let ignore = false;
    setSbsRightLoading(true);
    setSbsRightError('');
    (async () => {
      try {
        if (typeof window === 'undefined' || !window.storage) {
          throw new Error('Storage unavailable');
        }
        const got = await window.storage.get(`palettes:${sbsRight}`);
        if (ignore) return;
        if (!got || !got.value) {
          setSbsRightPayload(null);
          setSbsRightError('Palette not found');
        } else {
          const parsed = JSON.parse(got.value);
          if (!parsed || !Array.isArray(parsed.baseColors)) {
            setSbsRightPayload(null);
            setSbsRightError('Palette payload malformed');
          } else {
            setSbsRightPayload(parsed);
          }
        }
      } catch (err) {
        if (ignore) return;
        setSbsRightPayload(null);
        setSbsRightError(`Load failed: ${err && err.message ? err.message : 'unknown error'}`);
      } finally {
        if (!ignore) setSbsRightLoading(false);
      }
    })();
    return () => { ignore = true; };
  }, [sbsRight]);

  // Resolve a slot value to a snapshot bundle understood by
  // buildRampsForSnapshot. Returns null if the slot is empty, still
  // loading, or errored. Used by both sbs slots.
  //   - null              -> null (empty slot)
  //   - 'working'         -> live snapshot of the working palette built
  //                          from current state. Re-evaluated on every
  //                          render so the slot tracks edits in real time.
  //   - 'classic:<id>'    -> a synthetic snapshot built from the named
  //                          CLASSIC_PALETTES entry. Wraps the classic's
  //                          baseColors and uses the user's LIVE rampSize
  //                          and hueShiftStrength so the comparison is
  //                          apples-to-apples with the working palette's
  //                          shade count and stylization. shuffleSeed is
  //                          forced to 0 so the classic doesn't drift as
  //                          the user shuffles their working palette
  //                          (a comparison reference should stay stable).
  //                          All per-ramp overrides (pins, hidden shades,
  //                          per-ramp sizes/sats, shuffle offsets) and
  //                          hardwareLock are empty: those are working-
  //                          palette identity, not the classic's, and
  //                          bleeding them through would produce nonsense.
  //   - <slug>            -> the cached payload from sbs*Payload, or null
  //                          while loading or on error.
  const buildWorkingSnapshot = () => ({
    baseColors,
    rampSize,
    shuffleSeed,
    overrides,
    rampSizeOverrides,
    rampSatOverrides,
    rampShuffleOffsets,
    hiddenShades,
    hardwareLock,
    hueShiftStrength,
  });
  // Build a classic-palette snapshot bundle. See the "classic:<id>" rule
  // in getSnapshotForSlot above for the policy.
  const buildClassicSnapshot = (classicId) => {
    const classic = CLASSIC_PALETTES.find(c => c.id === classicId);
    if (!classic) return null;
    return {
      baseColors: classic.baseColors,
      aiColorNames: classic.names || [],
      rampSize,
      shuffleSeed: 0,
      overrides: {},
      rampSizeOverrides: {},
      rampSatOverrides: {},
      rampShuffleOffsets: {},
      hiddenShades: {},
      hardwareLock: null,
      hueShiftStrength,
    };
  };
  const getSnapshotForSlot = (slot, cachedPayload) => {
    if (slot === null) return null;
    if (slot === 'working') return buildWorkingSnapshot();
    if (typeof slot === 'string' && slot.startsWith('classic:')) {
      return buildClassicSnapshot(slot.slice('classic:'.length));
    }
    return cachedPayload; // null while loading or on error
  };
  // Friendly display name for a slot, used in the column header.
  // Prefer the in-memory savedPalettes index over the cached payload's
  // `name` field: the index is updated immediately after rename, while
  // a cached payload that was loaded before rename still holds the old
  // name. The cached-payload `.name` is only the fallback for the brief
  // window where a slot was just picked but the index has not yet
  // refreshed (e.g. immediately after a save).
  const getSlotLabel = (slot, cachedPayload) => {
    if (slot === null) return '(empty)';
    if (slot === 'working') return 'Current working palette';
    if (typeof slot === 'string' && slot.startsWith('classic:')) {
      const classic = CLASSIC_PALETTES.find(c => c.id === slot.slice('classic:'.length));
      return classic ? `${classic.name} (classic)` : '(unknown classic)';
    }
    const meta = savedPalettes.find(p => p.slug === slot);
    if (meta) return meta.name;
    if (cachedPayload && typeof cachedPayload.name === 'string') return cachedPayload.name;
    return '(loading)';
  };

  // Side-by-Side image remap pipeline. Mirrors the main Image Preview
  // panel's pipeline but operates on snapshot palettes rather than on
  // the live working palette. See the "sbsRemapSource" state block above
  // for the policy summary.
  //
  // Source decode ceiling for SBS slots. 256 vs the main panel's 512
  // because each slot renders at a smaller display size AND we run two
  // remaps per relevant change. Halving the longer axis is a 4x cost
  // reduction per remap, 8x across both slots vs the main panel.
  const SBS_REMAP_MAX_DIMENSION = 256;
  // Derive a remap-ready palette (flat, deduped, lowercase) from a
  // snapshot under the current vizStyle. Returns [] for an unusable
  // snapshot. The flatten + dedupe is byte-identical to what the live
  // pipeline's getActiveRemapPalette produces when fed the same input,
  // because buildRampsForSnapshot already applies hidden-shade filter,
  // hardware lock, pins, sizes, saturations, and shuffle internally.
  const paletteFromSnapshotForRemap = (snapshot) => {
    const ramps = buildRampsForSnapshot(snapshot, vizStyle);
    if (!ramps || ramps.length === 0) return [];
    const seen = new Set();
    const out = [];
    for (const ramp of ramps) {
      for (const hex of ramp) {
        const k = hex.toLowerCase();
        if (!seen.has(k)) { seen.add(k); out.push(hex); }
      }
    }
    return out;
  };
  // Stable signature for a slot palette + dither, used as the useEffect
  // dependency for the per-slot remap. Same shape as buildRemapSignature.
  // Empty palette signals "do not run a remap" via the empty-palette
  // guard inside the effect.
  const buildSbsRemapKey = (palette, dither) => palette.length === 0
    ? ''
    : (dither + '|' + palette.map(c => c.toLowerCase()).join(','));

  // Decode the uploaded image once per upload into an ImageData at up
  // to SBS_REMAP_MAX_DIMENSION on the longer axis. Both slots reuse
  // this source. Cleared when remapImageDataUrl becomes null (user
  // removed the image).
  useEffect(() => {
    if (!remapImageDataUrl) {
      setSbsRemapSource(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const longer = Math.max(img.naturalWidth, img.naturalHeight);
        const scale = longer > SBS_REMAP_MAX_DIMENSION ? SBS_REMAP_MAX_DIMENSION / longer : 1;
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);
        if (!cancelled) setSbsRemapSource(data);
      } catch {
        if (!cancelled) setSbsRemapSource(null);
      }
    };
    img.onerror = () => { if (!cancelled) setSbsRemapSource(null); };
    img.src = remapImageDataUrl;
    return () => { cancelled = true; };
  }, [remapImageDataUrl]);

  // Per-slot remap effects. Each fires when the source, the slot
  // palette signature (vizStyle is baked into the signature via the
  // snapshot ramps), or the dither mode changes. Empty palette or
  // missing source -> clear the slot's output and bail. Heavy work
  // wrapped in setTimeout(..., 0) so the "Computing..." badge paints
  // before the synchronous remap begins, matching the main panel
  // pattern.
  const leftSnapForRemap = getSnapshotForSlot(sbsLeft, sbsLeftPayload);
  const rightSnapForRemap = getSnapshotForSlot(sbsRight, sbsRightPayload);
  const leftRemapPalette = leftSnapForRemap ? paletteFromSnapshotForRemap(leftSnapForRemap) : [];
  const rightRemapPalette = rightSnapForRemap ? paletteFromSnapshotForRemap(rightSnapForRemap) : [];
  const leftRemapKey = buildSbsRemapKey(leftRemapPalette, remapDither);
  const rightRemapKey = buildSbsRemapKey(rightRemapPalette, remapDither);

  useEffect(() => {
    if (!sbsRemapSource || leftRemapKey === '') {
      setSbsLeftRemap(null);
      setSbsLeftRemapLoading(false);
      return;
    }
    setSbsLeftRemapLoading(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const result = remapImageToPalette(sbsRemapSource, leftRemapPalette, { dither: remapDither });
        if (!cancelled) {
          setSbsLeftRemap(result);
          setSbsLeftRemapLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSbsLeftRemap(null);
          setSbsLeftRemapLoading(false);
        }
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // leftRemapPalette and remapDither are captured via closure; the
    // signature key in deps changes whenever either of them changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbsRemapSource, leftRemapKey]);

  useEffect(() => {
    if (!sbsRemapSource || rightRemapKey === '') {
      setSbsRightRemap(null);
      setSbsRightRemapLoading(false);
      return;
    }
    setSbsRightRemapLoading(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled) return;
      try {
        const result = remapImageToPalette(sbsRemapSource, rightRemapPalette, { dither: remapDither });
        if (!cancelled) {
          setSbsRightRemap(result);
          setSbsRightRemapLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSbsRightRemap(null);
          setSbsRightRemapLoading(false);
        }
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbsRemapSource, rightRemapKey]);

  // ============================================================
  // History snapshot machinery
  // ============================================================
  // Build a JSON-serializable snapshot of every undoable state field.
  // Sets are serialized as sorted arrays so equality comparisons via
  // JSON.stringify are deterministic. Object maps with numeric keys
  // (overrides, rampSizeOverrides, etc.) are passed through; JSON
  // serialization preserves their structure.
  const buildUndoSnapshot = () => ({
    baseColors,
    aiColorNames,
    aiReasoning,
    rampSize,
    shuffleSeed,
    overrides,
    harmonyAnchor,
    rampSizeOverrides,
    rampSatOverrides,
    hiddenShades,
    rampShuffleOffsets,
    hardwareLock,
    hueShiftStrength,
    lockedRamps: [...lockedRamps].sort((a, b) => a - b),
    collapsedRamps: [...collapsedRamps].sort((a, b) => a - b),
  });

  // Apply a snapshot back to all state setters. Wraps the calls in the
  // isReplayingHistory flag so the watcher effect doesn't record this
  // application as a new entry.
  //
  // setHueShiftStrength etc. all fire synchronously into React's update
  // queue, but the rendered effect happens on the next render. The flag
  // is read by the watcher's debounced timer when it actually fires, so
  // it'll still be set when the timer runs after the batched render.
  const applyUndoSnapshot = (snap) => {
    if (!snap) return;
    isReplayingHistoryRef.current = true;
    setBaseColors(snap.baseColors);
    setAiColorNames(snap.aiColorNames);
    setAiReasoning(snap.aiReasoning);
    setRampSize(snap.rampSize);
    setShuffleSeed(snap.shuffleSeed);
    setOverrides(snap.overrides);
    setHarmonyAnchor(snap.harmonyAnchor);
    setRampSizeOverrides(snap.rampSizeOverrides);
    setRampSatOverrides(snap.rampSatOverrides);
    setHiddenShades(snap.hiddenShades);
    setRampShuffleOffsets(snap.rampShuffleOffsets);
    setHardwareLock(snap.hardwareLock);
    setHueShiftStrength(snap.hueShiftStrength);
    setLockedRamps(new Set(snap.lockedRamps || []));
    setCollapsedRamps(new Set(snap.collapsedRamps || []));
    // Side effects of applying: clear in-flight UI editor states that
    // could reference stale indices.
    setPinEditor(null);
    setEditingIndex(null);
    setCompareAnchor(null);
    setCompareResult(null);
  };

  // Diff-based label fallback: when a state change wasn't tagged by its
  // handler with pendingLabelRef, infer a label from which fields
  // changed between previous and new snapshots. Most fine-grained edits
  // (HSV sliders, sat slider, size dropdown, ramp lock toggle, etc) go
  // through this path. The bulk handlers (Generate, Harmonize, Load,
  // GPL import, etc) tag explicitly because their action name is
  // user-visible.
  const inferLabel = (prev, next) => {
    if (!prev || !next) return 'Edit';
    if (JSON.stringify(prev.baseColors) !== JSON.stringify(next.baseColors)) {
      if (prev.baseColors.length < next.baseColors.length) return 'Add ramp';
      if (prev.baseColors.length > next.baseColors.length) return 'Remove ramp';
      return 'Edit base color';
    }
    if (JSON.stringify(prev.overrides) !== JSON.stringify(next.overrides)) return 'Pin / unpin shade';
    if (JSON.stringify(prev.hiddenShades) !== JSON.stringify(next.hiddenShades)) return 'Hide / restore shade';
    if (JSON.stringify(prev.lockedRamps) !== JSON.stringify(next.lockedRamps)) return 'Lock / unlock ramp';
    if (JSON.stringify(prev.rampShuffleOffsets) !== JSON.stringify(next.rampShuffleOffsets)) return 'Shuffle ramp';
    if (JSON.stringify(prev.rampSatOverrides) !== JSON.stringify(next.rampSatOverrides)) return 'Adjust saturation';
    if (JSON.stringify(prev.rampSizeOverrides) !== JSON.stringify(next.rampSizeOverrides)) return 'Change ramp size';
    if (prev.rampSize !== next.rampSize) return 'Change shade count';
    if (prev.hueShiftStrength !== next.hueShiftStrength) return 'Adjust hue shift';
    if (prev.hardwareLock !== next.hardwareLock) {
      return next.hardwareLock ? `Lock to ${next.hardwareLock}` : 'Unlock hardware';
    }
    if (prev.harmonyAnchor !== next.harmonyAnchor) return 'Change harmony anchor';
    if (prev.shuffleSeed !== next.shuffleSeed) return 'Generate';
    if (JSON.stringify(prev.collapsedRamps) !== JSON.stringify(next.collapsedRamps)) return 'Collapse / expand ramps';
    return 'Edit';
  };

  // Sequential undo / redo / jump-to-index. All three share the
  // snapshot-application path. The jump variant lets the History panel
  // user click any entry.
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyEntries.length - 1;
  const undo = () => {
    if (!canUndo) {
      setExportFeedback('Nothing to undo');
      setTimeout(() => setExportFeedback(''), 1500);
      return;
    }
    const targetIndex = historyIndex - 1;
    const entry = historyEntries[targetIndex];
    applyUndoSnapshot(entry.snapshot);
    setHistoryIndex(targetIndex);
    setExportFeedback(`Undo: ${entry.label}`);
    setTimeout(() => setExportFeedback(''), 1500);
  };
  const redo = () => {
    if (!canRedo) {
      setExportFeedback('Nothing to redo');
      setTimeout(() => setExportFeedback(''), 1500);
      return;
    }
    const targetIndex = historyIndex + 1;
    const entry = historyEntries[targetIndex];
    applyUndoSnapshot(entry.snapshot);
    setHistoryIndex(targetIndex);
    setExportFeedback(`Redo: ${entry.label}`);
    setTimeout(() => setExportFeedback(''), 1500);
  };
  const jumpToHistoryIndex = (targetIndex) => {
    if (targetIndex < 0 || targetIndex >= historyEntries.length) return;
    if (targetIndex === historyIndex) return;
    const entry = historyEntries[targetIndex];
    // Index 0 is the "Initial state" sentinel; its snapshot is null because
    // we hadn't built the snapshot machinery yet. Jumping to index 0 is a
    // no-op for state application: we just move the cursor and let the
    // user keep editing from "wherever they were when the app loaded".
    // This is intentionally imperfect (Initial state can't actually
    // restore mount state) but it's still a useful anchor in the panel.
    if (entry.snapshot) applyUndoSnapshot(entry.snapshot);
    setHistoryIndex(targetIndex);
    setExportFeedback(`Jumped to: ${entry.label}`);
    setTimeout(() => setExportFeedback(''), 1500);
  };

  // Format a unix-ms timestamp as a short relative-time string for the
  // History panel. Resolution drops as ages grow: "just now" (<10s),
  // "Ns ago" (<60s), "Nm ago" (<60m), "Nh ago" (<24h), "Nd ago" beyond.
  // Recomputed each render based on Date.now() so entries age in place
  // when the panel is open (no setInterval needed; opening/closing the
  // panel and any other re-render refreshes the values).
  const formatHistoryAge = (timestamp) => {
    const ageSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
    if (ageSec < 10) return 'just now';
    if (ageSec < 60) return `${ageSec}s ago`;
    const ageMin = Math.floor(ageSec / 60);
    if (ageMin < 60) return `${ageMin}m ago`;
    const ageHr = Math.floor(ageMin / 60);
    if (ageHr < 24) return `${ageHr}h ago`;
    const ageDay = Math.floor(ageHr / 24);
    return `${ageDay}d ago`;
  };

  const saveCurrentPalette = async () => {
    setSavedError('');
    const trimmed = saveName.trim();
    if (!trimmed) { setSavedError('Please enter a name'); return; }
    if (typeof window === 'undefined' || !window.storage) {
      setSavedError('Storage is not available in this environment');
      return;
    }
    if (savedPalettes.length >= SAVED_PALETTE_LIMIT && !savedPalettes.some(p => p.name === trimmed)) {
      setSavedError(`Limit of ${SAVED_PALETTE_LIMIT} saved palettes reached. Delete one first.`);
      return;
    }
    const slug = slugify(trimmed);
    if (!slug) { setSavedError('Name must contain at least one letter or digit'); return; }
    const payload = {
      name: trimmed,
      savedAt: Date.now(),
      baseColors,
      aiColorNames,
      aiReasoning,
      rampSize,
      gplStyle,
      vizStyle,
      spriteKey,
      shuffleSeed, // critical: ramps are deterministic only if we restore this exactly
      customSprites, // snapshot the full custom sprite library
      overrides, // sparse per-shade pin map; absent in pre-feature-A payloads
      harmonyAnchor, // index into baseColors used as the harmony source
      rampSizeOverrides, // per-ramp shade count overrides; absent in older payloads
      rampSatOverrides, // per-ramp saturation multipliers; absent in older payloads
      hiddenShades, // per-base array of hidden shade indices; absent in older payloads
      rampShuffleOffsets, // per-ramp shuffle counter; absent in older payloads
      hardwareLock, // null | 'nes' | 'gameboy' | 'cga16' | 'ega64' | 'c64'; persistent hardware lock; absent in older payloads
      hueShiftStrength, // number in [0.0, 2.0], default 1.0; absent in older payloads (legacy palettes restore at 1.0)
      // lockedRamps is a Set in component state; we serialize as a sorted
      // array of base indices. Absent in payloads saved before this
      // feature shipped; legacy loads should default to empty (nothing
      // locked). Sorted purely for diff-friendliness when inspecting
      // stored JSON; load order doesn't matter.
      lockedRamps: [...lockedRamps].sort((a, b) => a - b),
      // Perceptual ramp engine per-ramp settings.
      curvePerRamp,
      gamutPerRamp,
      advancedOpen,
    };
    setSavedBusy(true);
    try {
      const result = await window.storage.set(`palettes:${slug}`, JSON.stringify(payload));
      if (!result) {
        setSavedError('Save failed (storage returned null)');
        setSavedBusy(false);
        return;
      }
      setSaveName('');
      setExportFeedback(`Saved as "${trimmed}"`);
      setTimeout(() => setExportFeedback(''), 2000);
      await refreshSavedPalettes();
    } catch (err) {
      console.error('saveCurrentPalette failed', err);
      setSavedError('Save failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  const loadPalette = async (slug) => {
    setSavedError('');
    if (typeof window === 'undefined' || !window.storage) {
      setSavedError('Storage is not available in this environment');
      return;
    }
    setSavedBusy(true);
    try {
      const got = await window.storage.get(`palettes:${slug}`);
      if (!got || !got.value) {
        setSavedError('Palette not found');
        return;
      }
      const parsed = JSON.parse(got.value);
      if (!parsed || !Array.isArray(parsed.baseColors) || parsed.baseColors.length === 0) {
        setSavedError('Palette data is invalid');
        return;
      }
      // Merge any saved custom sprites back in. We don't replace the current
      // custom library wholesale, since the user may have other sprites they
      // want to keep. New sprites from the snapshot only fill in gaps.
      if (parsed.customSprites && typeof parsed.customSprites === 'object') {
        setCustomSprites(prev => {
          const merged = { ...parsed.customSprites, ...prev };
          return merged;
        });
      }
      pendingLabelRef.current = `Load: ${parsed.name || slug}`;
      setBaseColors(parsed.baseColors);
      setAiColorNames(Array.isArray(parsed.aiColorNames) ? parsed.aiColorNames : []);
      setAiReasoning(typeof parsed.aiReasoning === 'string' ? parsed.aiReasoning : '');
      if ([4, 5, 6, 7, 8].includes(parsed.rampSize)) setRampSize(parsed.rampSize);
      // hueShiftStrength: number in [0.0, 2.0]. Missing field (pre-E
      // saved palettes) restores to 1.0, which matches their original
      // generation behavior byte-for-byte. Invalid values silently clamp
      // into range rather than failing the whole load.
      if (typeof parsed.hueShiftStrength === 'number' && Number.isFinite(parsed.hueShiftStrength)) {
        setHueShiftStrength(Math.max(0, Math.min(2, parsed.hueShiftStrength)));
      } else {
        setHueShiftStrength(1.0);
      }
      if (['punchy', 'balanced', 'muted'].includes(parsed.gplStyle)) setGplStyle(parsed.gplStyle);
      if (['punchy', 'balanced', 'muted'].includes(parsed.vizStyle)) setVizStyle(parsed.vizStyle);
      // Only restore the sprite key if it exists in the library after the merge above.
      if (parsed.spriteKey && (DEFAULT_SPRITE_LIBRARY[parsed.spriteKey] || (parsed.customSprites && parsed.customSprites[parsed.spriteKey]) || customSprites[parsed.spriteKey])) {
        setSpriteKey(parsed.spriteKey);
      }
      // Restore the exact shuffleSeed so ramp jitter reproduces identically.
      // Older saved palettes (pre-fix) lack this field; fall back to 0, which
      // gives the deterministic no-jitter ramps. Those old palettes will look
      // slightly different from what was originally saved, but only on first
      // load after this fix, and will be exact on every subsequent save.
      if (typeof parsed.shuffleSeed === 'number' && Number.isFinite(parsed.shuffleSeed)) {
        setShuffleSeed(parsed.shuffleSeed);
      } else {
        setShuffleSeed(0);
      }
      // Restore per-shade overrides. New schema (per-style):
      //   overrides[baseIndex][shadeIndex] = { punchy?, balanced?, muted? }
      // Validate the nested structure: numeric base/shade keys mapping to
      // an object whose only allowed keys are 'punchy', 'balanced', 'muted',
      // each a 6-digit hex. Anything that fails validation is dropped
      // silently rather than failing the whole load. Old shared-style
      // saves (where the inner value was a plain hex string) won't validate;
      // we drop them rather than migrate, since this is a breaking change.
      if (parsed.overrides && typeof parsed.overrides === 'object' && !Array.isArray(parsed.overrides)) {
        const cleaned = {};
        for (const baseKey of Object.keys(parsed.overrides)) {
          const baseIdx = Number(baseKey);
          if (!Number.isInteger(baseIdx) || baseIdx < 0 || baseIdx >= parsed.baseColors.length) continue;
          const inner = parsed.overrides[baseKey];
          if (!inner || typeof inner !== 'object') continue;
          const cleanedInner = {};
          for (const shadeKey of Object.keys(inner)) {
            const shadeIdx = Number(shadeKey);
            if (!Number.isInteger(shadeIdx) || shadeIdx < 0) continue;
            const styleMap = inner[shadeKey];
            if (!styleMap || typeof styleMap !== 'object') continue;
            const cleanedStyles = {};
            for (const styleKey of ['punchy', 'balanced', 'muted']) {
              const hex = styleMap[styleKey];
              if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) {
                cleanedStyles[styleKey] = hex.toLowerCase();
              }
            }
            if (Object.keys(cleanedStyles).length > 0) cleanedInner[shadeIdx] = cleanedStyles;
          }
          if (Object.keys(cleanedInner).length > 0) cleaned[baseIdx] = cleanedInner;
        }
        setOverrides(cleaned);
      } else {
        setOverrides({});
      }
      setPinEditor(null);
      // Restore harmonyAnchor. Validate it's an integer in range of the
      // restored baseColors; otherwise fall back to 0. Pre-feature payloads
      // lack the field, also -> 0.
      if (typeof parsed.harmonyAnchor === 'number' && Number.isInteger(parsed.harmonyAnchor) && parsed.harmonyAnchor >= 0 && parsed.harmonyAnchor < parsed.baseColors.length) {
        setHarmonyAnchor(parsed.harmonyAnchor);
      } else {
        setHarmonyAnchor(0);
      }
      // Restore per-ramp size overrides. Validate each entry: key must be a
      // valid baseIndex, value must be 4..8. Drop anything that fails.
      if (parsed.rampSizeOverrides && typeof parsed.rampSizeOverrides === 'object' && !Array.isArray(parsed.rampSizeOverrides)) {
        const cleaned = {};
        for (const k of Object.keys(parsed.rampSizeOverrides)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const n = parsed.rampSizeOverrides[k];
          if ([4, 5, 6, 7, 8].includes(n)) cleaned[idx] = n;
        }
        setRampSizeOverrides(cleaned);
      } else {
        setRampSizeOverrides({});
      }
      // Restore per-ramp saturation multipliers. Validate: key in range,
      // value a finite number in [0.5, 2.0]. Out-of-range values are clamped.
      if (parsed.rampSatOverrides && typeof parsed.rampSatOverrides === 'object' && !Array.isArray(parsed.rampSatOverrides)) {
        const cleaned = {};
        for (const k of Object.keys(parsed.rampSatOverrides)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const v = Number(parsed.rampSatOverrides[k]);
          if (Number.isFinite(v)) cleaned[idx] = Math.max(0.5, Math.min(2.0, v));
        }
        setRampSatOverrides(cleaned);
      } else {
        setRampSatOverrides({});
      }
      // Restore hiddenShades. Schema: { [baseIndex]: number[] of shade indices }.
      // Validation: numeric baseIndex in range, value an array of non-negative
      // integers (out-of-range shade indices stay in state because they're
      // inert when the ramp size doesn't reach them, same policy as overrides).
      if (parsed.hiddenShades && typeof parsed.hiddenShades === 'object' && !Array.isArray(parsed.hiddenShades)) {
        const cleaned = {};
        for (const k of Object.keys(parsed.hiddenShades)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const arr = parsed.hiddenShades[k];
          if (!Array.isArray(arr)) continue;
          const validIndices = [];
          const seen = new Set();
          for (const v of arr) {
            const n = Number(v);
            if (Number.isInteger(n) && n >= 0 && !seen.has(n)) {
              seen.add(n);
              validIndices.push(n);
            }
          }
          if (validIndices.length > 0) cleaned[idx] = validIndices.sort((a, b) => a - b);
        }
        setHiddenShades(cleaned);
      } else {
        setHiddenShades({});
      }
      // Restore rampShuffleOffsets. Schema: { [baseIndex]: number }.
      // Validation: numeric key in range, value a non-negative finite
      // integer. Out-of-range or non-integer values are dropped.
      if (parsed.rampShuffleOffsets && typeof parsed.rampShuffleOffsets === 'object' && !Array.isArray(parsed.rampShuffleOffsets)) {
        const cleaned = {};
        for (const k of Object.keys(parsed.rampShuffleOffsets)) {
          const idx = Number(k);
          if (!Number.isInteger(idx) || idx < 0 || idx >= parsed.baseColors.length) continue;
          const v = Number(parsed.rampShuffleOffsets[k]);
          if (Number.isInteger(v) && v >= 0) cleaned[idx] = v;
        }
        setRampShuffleOffsets(cleaned);
      } else {
        setRampShuffleOffsets({});
      }
      // Restore hardwareLock. Validate against the known hardware ids.
      // Anything else (including missing field on older payloads) -> null.
      if (typeof parsed.hardwareLock === 'string' && HARDWARE_PALETTES.some(hw => hw.id === parsed.hardwareLock)) {
        setHardwareLock(parsed.hardwareLock);
      } else {
        setHardwareLock(null);
      }
      // Restore lockedRamps. Stored as a sorted array of base indices.
      // Validate: must be an array; each entry must be a non-negative
      // integer in range of the loaded baseColors. Invalid entries are
      // silently dropped, and a missing field (older payloads) loads
      // as empty (nothing locked). The set is rebuilt from the
      // validated entries.
      if (Array.isArray(parsed.lockedRamps)) {
        const validIdx = new Set();
        for (const v of parsed.lockedRamps) {
          if (Number.isInteger(v) && v >= 0 && v < parsed.baseColors.length) {
            validIdx.add(v);
          }
        }
        setLockedRamps(validIdx);
      } else {
        setLockedRamps(new Set());
      }
      // Per-ramp Advanced fields. Absent fields restore to empty.
      setCurvePerRamp(parsed.curvePerRamp && typeof parsed.curvePerRamp === 'object' ? parsed.curvePerRamp : {});
      setGamutPerRamp(parsed.gamutPerRamp && typeof parsed.gamutPerRamp === 'object' ? parsed.gamutPerRamp : {});
      setAdvancedOpen(parsed.advancedOpen && typeof parsed.advancedOpen === 'object' ? parsed.advancedOpen : {});
      setExportFeedback(`Loaded "${parsed.name || slug}"`);
      setTimeout(() => setExportFeedback(''), 2000);
    } catch (err) {
      console.error('loadPalette failed', err);
      setSavedError('Load failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  // Load a built-in classic palette. Unlike loadPalette this doesn't touch
  // storage; the source is the CLASSIC_PALETTES constant. We set the tip text
  // as aiReasoning so the user gets a brief description of what they just
  // loaded. shuffleSeed resets to 0 so the ramps are deterministic and don't
  // depend on whatever shuffle the user happened to be on.
  const loadClassicPalette = (classic) => {
    if (!classic || !Array.isArray(classic.baseColors) || classic.baseColors.length === 0) return;
    pendingLabelRef.current = `Load classic: ${classic.name}`;
    setBaseColors(classic.baseColors);
    setAiColorNames(classic.names || classic.baseColors.map((_, i) => `${classic.name} ${i + 1}`));
    setAiReasoning(`Inspired by ${classic.name}. ${classic.tip}`);
    resetPaletteState();
    // Classics weren't designed for any specific hardware constraint. Clear
    // any active lock so the loaded classic renders as-authored.
    setHardwareLock(null);
    setShuffleSeed(0);
    setExportFeedback(`Loaded "${classic.name}"`);
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // GPL import: a .gpl file is parsed, and if successful the user is shown
  // a modal that lets them choose between "use all N colors as bases"
  // (capped at 16, truncated if longer) and "auto-pick representatives"
  // (subset down to ~5 mid-lightness, evenly spaced by hue).
  // gplImport state shape: { name, colors, error } | null
  //   - name: palette name pulled from the file (cosmetic)
  //   - colors: full array of parsed hex strings (used for the "all" branch)
  //   - error: present if parsing failed and the modal should show an error
  const [gplImport, setGplImport] = useState(null);
  const gplFileInputRef = useRef(null);

  const handleGplFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseGpl(text);
      if (!parsed) {
        setGplImport({ name: file.name, colors: [], error: 'Not a valid .gpl file. Expected a "GIMP Palette" header and R G B values.' });
        return;
      }
      setGplImport({ name: parsed.name || file.name.replace(/\.[^/.]+$/, ''), colors: parsed.colors, error: null });
    };
    reader.onerror = () => {
      setGplImport({ name: file.name, colors: [], error: 'Could not read the file.' });
    };
    reader.readAsText(file);
  };

  // Apply the user's import choice. mode is either 'all' or 'subset'.
  // 'all' uses the first 16 unique colors verbatim (hard cap). 'subset'
  // runs the heuristic. The actual write into baseColors mirrors the
  // loadClassicPalette reset behavior: clears overrides, pins, anchor,
  // hardware lock, shuffleSeed, and the per-ramp size/sat overrides.
  const applyGplImport = (mode) => {
    if (!gplImport || gplImport.error || gplImport.colors.length === 0) return;
    let chosen;
    if (mode === 'subset') {
      chosen = subsetGplColors(gplImport.colors);
    } else {
      // 'all' branch: dedupe and hard-cap at 16.
      const seen = new Set();
      const uniq = [];
      for (const hex of gplImport.colors) {
        const n = hex.toLowerCase();
        if (!seen.has(n)) { seen.add(n); uniq.push(n); }
        if (uniq.length >= 16) break;
      }
      chosen = uniq;
    }
    if (chosen.length === 0) return;
    pendingLabelRef.current = `Import GPL: ${gplImport.name}`;
    setBaseColors(chosen);
    setAiColorNames(chosen.map((_, i) => `${gplImport.name} ${i + 1}`));
    setAiReasoning(`Imported from ${gplImport.name}. ${chosen.length} base color${chosen.length === 1 ? '' : 's'} loaded.`);
    resetPaletteState();
    setHardwareLock(null);
    setShuffleSeed(0);
    setGplImport(null);
    const note = mode === 'subset' ? `Imported ${chosen.length} representatives from ${gplImport.colors.length}` : `Imported ${chosen.length}${gplImport.colors.length > chosen.length ? ` (truncated from ${gplImport.colors.length}, cap is 16)` : ''}`;
    setExportFeedback(note);
    setTimeout(() => setExportFeedback(''), 3500);
  };

  // Toggle a single ramp card's collapse state. When collapsing a card
  // whose base editor or pin editor is currently open, close those too
  // since they reference shades that are about to be hidden.
  const toggleRampCollapse = (index) => {
    setCollapsedRamps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        if (editingIndex === index) setEditingIndex(null);
        if (pinEditor && pinEditor.baseIndex === index) setPinEditor(null);
      }
      return next;
    });
  };

  // Bulk collapse/expand: if ANY card is currently expanded, collapse all.
  // Otherwise expand all. This makes the button label predictable: it always
  // does the action that affects the visible majority. Collapsing also
  // closes any open base or pin editors.
  const anyRampExpanded = baseColors.some((_, i) => !collapsedRamps.has(i));
  const toggleAllRampsCollapse = () => {
    if (anyRampExpanded) {
      setCollapsedRamps(new Set(baseColors.map((_, i) => i)));
      setEditingIndex(null);
      setPinEditor(null);
    } else {
      setCollapsedRamps(new Set());
    }
  };

  // toggleHardwareLock: switches the hardware lock on/off. If already locked
  // to the given hardware, clicking again unlocks. If locked to a different
  // hardware, switches the lock target. Setting the lock is NON-destructive:
  // baseColors and overrides are preserved as-is. The lock is applied at
  // render time via applyHardwareLock in the ramp useMemos. This means
  // unlocking restores the full free-generation ramps without data loss.
  //
  // Pin overrides ARE retained while locked but get snapped on output via
  // the order of operations in the useMemos (applyOverrides runs first,
  // then applyHardwareLock snaps everything including the pinned hex).
  // This was a deliberate choice: clearing pins on lock would force the
  // user to re-pin every time they toggled. Instead, pinned hexes get
  // visually snapped while locked and reappear as the user's chosen hex
  // when unlocked.
  const toggleHardwareLock = (hardwareId) => {
    if (hardwareLock === hardwareId) {
      pendingLabelRef.current = 'Unlock hardware';
      setHardwareLock(null);
      setExportFeedback(`Unlocked from hardware`);
    } else {
      const hw = HARDWARE_PALETTES.find(h => h.id === hardwareId);
      pendingLabelRef.current = hw ? `Lock to ${hw.name}` : 'Lock hardware';
      setHardwareLock(hardwareId);
      setExportFeedback(hw ? `Locked to ${hw.name}` : 'Locked');
    }
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // bakeHardwareLock: convert the currently-snapped output into permanent
  // pins so the user can keep editing without reverting to non-legal hexes.
  //
  // Strategy (the "diff-only" option from the analysis): for each
  // (base, shade, style), compute the post-pin pre-snap value `withPins`
  // and the post-snap value `snapped`. Pin the (base, shade, style) only
  // when snapped !== withPins. This minimizes pin bloat: shades the lock
  // wouldn't have changed are left procedural so future tweaks
  // (rampSize, hue shift, base color edits, sat multiplier) still affect
  // them naturally. Shades the lock DID change become permanent pins.
  //
  // Existing pins on shades the lock would NOT have changed are preserved
  // verbatim. Existing pins on shades the lock WOULD have changed get
  // REPLACED with the snapped value (because the user was looking at the
  // snapped output anyway; preserving the unsnapped pin would silently
  // un-bake that one shade).
  //
  // Per-style independence: a pin in (i, j, 'punchy') doesn't affect
  // (i, j, 'balanced'). Each style is baked independently.
  //
  // Dedup note: applyHardwareLock dedupes consecutive duplicates for
  // DISPLAY, but bake pins by the pre-dedup shade index (every slot of
  // the full ramp). After unlocking, an 8-shade ramp on Game Boy will
  // show 8 slots with consecutive duplicates rather than the 4-color
  // deduped view. To get the deduped view back, use hidden shades.
  // Trade-off: the pin grid stays slot-aligned with the rest of the app.
  //
  // Clears hardwareLock to null after writing pins, since the same hexes
  // are now baked in. History entry tagged 'Bake hardware lock'.
  const bakeHardwareLock = () => {
    if (!activeHardware) return;
    pendingLabelRef.current = 'Bake hardware lock';
    const STYLES = ['punchy', 'balanced', 'muted'];
    setOverrides(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      for (let i = 0; i < baseColors.length; i++) {
        const effBase = resolveBaseForRamp(baseColors[i], i);
        const effSize = resolveSizeForRamp(i);
        const seed = shuffleSeed * 17 + i * 31 + (rampShuffleOffsets[i] || 0) * 13;
        for (const style of STYLES) {
          const raw = generateRamp(effBase, effSize, seed, style, hueShiftStrength);
          const withPins = applyOverrides(raw, i, prev, style);
          const snapped = withPins.map(hex => quantizeToHardware(hex, activeHardware));
          for (let j = 0; j < withPins.length; j++) {
            if (snapped[j] !== withPins[j]) {
              if (!next[i]) next[i] = {};
              if (!next[i][j]) next[i][j] = {};
              next[i][j][style] = snapped[j];
            }
          }
        }
      }
      return next;
    });
    setHardwareLock(null);
    setExportFeedback('Baked hardware lock into pins');
    setTimeout(() => setExportFeedback(''), 2500);
  };

  // Escape closes the topmost dismissable thing. Priority order is
  // outer-to-inner: a modal sitting over everything closes first, then
  // editor panels, then the floating WCAG Check picker. Skipping
  // editable-focus is intentional (same reasoning as the undo handler):
  // hitting Esc mid-typing should not surprise the user by closing a
  // surrounding panel. Users dismiss editors from inside their inputs
  // via the existing Close/Done buttons.
  //
  // Placement note: this useEffect must come AFTER all four pieces of
  // state it reads (`gplImport`, `pinEditor`, `editingIndex`,
  // `compareMode`) are declared. `gplImport` is the latest at ~3440.
  // An earlier placement throws "Cannot access 'gplImport' before
  // initialization" when React evaluates the dependency array during
  // render (temporal dead zone on the `const` from `useState`).
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Escape') return;
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      if (gplImport) {
        e.preventDefault();
        setGplImport(null);
        return;
      }
      if (pinEditor) {
        e.preventDefault();
        setPinEditor(null);
        return;
      }
      if (editingIndex !== null) {
        e.preventDefault();
        setEditingIndex(null);
        return;
      }
      if (compareMode) {
        e.preventDefault();
        setCompareMode(false);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gplImport, pinEditor, editingIndex, compareMode]);

  // KEYBOARD SHORTCUTS: S, H
  //
  //   S - Focus the Save palette name input and scroll it into view.
  //   H - Harmonize. The harmonize() helper has its own internal guards
  //       (returns early with a feedback toast if base count < 2 or no
  //       unlocked targets), so we forward unconditionally.
  //
  // G previously triggered Generate. Removed because after the
  // session 2 followup, Generate was renamed to "New palette" and
  // downgraded to a secondary action since it's destructive (wipes
  // pins, hidden shades, locks, anchor, side-by-side slots). A
  // single-key shortcut for an unconfirmed destructive operation is
  // a footgun, especially when the renamed button no longer maps to
  // the letter "G." If a shortcut for the primary Add base action
  // is wanted later, "A" is the obvious candidate.
  //
  // Bare letter keys (no Cmd/Ctrl). Same editable-focus guard as the
  // undo/Escape handlers so the shortcuts don't fire while the user is
  // typing in any input or textarea. No Shift, Alt, or modifier required;
  // gated to plain key strokes so keyboard navigation with modifiers
  // (e.g. browser Find: Cmd+H, Cmd+S) is not affected.
  //
  // Placement: must be AFTER `gplImport`'s state declaration (same TDZ
  // constraint as the Escape handler at line ~3570). `harmonize` declares
  // earlier in the component body.
  useEffect(() => {
    const handler = (e) => {
      // Modifier-gated keys are claimed by the browser or by the existing
      // undo handler. Only fire on plain letter presses.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Skip when typing in any input or textarea so the letter lands in
      // the field, not the shortcut.
      const target = e.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      // Don't intercept while a modal or editor is open. Esc dismisses
      // those; layering shortcuts on top would be surprising.
      if (gplImport || pinEditor || editingIndex !== null) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        const node = saveNameInputRef.current;
        if (node) {
          // scrollIntoView with smooth + center keeps the save panel visible
          // even when the user pressed S from way up the page.
          try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
          node.focus();
        }
      } else if (key === 'h') {
        e.preventDefault();
        harmonize();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [baseColors, lockedRamps, safeAnchor, gplImport, pinEditor, editingIndex]);
  // Dep array notes: `baseColors`, `lockedRamps`, and `safeAnchor` are
  // what harmonize reads directly (the H shortcut). `gplImport` /
  // `pinEditor` / `editingIndex` gate both shortcuts (modal-open
  // suppression). The S shortcut only reads from a ref, so it adds no
  // deps. Everything else the handlers touch is via setters (which
  // always see fresh state) or refs (which sidestep closures). If you
  // add a new shortcut whose action function reads more state, add
  // those reads here too.

  // Two-click delete: first click arms the slug, second click within 3s commits.
  const requestDeletePalette = (slug) => {
    if (confirmDeleteSlug === slug) {
      // Second click: commit.
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
      deletePalette(slug);
      return;
    }
    setConfirmDeleteSlug(slug);
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmDeleteSlug(null);
      confirmTimerRef.current = null;
    }, 3000);
  };

  const deletePalette = async (slug) => {
    setSavedError('');
    setConfirmDeleteSlug(null);
    if (typeof window === 'undefined' || !window.storage) {
      setSavedError('Storage is not available in this environment');
      return;
    }
    setSavedBusy(true);
    try {
      await window.storage.delete(`palettes:${slug}`);
      await refreshSavedPalettes();
    } catch (err) {
      console.error('deletePalette failed', err);
      setSavedError('Delete failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  // Rename a saved palette in place. Strategy A: only the user-visible
  // `name` field in the payload changes; the storage key (slug) stays the
  // same. This is simpler than re-slugging (no conflict handling, no
  // set+delete window) and the slug is never visible to the user. The
  // tradeoff is that the slug may no longer match the name if the user
  // inspects storage directly. Acceptable since storage inspection is not
  // a feature.
  const startRename = (slug, currentName) => {
    if (confirmDeleteSlug) {
      setConfirmDeleteSlug(null);
      if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
    }
    setRenamingSlug(slug);
    setRenameDraft(currentName || '');
    setRenameError('');
  };
  const cancelRename = () => {
    setRenamingSlug(null);
    setRenameDraft('');
    setRenameError('');
  };
  const commitRename = async (slug) => {
    setRenameError('');
    const trimmed = renameDraft.trim();
    if (!trimmed) { setRenameError('Name cannot be empty'); return; }
    // No-op if name is unchanged. The current name lives in savedPalettes;
    // look it up rather than passing it in so a stale draft (e.g. caps
    // changes only) still cleanly no-ops.
    const existing = savedPalettes.find(p => p.slug === slug);
    if (existing && existing.name === trimmed) { cancelRename(); return; }
    // Reject if another saved palette already uses this exact display name.
    if (savedPalettes.some(p => p.slug !== slug && p.name === trimmed)) {
      setRenameError('Another palette already uses this name');
      return;
    }
    if (typeof window === 'undefined' || !window.storage) {
      setRenameError('Storage is not available in this environment');
      return;
    }
    setSavedBusy(true);
    try {
      const got = await window.storage.get(`palettes:${slug}`);
      if (!got || !got.value) {
        setRenameError('Palette not found in storage');
        setSavedBusy(false);
        return;
      }
      const parsed = JSON.parse(got.value);
      if (!parsed || typeof parsed !== 'object') {
        setRenameError('Palette data is invalid');
        setSavedBusy(false);
        return;
      }
      parsed.name = trimmed;
      const result = await window.storage.set(`palettes:${slug}`, JSON.stringify(parsed));
      if (!result) {
        setRenameError('Rename failed (storage returned null)');
        setSavedBusy(false);
        return;
      }
      await refreshSavedPalettes();
      cancelRename();
    } catch (err) {
      console.error('commitRename failed', err);
      setRenameError('Rename failed: ' + (err && err.message ? err.message : 'unknown error'));
    } finally {
      setSavedBusy(false);
    }
  };

  const copyHex = async (hex) => {
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(hex); success = true; } catch {}
    }
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = hex;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setCopiedHex(success ? hex : 'FAIL:' + hex);
    setTimeout(() => setCopiedHex(null), success ? 1000 : 1500);
  };

  const buildPaletteText = () => {
    const lines = ['# PIXEL.PAL Palette Export', `# Generated ${new Date().toLocaleString()}`, ''];

    baseColors.forEach((_, i) => {
      const name = aiColorNames[i] || `Color ${i + 1}`;
      const punchy = rampsPunchy[i];
      const balanced = rampsBalanced[i];
      const muted = rampsMuted[i];
      // Compute per-style labels: each style ramp may have its own base
      // position after sort (because the style curves can clamp shades
      // around the base differently). The effective base hex is the
      // input baseColors[i] post sat-override (resolveBaseForRamp).
      const effectiveBase = resolveBaseForRamp(baseColors[i], i);
      const labelsP = labelsForRamp(punchy, effectiveBase);
      const labelsB = labelsForRamp(balanced, effectiveBase);
      const labelsM = labelsForRamp(muted, effectiveBase);
      const fP = filterHidden(punchy, labelsP, i);
      const fB = filterHidden(balanced, labelsB, i);
      const fM = filterHidden(muted, labelsM, i);
      lines.push(`## ${name}`);
      lines.push('### Punchy');
      fP.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fP.labels[k]}`));
      lines.push('### Balanced');
      fB.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fB.labels[k]}`));
      lines.push('### Muted');
      fM.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fM.labels[k]}`));
      lines.push('');
    });
    lines.push('## Harmony Colors');
    lines.push(`${harmony.complementary.toUpperCase()}  complementary`);
    lines.push(`${harmony.analogous1.toUpperCase()}  analogous 1`);
    lines.push(`${harmony.analogous2.toUpperCase()}  analogous 2`);
    lines.push(`${harmony.triadic1.toUpperCase()}  triadic 1`);
    lines.push(`${harmony.triadic2.toUpperCase()}  triadic 2`);
    lines.push(`${harmony.splitComp1.toUpperCase()}  split-complementary 1`);
    lines.push(`${harmony.splitComp2.toUpperCase()}  split-complementary 2`);
    lines.push(`${harmony.tetradic1.toUpperCase()}  tetradic 1`);
    lines.push(`${harmony.tetradic2.toUpperCase()}  tetradic 2`);
    lines.push(`${harmony.tetradic3.toUpperCase()}  tetradic 3`);
    lines.push(`${harmony.square1.toUpperCase()}  square 1`);
    lines.push(`${harmony.square2.toUpperCase()}  square 2`);
    lines.push(`${harmony.square3.toUpperCase()}  square 3`);
    // Unique-colors appendix: a flat deduped list across every ramp and
    // every style, plus harmony. Useful for tools that want a single
    // copy-paste list and for verifying total unique count at a glance.
    lines.push('');
    lines.push('## Unique Colors');
    const allStyleHexes = [
      ...rampsPunchy.flat(),
      ...rampsBalanced.flat(),
      ...rampsMuted.flat(),
      harmony.complementary,
      harmony.analogous1, harmony.analogous2,
      harmony.triadic1, harmony.triadic2,
      harmony.splitComp1, harmony.splitComp2,
      harmony.tetradic1, harmony.tetradic2, harmony.tetradic3,
      harmony.square1, harmony.square2, harmony.square3,
    ];
    const uniqueColors = dedupeHexes(allStyleHexes);
    uniqueColors.forEach(hex => lines.push(hex.toUpperCase()));
    lines.push(`# ${uniqueColors.length} unique colors`);
    return lines.join('\n');
  };

  const exportPalette = async () => {
    try {
      const text = buildPaletteText();
      const result = await saveFile({
        defaultName: 'pixel-pal-palette.txt',
        filters: [{ name: 'Pixel Pal palette', extensions: ['txt'] }],
        data: { text },
        folderKey: 'txt',
      });
      if (result.canceled) {
        setExportFeedback('Save canceled');
      } else if (!result.ok) {
        setExportFeedback('Failed: try Copy');
      } else {
        setExportFeedback('Downloaded!');
      }
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Failed: try Copy');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  const copyPaletteToClipboard = async () => {
    const text = buildPaletteText();
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); success = true; } catch {}
    }
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setExportFeedback(success ? 'Copied!' : 'Copy failed');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  const buildPaletteGpl = (style) => {

    const entries = [];
    const ramps = style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;
    baseColors.forEach((_, i) => {
      const name = aiColorNames[i] || `Color ${i + 1}`;
      const ramp = ramps[i];
      const effectiveBase = resolveBaseForRamp(baseColors[i], i);
      const labels = labelsForRamp(ramp, effectiveBase);
      const filtered = filterHidden(ramp, labels, i);
      filtered.hexes.forEach((hex, k) => entries.push({ hex, name: `${name} ${filtered.labels[k]}` }));
    });
    entries.push({ hex: harmony.complementary, name: 'harmony complementary' });
    entries.push({ hex: harmony.analogous1, name: 'harmony analogous 1' });
    entries.push({ hex: harmony.analogous2, name: 'harmony analogous 2' });
    entries.push({ hex: harmony.triadic1, name: 'harmony triadic 1' });
    entries.push({ hex: harmony.triadic2, name: 'harmony triadic 2' });
    entries.push({ hex: harmony.splitComp1, name: 'harmony split-comp 1' });
    entries.push({ hex: harmony.splitComp2, name: 'harmony split-comp 2' });
    entries.push({ hex: harmony.tetradic1, name: 'harmony tetradic 1' });
    entries.push({ hex: harmony.tetradic2, name: 'harmony tetradic 2' });
    entries.push({ hex: harmony.tetradic3, name: 'harmony tetradic 3' });
    entries.push({ hex: harmony.square1, name: 'harmony square 1' });
    entries.push({ hex: harmony.square2, name: 'harmony square 2' });
    entries.push({ hex: harmony.square3, name: 'harmony square 3' });

    // Dedupe entries by hex. GPL consumers (Aseprite, GIMP, etc.) expect
    // unique colors — duplicate entries are ignored or cause confusion.
    // Keep first occurrence's name so the most prominent slot label wins.
    const seenHex = new Set();
    const uniqueEntries = [];
    for (const e of entries) {
      const key = (e.hex || '').toLowerCase();
      if (!key || seenHex.has(key)) continue;
      seenHex.add(key);
      uniqueEntries.push(e);
    }

    const pad3 = (n) => String(n).padStart(3, ' ');
    const styleLabel = style === 'balanced' ? 'Balanced' : style === 'muted' ? 'Muted' : 'Punchy';
    const lines = [
      'GIMP Palette',
      `Name: PIXEL.PAL ${styleLabel}`,
      `Columns: ${rampSize}`,
      '#',
    ];
    uniqueEntries.forEach(({ hex, name }) => {
      const { r, g, b } = hexToRgb(hex);
      lines.push(`${pad3(r)} ${pad3(g)} ${pad3(b)}\t${name}`);
    });
    return lines.join('\n') + '\n';
  };

  const exportPaletteGpl = async () => {
    try {
      const text = buildPaletteGpl(gplStyle);
      const result = await saveFile({
        defaultName: `pixel-pal-${gplStyle}.gpl`,
        filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
        data: { text },
        folderKey: 'gpl',
      });
      if (result.canceled) {
        setExportFeedback('Save canceled');
      } else if (!result.ok) {
        setExportFeedback('GPL export failed');
      } else {
        setExportFeedback(`Downloaded ${gplStyle}.gpl!`);
      }
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('GPL export failed');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  // PER-RAMP EXPORT HELPERS
  //
  // Both return strings derived from a single ramp at index `i` rendered
  // in `style` (one of punchy/balanced/muted). They mirror the same
  // pipeline as the full-palette exporters: resolve effective base,
  // compute per-ramp labels (so 'base' lands on the right slot when
  // style curves shift it off slot N/2), and filter out hidden shades.
  //
  // buildSingleRampText: plain hex list, one per line, lowercase #rrggbb.
  // buildSingleRampGpl: canonical GIMP format scoped to one ramp.
  //
  // Style is passed explicitly rather than read from state so callers
  // can decide which style to export (the UI passes vizStyle, which is
  // what the user is actively viewing).
  const _selectRampsForStyle = (style) =>
    style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;

  const _filteredRamp = (i, style) => {
    const ramps = _selectRampsForStyle(style);
    const ramp = ramps[i];
    const effectiveBase = resolveBaseForRamp(baseColors[i], i);
    const labels = labelsForRamp(ramp, effectiveBase);
    return filterHidden(ramp, labels, i);
  };

  const buildSingleRampText = (i, style) => {
    const filtered = _filteredRamp(i, style);
    return dedupeHexes(filtered.hexes).join('\n') + '\n';
  };

  const buildSingleRampGpl = (i, style) => {
    const filtered = _filteredRamp(i, style);
    const name = aiColorNames[i] || `Color ${i + 1}`;
    // Dedupe by hex, keep the first label encountered. Hardware-locked ramps
    // collapse to fewer unique colors than positions; GPL consumers expect
    // unique entries.
    const seenHex = new Set();
    const entries = [];
    for (let k = 0; k < filtered.hexes.length; k++) {
      const key = (filtered.hexes[k] || '').toLowerCase();
      if (!key || seenHex.has(key)) continue;
      seenHex.add(key);
      entries.push({ hex: filtered.hexes[k], label: filtered.labels[k] });
    }
    const pad3 = (n) => String(n).padStart(3, ' ');
    const styleLabel = style === 'balanced' ? 'Balanced' : style === 'muted' ? 'Muted' : 'Punchy';
    const lines = [
      'GIMP Palette',
      `Name: PIXEL.PAL ${name} ${styleLabel}`,
      `Columns: ${entries.length}`,
      '#',
    ];
    entries.forEach(({ hex, label }) => {
      const { r, g, b } = hexToRgb(hex);
      lines.push(`${pad3(r)} ${pad3(g)} ${pad3(b)}\t${name} ${label}`);
    });
    return lines.join('\n') + '\n';
  };

  // Per-ramp clipboard copy. Reuses the two-tier pattern from
  // copyPaletteToClipboard (Clipboard API first, textarea + execCommand
  // fallback for older surfaces / non-secure contexts). Reads
  // rampExportStyle, which is independent of the Visualization vizStyle
  // setting (see state declaration around line 1190 for rationale).
  const copyRampToClipboard = async (i) => {
    const text = buildSingleRampText(i, rampExportStyle);
    const count = text.trim().split('\n').length;
    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); success = true; } catch {}
    }
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        success = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }
    setExportFeedback(success ? `Copied ${count} shade${count === 1 ? '' : 's'}` : 'Copy failed');
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // Per-ramp .gpl download. File naming: pixel-pal-ramp-{i+1}-{style}.gpl
  // (the per-ramp index plus the active rampExportStyle, so multiple
  // downloads in a session don't collide). One-based to match how the
  // user sees ramps (Color 1, Color 2, ...). Reads rampExportStyle, NOT
  // vizStyle (the Visualization panel's style); see state declaration
  // for rationale.
  const downloadSingleRampGpl = (i) => {
    try {
      const text = buildSingleRampGpl(i, rampExportStyle);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `pixel-pal-ramp-${i + 1}-${rampExportStyle}.gpl`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setExportFeedback(`Downloaded ramp ${i + 1}.gpl`);
      setTimeout(() => setExportFeedback(''), 2000);
    } catch {
      setExportFeedback('Ramp GPL export failed');
      setTimeout(() => setExportFeedback(''), 3000);
    }
  };

  const Swatch = ({ hex, label, large = false, borderClass = 'border-cyan-400', shadowRgba = 'rgba(0, 255, 255, 0.3)', baseIndex = null, shadeIndex = null, style = null, onContextMenu = null, extraTooltip = null }) => {
    const isCopied = copiedHex === hex;
    const isFailed = copiedHex === 'FAIL:' + hex;
    // A swatch is "pinnable" if it knows its position in the ramp grid
    // AND which style it belongs to. Harmony swatches and any other ad-hoc
    // swatches don't pass these props and behave exactly as before (no pushpin).
    const pinnable = baseIndex !== null && shadeIndex !== null && style !== null;
    const pinned = pinnable && isShadePinned(baseIndex, shadeIndex, style);
    const pinEditorOpenHere = pinnable && pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex && pinEditor.style === style;
    // Compare-mode awareness. Only ramp swatches participate (pinnable);
    // harmony/ad-hoc swatches stay click-to-copy regardless of compare mode.
    const isAnchor = pinnable && compareAnchor
                  && compareAnchor.baseIndex === baseIndex
                  && compareAnchor.shadeIndex === shadeIndex
                  && compareAnchor.style === style;
    const compareActive = compareMode && pinnable;
    // Tooltip composition. Three sources, concatenated with " | ":
    //   - mode hint (copy / compare)
    //   - right-click hint (hide shade) if available
    //   - adjacent-pair contrast info from extraTooltip
    const hintParts = [];
    if (compareActive) {
      if (!compareAnchor) hintParts.push(`Click to set ${hex} as anchor`);
      else if (isAnchor) hintParts.push(`Anchor (${hex}). Click again to unlock.`);
      else hintParts.push(`Compare ${hex} vs anchor (${compareAnchor.hex})`);
    } else {
      hintParts.push(`Click to copy ${hex}`);
      if (onContextMenu) hintParts.push('Right-click to hide this shade across all 3 styles');
    }
    if (extraTooltip) hintParts.push(extraTooltip);
    const hoverHint = hintParts.join(' | ');
    const handleClick = () => {
      if (compareActive) {
        pickCompareSwatch(baseIndex, shadeIndex, style, hex);
      } else {
        copyHex(hex);
      }
    };
    return (
      <div className="flex flex-col items-center gap-1 w-full min-w-0">
        <div className="relative group">
          <button
            onClick={handleClick}
            onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(); } : undefined}
            className={`relative ${large ? 'w-16 h-16' : 'w-12 h-12'} rounded border-2 ${borderClass} hover:scale-110 transition-transform cursor-pointer flex-shrink-0 ${isAnchor ? 'ring-4 ring-yellow-300' : ''}`}
            style={{ backgroundColor: hex, boxShadow: isAnchor ? '0 0 14px #ffff00' : `0 0 8px ${shadowRgba}` }}
            title={hoverHint}
          >
            {isCopied && <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded text-cyan-200 text-[10px] font-bold">Copied!</div>}
            {isFailed && <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 rounded text-red-100 text-[10px] font-bold leading-tight text-center px-1">Copy<br/>failed</div>}
          </button>
          {/* Hover + button: promote this generated shade to a new base
              color. Only shown on ramp-grid swatches (pinnable === true,
              same gate the Pin button uses) and hidden if the exact hex
              is already a base (duplicate add is a likely mistake, and
              HarmonySwatch uses the same precedent). Click stops event
              propagation so the swatch's copy-to-clipboard doesn't also
              fire. Positioned top-LEFT, opposite the Pin (top-right),
              so they don't overlap. Group-hover on the parent .relative
              div surfaces this on swatch hover, matching the
              HarmonySwatch "+" affordance.

              State to update on click: only baseColors. No other base-
              keyed map needs an entry at the new index (sparse maps
              default to "no override"), and the auto-collapse useEffect
              that watches baseColors.length will collapse the new ramp
              card if the resulting total is >=3. Tag history with a
              specific label so undo lands somewhere sensible. */}
          {pinnable && label !== 'base' && !baseColors.includes(hex) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                pendingLabelRef.current = 'Add base from shade';
                setBaseColors(prev => [...prev, hex]);
              }}
              title={`Add ${hex.toUpperCase()} as a new base color`}
              className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full border flex items-center justify-center transition-all hover:scale-110 bg-cyan-300 text-purple-900 border-cyan-100 opacity-0 group-hover:opacity-100"
              style={{ boxShadow: '0 0 6px rgba(0, 255, 255, 0.7)' }}
            >
              <Plus size={12} strokeWidth={3} />
            </button>
          )}
          {/* Pin button: shown on every shade EXCEPT the one labeled
              'base'. Rationale: the 'base' label is positioned by
              labelsForRamp to land on the slot containing the input
              base hex (which is preserved exactly by generateRamp's
              `const baseColor = { ...base };` line). So the 'base'
              swatch ALWAYS shows the input base hex. Pinning that hex
              would just substitute it for itself, accomplishing nothing
              in the common case, and would actively trap the user if
              they edit the base via the slider editor: the pin would
              override the new base and make the edit appear to do
              nothing. Hardware lock applies AFTER pins anyway, so a
              pinned base under hwlock just gets snapped to a hardware-
              legal color too. We DO still show the button on a pinned
              base shade so the user can clear pre-existing pins
              inherited from older saved palettes (when this UI didn't
              exist). */}
          {pinnable && (label !== 'base' || pinned) && (
            <button
              onClick={(e) => { e.stopPropagation(); togglePinEditor(baseIndex, shadeIndex, style, hex); }}
              title={pinned ? `Unpin this ${style} shade` : `Pin this ${style} shade`}
              className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border flex items-center justify-center transition-all hover:scale-110 ${pinned ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/80 text-cyan-200 border-cyan-500/60 opacity-60 hover:opacity-100'} ${pinEditorOpenHere ? 'ring-2 ring-yellow-200' : ''}`}
              style={pinned ? { boxShadow: '0 0 6px rgba(255, 255, 0, 0.7)' } : {}}
            >
              <Pin size={10} strokeWidth={pinned ? 3 : 2} />
            </button>
          )}
        </div>
        <span className="text-xs font-mono truncate w-full text-center" style={{ color: t.swatchHex }}>{hex.toUpperCase()}</span>
        {label && <span className="text-[10px] w-full text-center leading-tight break-words" style={{ color: t.swatchLabel }}>{label}</span>}
      </div>
    );
  };

  const HarmonySwatch = ({ hex, name }) => {
    const isAdded = baseColors.includes(hex);
    return (
      <button
        onClick={() => addHarmonyColor(hex, name)}
        disabled={isAdded}
        title={isAdded ? `${name} (${hex.toUpperCase()}) is already in the palette` : `Add ${name} (${hex.toUpperCase()}) as a new base`}
        className={`relative w-14 h-14 rounded border-2 border-pink-400 transition-all cursor-pointer group ${isAdded ? 'opacity-60 cursor-not-allowed' : 'hover:scale-110 hover:ring-2 hover:ring-cyan-400'}`}
        style={{ backgroundColor: hex, boxShadow: '0 0 8px rgba(255, 0, 255, 0.4)' }}
      >
        {isAdded && <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded text-cyan-200 text-lg font-bold">{'✓'}</div>}
        {!isAdded && <div className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-300 border-2 border-cyan-100 rounded-full flex items-center justify-center text-purple-900 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">+</div>}
      </button>
    );
  };

  // Theme token map. Centralizes every theme-aware className and color
  // value used by the chrome. The principle: section accent hues
  // (cyan/pink/yellow/green/purple) stay recognizable across all three
  // themes, but their lightness/saturation are adjusted so they remain
  // legible against the corresponding background and don't vibrate.
  //
  // Color data (swatches, sprites, harmony swatches, mosaic, chromatic plot
  // dots) is NEVER themed because those are the data being judged. Only
  // chrome adapts.
  //
  // Each token returns a Tailwind className string or a raw CSS value. We
  // use raw values for inline styles where we need rgba alpha or computed
  // shadows that Tailwind can't easily express.
  const themeTokens = {
    dark: {
      pageBg: 'linear-gradient(180deg, #1a0033 0%, #2d0052 30%, #ff006e 100%)',
      showVaporwave: true,
      crtIntensity: 'rgba(0,0,0,0.15)',
      cardBgCyan: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(45, 0, 82, 0.85) 100%)',
      cardBgPink: 'linear-gradient(135deg, rgba(255, 0, 110, 0.3) 0%, rgba(45, 0, 82, 0.85) 100%)',
      cardBgPinkBright: 'linear-gradient(135deg, rgba(45, 0, 82, 0.85) 0%, rgba(255, 0, 110, 0.4) 100%)',
      cardBgYellow: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(80, 0, 120, 0.5) 100%)',
      cardBgGreen: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(0, 80, 80, 0.5) 100%)',
      cardBgViz: 'linear-gradient(135deg, rgba(15, 0, 30, 0.85) 0%, rgba(80, 0, 120, 0.5) 100%)',
      titleGlow: '3px 3px 0 #ff006e, 6px 6px 0 #00ffff, 9px 9px 20px rgba(255, 0, 255, 0.5)',
      titleColor: '#ffffff',
      subtitleColor: '#67e8f9',
      subtitleGlow: '0 0 8px #00ffff',
      glowStrong: 1.0,
      bodyText: 'text-cyan-200',
      mutedText: 'text-cyan-100/80',
      inputBg: 'bg-black/60',
      inputTextCyan: 'text-cyan-200',
      inputTextPink: 'text-pink-200',
      inputTextYellow: 'text-yellow-100',
      // Control button tokens (controlBtnDefault / controlBtnHover):
      // Tailwind className strings for the UNSELECTED state of segmented-
      // control buttons (Shades, Preview Sprite, Ramp Export style, etc).
      // Applied as `${t.controlBtnDefault} ${t.controlBtnHover}` together.
      // The SELECTED state is hardcoded `bg-cyan-300 text-purple-900
      // border-cyan-100` at every callsite and works across themes
      // unchanged. Earlier versions hardcoded `bg-purple-900/60 text-cyan-
      // 200 border-purple-700/50 hover:bg-purple-800/60`; this is fine on
      // dark but reads as dark-purple islands floating on gray / cream
      // backgrounds in Neutral and Light. Centralized here.
      controlBtnDefault: 'bg-purple-900/60 text-cyan-200 border-purple-700/50',
      controlBtnHover: 'hover:bg-purple-800/60',
      // controlPanelBg: backing for the container that wraps a group of
      // segmented control buttons (e.g. the small rounded box around the
      // Ramp Export Punchy/Balanced/Muted toggle). Same theme-adaptation
      // rationale as controlBtnDefault.
      controlPanelBg: 'bg-purple-900/40',
      controlPanelBorder: 'border-cyan-700/50',
      // Alert / info box tokens. The pre-token codebase used patterns
      // like `bg-cyan-900/20 text-cyan-200` for info boxes (computing,
      // confirm-required, etc), `bg-yellow-900/20 text-yellow-200` for
      // warnings, and `bg-pink-900/30 text-pink-100` / `bg-red-900/30
      // text-red-100` for vision text and errors. These dark-color-over-
      // dark-bg patterns produce <2:1 contrast on Light theme because the
      // alpha lets the cream pageBg show through; the dark text on the
      // resulting muddy-tan composite is unreadable. Tokens below give
      // each theme a readable equivalent: Dark keeps the original
      // dark-color-tint look, Neutral and Light flip to light tint with
      // dark text.
      alertInfoBg: 'bg-cyan-900/20',
      alertInfoText: 'text-cyan-200',
      alertInfoBorder: 'border-cyan-400/60',
      alertWarnBg: 'bg-yellow-900/20',
      alertWarnText: 'text-yellow-200',
      alertWarnBorder: 'border-yellow-400/60',
      alertErrorBg: 'bg-red-900/40',
      alertErrorText: 'text-pink-200',
      alertErrorBorder: 'border-red-500/50',
      alertVisionBg: 'bg-pink-900/30',
      alertVisionText: 'text-pink-100',
      alertVisionBorder: 'border-pink-500/50',
      tipPanelBg: 'rgba(0,0,0,0.5)',
      tipPanelBorder: 'rgba(0, 255, 255, 0.3)',
      tipPanelText: 'text-cyan-100',
      tipPanelStrong: 'text-pink-300',
      // panelBg / panelBorder: backing color for control-panel containers
      // (theme switcher, CVD selector, hardware lock bar, GPL style bar).
      // These were previously hardcoded as either inline rgba expressions
      // gated on `glowStrong > 0.5` or as Tailwind `bg-black/30` classes.
      // Centralized here so Light mode can have a SOLID backing (the Jazz
      // pattern would otherwise show through and clutter UI controls), and
      // Dark/Neutral retain their previous semi-transparent look.
      panelBg: 'rgba(0, 0, 0, 0.4)',
      panelBorder: 'rgba(0, 255, 255, 0.4)',
      // panelBgStrong: a slightly darker backing used by the hardware-lock
      // bar and the .gpl style bar (which used to be `bg-black/30`). Kept
      // distinct from `panelBg` so Dark and Neutral preserve their prior
      // visual contrast between the top-of-page selectors (theme + CVD)
      // and the bottom-of-page export bars (hardware lock + GPL style).
      // In Light, both `panelBg` and `panelBgStrong` are solid white since
      // any translucency lets the Jazz pattern bleed through UI controls.
      // These bars carry accent borders (`border-yellow-500/40` and
      // `border-cyan-500/40`) which are intentional vaporwave coloring;
      // they are NOT replaced by a panel token, just the backing color is.
      panelBgStrong: 'rgba(0, 0, 0, 0.3)',
      // Inactive panel-button text + hover. Used by the top-header theme
      // switcher and CVD selector. Per-theme so the inactive label stays
      // legible against panelBg (WCAG AA 3:1 for UI components).
      panelTextInactive: 'text-cyan-200',
      panelHoverBg: 'hover:bg-purple-800/60',
      // Swatch caption colors (hex code under each swatch, and the small
      // shade label like "outline" / "shadow"). These appear directly on
      // the page background between swatches, so they need explicit theme
      // colors rather than relying on the CSS injection hack.
      swatchHex: '#a5f3fc', // text-cyan-200
      swatchLabel: 'rgba(249, 168, 212, 0.9)', // text-pink-300/90
      // Color name under sprite previews (e.g. "COLOR 1") sits on the
      // sprite preview background, which is the brightest ramp shade at
      // 70% alpha. In dark mode that's a dark mix so light text reads; in
      // light/neutral it's a lighter mix so dark text reads better.
      colorNameText: '#a5f3fc', // text-cyan-200
      // Visualization chrome tokens. The chromatic plot, mosaic, lightness
      // distribution bar, and the small thumbnail strips on classic and
      // saved palettes all used hardcoded `rgba(255,255,255,0.x)` colors
      // for their background rings, hue spokes, axis labels, and data-cell
      // seam borders. On Light and Neutral themes those colors are
      // white-on-white-ish and effectively invisible. Centralized here so
      // each theme picks values that read against its own background.
      // section header buttons. The Tailwind `hover:bg-white/N` class is
      // theme-naive (white-on-light is invisible), so the callsites pick
      // `hover:bg-white/5` for dark and `hover:bg-black/5` for light/neutral
      // via the `glowStrong > 0.5` test, parallel to how other chrome
      // adapts.
      vizRingStroke: 'rgba(255,255,255,0.12)',
      vizSpokeStroke: 'rgba(255,255,255,0.08)',
      vizAxisLabel: 'rgba(255,255,255,0.55)',
      vizDataBorder: 'rgba(255,255,255,0.1)',
      // vignette: a CSS box-shadow value applied as `boxShadow` to the
      // root container. Dark mode already has the vaporwave grid and
      // CRT scanlines for depth, so no vignette is added on top of that.
      vignette: 'none',
    },
    neutral: {
      // Neutral theme design intent (2026-05-24 redesign):
      // The entire UI surface (page bg AND card backings) reads as ~18%
      // gray (Munsell N5, the photographer's middle-gray reference).
      // Cards distinguish from page only by their accent-colored borders,
      // not by value. This preserves the "neutral gray reference for
      // judging colors" property across the whole UI surface, not just
      // any one piece of it.
      //
      // Text on cards is LIGHT (off-white to white), giving the same
      // visual weight as text-cyan-200 on dark theme, just without
      // color. Section header ACCENT text uses LIGHT-tint variants of
      // each section color (pink-100, cyan-100, etc.) so headers pop on
      // the gray card while keeping section identity color. BORDERS on
      // section cards use DARK-tint variants of the same accents so the
      // card edge crisply outlines against the gray page. See
      // themedAccent vs themedAccentBorder.
      //
      // Previously this theme used dark text on gray, which read as
      // heavy and dark across the page. Inverting it gives the cards
      // the same visual rhythm as dark theme (light text on
      // medium-value surface) while preserving the neutral-gray
      // reference property.
      pageBg: '#777777',
      showVaporwave: false,
      crtIntensity: 'rgba(0,0,0,0.06)',
      // Cards are 18% gray. The gradient is a very subtle ~5% lightness
      // variance to give cards a slight 3D feel without disrupting the
      // gray-reference property. Midpoint is 18% gray (#777777).
      cardBgCyan: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgPink: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgPinkBright: 'linear-gradient(135deg, #7e7e7e 0%, #707070 100%)',
      cardBgYellow: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgGreen: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      cardBgViz: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)',
      titleGlow: '2px 2px 0 rgba(0,0,0,0.4), 4px 4px 12px rgba(0,0,0,0.3)',
      // Title and subtitle sit on the page bg (#5a5a5a). White/off-white
      // for legibility.
      titleColor: '#fafafa',
      subtitleColor: '#e4e4e7',
      subtitleGlow: 'none',
      glowStrong: 0.3,
      // Body text is white-ish on 18% gray cards. Same visual feel as
      // dark theme's text-cyan-200 on purple, just no color.
      bodyText: 'text-zinc-50',
      mutedText: 'text-zinc-200',
      inputBg: 'bg-black/40',
      inputTextCyan: 'text-zinc-50',
      inputTextPink: 'text-zinc-50',
      inputTextYellow: 'text-zinc-50',
      // Control button tokens. Updated for light-text-on-darker-control
      // pattern: the unselected button is darker than the card so it
      // reads as inset.
      controlBtnDefault: 'bg-zinc-800/50 text-zinc-50 border-zinc-700/60',
      controlBtnHover: 'hover:bg-zinc-800/70',
      controlPanelBg: 'bg-zinc-800/30',
      controlPanelBorder: 'border-zinc-700/60',
      // Alert tokens stay light-tint-with-dark-text since the alert backings
      // are intentionally tinted (info-cyan, warn-yellow, error-red, etc.)
      // and the tinted background reads more strongly than a gray one.
      alertInfoBg: 'bg-cyan-100/70',
      alertInfoText: 'text-cyan-900',
      alertInfoBorder: 'border-cyan-700/60',
      alertWarnBg: 'bg-yellow-100/70',
      alertWarnText: 'text-yellow-900',
      alertWarnBorder: 'border-yellow-700/60',
      alertErrorBg: 'bg-red-100/70',
      alertErrorText: 'text-red-900',
      alertErrorBorder: 'border-red-700/60',
      alertVisionBg: 'bg-pink-100/70',
      alertVisionText: 'text-pink-900',
      alertVisionBorder: 'border-pink-700/60',
      tipPanelBg: 'rgba(0, 0, 0, 0.5)',
      tipPanelBorder: 'rgba(0, 0, 0, 0.3)',
      tipPanelText: 'text-zinc-50',
      tipPanelStrong: 'text-zinc-100',
      // Panel tokens for control-panel containers (theme switcher, CVD,
      // hardware lock bar, GPL style bar). Darker than cards so they
      // read as inset bars.
      panelBg: 'rgba(0, 0, 0, 0.4)',
      panelBorder: 'rgba(0, 0, 0, 0.3)',
      panelBgStrong: 'rgba(0, 0, 0, 0.5)',
      // Inactive panel-button text + hover. panelBg here composites to a
      // dark grey (rgba(0,0,0,0.4) over the #707070 grey gradient) so a
      // dark text like zinc-700 was effectively invisible (ratio ~1.05).
      // Use light text to clear WCAG AA 3:1.
      panelTextInactive: 'text-zinc-100',
      panelHoverBg: 'hover:bg-zinc-700/60',
      // Swatch caption tokens: hex code and shade label under each
      // swatch sit on the card backing (~#777777 18% gray). Light
      // off-white for legibility, slightly less bright for the secondary
      // shade label.
      swatchHex: '#fafafa',
      swatchLabel: '#d4d4d8',
      // Color name (e.g. "COLOR 1") under sprite previews sits on
      // the brightest ramp shade at 70% alpha. Light text reads on
      // most palettes since the brightest shade is usually highlight-
      // bright. (Same constraint as dark theme; this token isn't
      // theme-conditional in practice but the value matches the
      // theme's "light text" intent.)
      colorNameText: '#fafafa',
      // Viz chrome tokens. Same approximate values as before but
      // re-tuned slightly for the darker (still gray) page bg and
      // light-on-gray card text. Light gray strokes against the
      // medium-gray cards.
      vizRingStroke: 'rgba(255,255,255,0.18)',
      vizSpokeStroke: 'rgba(255,255,255,0.12)',
      vizAxisLabel: 'rgba(255,255,255,0.65)',
      vizDataBorder: 'rgba(255,255,255,0.22)',
      // vignette: subtle inset shadow that darkens the edges of the root
      // container by ~10%. This is the Neutral mode "personality" touch:
      // adds depth and frame without introducing any color (Neutral is
      // the unbiased color-judgment mode, so anything that shifts
      // perceived hue or chroma is forbidden). The shadow is pure black
      // alpha and lives at the page edges only, well away from the
      // central palette region where color decisions get made.
      vignette: 'inset 0 0 120px 20px rgba(0, 0, 0, 0.2)',
    },
    light: {
      // Light mode page background: cream cup ground (#f4f1ea) with a
      // tiling SVG pattern in the 1992 Solo "Jazz" cup idiom: scattered
      // teal brush-stroke swooshes (the iconic mark) at varied rotations,
      // smaller magenta zigzag squiggles in the gaps, and confetti dots
      // in both colors. Marks near tile edges are duplicated on the
      // opposite edge so the pattern reads continuously across CSS
      // tile boundaries (no visible grid). Medium density: roughly 8
      // teal swooshes + 7 magenta squiggles + 14 confetti dots per
      // 240x240 tile, with the cream ground still reading as the
      // dominant value.
      //
      // Every card uses solid white-ish cardBg* gradients to wall the
      // pattern out, so color swatches always render on a flat backing
      // (see "Critical constraint" in the handoff item-G sketch).
      //
      // SVG is inline as a data URI (~5.3KB url-encoded). The earlier
      // version was ~2.1KB but read as random lines rather than the
      // intended Jazz cup; the larger size buys the recognizable
      // gesture vocabulary (curved brush swooshes vs straight zigzags)
      // and the edge-wrapping needed to hide the tile grid. No
      // architectural limit here, browsers handle data URIs of any
      // reasonable size; just heavier than the prior version.
      //
      // To edit: regenerate from gen_jazz.py (in /home/claude/work
      // during sessions, kept around as a tooling artifact). Single
      // quotes are SVG attribute quotes; the outer double quotes wrap
      // the url() arg; `#` must be encoded as `%23` since # ends a URL
      // fragment in CSS.
      pageBg: `#f4f1ea url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240' viewBox='0 0 240 240'><path d='M131.9,133.2 Q142.5,115 153.1,125.4 Q163.7,135.8 174.2,117.6' stroke='%231fb5ab' stroke-width='4.7' stroke-linecap='round' fill='none' transform='rotate(69.5 153.1 125.4)'/><path d='M184,90.2 Q194.3,72.5 204.6,82.6 Q214.9,92.7 225.2,75' stroke='%231fb5ab' stroke-width='4.5' stroke-linecap='round' fill='none' transform='rotate(-39.2 204.6 82.6)'/><path d='M167.6,202.5 C179.9,219.9 192.3,199 204.6,216.4' stroke='%231fb5ab' stroke-width='4.4' stroke-linecap='round' fill='none' transform='rotate(-15 186.1 209.5)'/><path d='M49.3,6.2 C60.2,21.5 71.1,3.1 82.1,18.5' stroke='%231fb5ab' stroke-width='3.9' stroke-linecap='round' fill='none' transform='rotate(43.8 65.7 12.3)'/><path d='M49.3,246.2 C60.2,261.5 71.1,243.1 82.1,258.5' stroke='%231fb5ab' stroke-width='3.9' stroke-linecap='round' fill='none' transform='rotate(43.8 65.7 252.3)'/><path d='M94.5,65.9 C104.4,79.8 114.3,63.1 124.1,77' stroke='%231fb5ab' stroke-width='3.5' stroke-linecap='round' fill='none' transform='rotate(-11.2 109.3 71.4)'/><path d='M5,195.3 C14.2,208.3 23.4,192.8 32.6,205.7' stroke='%231fb5ab' stroke-width='3.3' stroke-linecap='round' fill='none' transform='rotate(27.1 18.8 200.5)'/><path d='M245,195.3 C254.2,208.3 263.4,192.8 272.6,205.7' stroke='%231fb5ab' stroke-width='3.3' stroke-linecap='round' fill='none' transform='rotate(27.1 258.8 200.5)'/><path d='M-38.5,6.2 C-27.7,21.3 -17,3.1 -6.2,18.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 -22.3 12.2)'/><path d='M201.5,6.2 C212.3,21.3 223,3.1 233.8,18.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 217.7 12.2)'/><path d='M-38.5,246.2 C-27.7,261.3 -17,243.1 -6.2,258.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 -22.3 252.2)'/><path d='M201.5,246.2 C212.3,261.3 223,243.1 233.8,258.3' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(-61.8 217.7 252.2)'/><path d='M6,141.9 C16.8,157 27.5,138.8 38.2,153.9' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(16.9 22.1 147.9)'/><path d='M246,141.9 C256.8,157 267.5,138.8 278.2,153.9' stroke='%231fb5ab' stroke-width='3.8' stroke-linecap='round' fill='none' transform='rotate(16.9 262.1 147.9)'/><path d='M193.4,242.9 Q197.9,233.9 202.4,242.9 Q206.9,251.9 211.4,242.9' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(-42.1 202.4 242.9)'/><path d='M193.4,2.9 Q197.9,-6.1 202.4,2.9 Q206.9,11.9 211.4,2.9' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(-42.1 202.4 2.9)'/><path d='M158.6,50.7 Q162.4,43 166.3,50.7 Q170.1,58.4 173.9,50.7' stroke='%23d24d8e' stroke-width='1.7' stroke-linecap='round' fill='none' transform='rotate(-21.6 166.3 50.7)'/><path d='M136.7,175.3 Q140.7,167.3 144.7,175.3 Q148.8,183.4 152.8,175.3' stroke='%23d24d8e' stroke-width='1.8' stroke-linecap='round' fill='none' transform='rotate(40.9 144.7 175.3)'/><path d='M198,30.8 Q202.9,21.1 207.7,30.8 Q212.6,40.6 217.5,30.8' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(31.1 207.7 30.8)'/><path d='M12,107.5 Q16.4,98.7 20.8,107.5 Q25.2,116.3 29.6,107.5' stroke='%23d24d8e' stroke-width='2' stroke-linecap='round' fill='none' transform='rotate(57.4 20.8 107.5)'/><path d='M83.8,134.9 Q88.6,125.3 93.4,134.9 Q98.2,144.5 103,134.9' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(41.5 93.4 134.9)'/><path d='M48.1,206.4 Q53.1,196.5 58.1,206.4 Q63,216.3 68,206.4' stroke='%23d24d8e' stroke-width='2.2' stroke-linecap='round' fill='none' transform='rotate(66.8 58.1 206.4)'/><circle cx='80' cy='205.2' r='1.3' fill='%23d24d8e'/><circle cx='81.6' cy='210.7' r='1.3' fill='%23d24d8e'/><circle cx='49.1' cy='88.4' r='1.5' fill='%23d24d8e'/><circle cx='49.5' cy='85.8' r='1.3' fill='%23d24d8e'/><circle cx='204.1' cy='136.6' r='1.3' fill='%23d24d8e'/><circle cx='204.7' cy='137.5' r='1.1' fill='%23d24d8e'/><circle cx='121.6' cy='207' r='1.5' fill='%23d24d8e'/><circle cx='126.3' cy='205.6' r='1.5' fill='%23d24d8e'/><circle cx='126.8' cy='208.2' r='1.3' fill='%23d24d8e'/><circle cx='56.3' cy='124' r='1.6' fill='%23d24d8e'/><circle cx='55.5' cy='127' r='1.5' fill='%23d24d8e'/><circle cx='160.6' cy='29.9' r='1.6' fill='%23d24d8e'/><circle cx='159.4' cy='26' r='1.1' fill='%23d24d8e'/><circle cx='160.7' cy='28.8' r='1.5' fill='%23d24d8e'/><circle cx='50.4' cy='147.7' r='1' fill='%23d24d8e'/><circle cx='50.9' cy='143.3' r='1.4' fill='%23d24d8e'/><circle cx='51.9' cy='144.3' r='1.4' fill='%23d24d8e'/><circle cx='62.3' cy='55.8' r='1.5' fill='%23d24d8e'/><circle cx='67' cy='55' r='1.5' fill='%23d24d8e'/><circle cx='66.4' cy='52.5' r='1.1' fill='%23d24d8e'/><circle cx='147.6' cy='87.1' r='1.5' fill='%231fb5ab'/><circle cx='142.3' cy='204.4' r='1.6' fill='%231fb5ab'/><circle cx='40.6' cy='31' r='1.7' fill='%231fb5ab'/><circle cx='105.9' cy='215.3' r='1.8' fill='%231fb5ab'/><circle cx='89.2' cy='189.3' r='1.7' fill='%231fb5ab'/><circle cx='86.2' cy='227.7' r='2.1' fill='%231fb5ab'/></svg>") repeat`,
      showVaporwave: false,
      crtIntensity: 'rgba(0,0,0,0.04)',
      cardBgCyan: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgPink: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgPinkBright: 'linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%)',
      cardBgYellow: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgGreen: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      cardBgViz: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)',
      titleGlow: '2px 2px 0 rgba(0,0,0,0.15), 4px 4px 8px rgba(0,0,0,0.1)',
      titleColor: '#1a1a1a',
      subtitleColor: '#3a3a3a',
      subtitleGlow: 'none',
      glowStrong: 0.2,
      bodyText: 'text-zinc-800',
      mutedText: 'text-zinc-600',
      inputBg: 'bg-white',
      inputTextCyan: 'text-zinc-900',
      inputTextPink: 'text-zinc-900',
      inputTextYellow: 'text-zinc-900',
      // See dark theme for full reasoning. Light uses near-white default
      // with a darker hover so the button reads as an inset control on
      // the solid white card. Border is a 25% black to match panelBorder
      // for visual cohesion.
      controlBtnDefault: 'bg-zinc-100 text-zinc-900 border-zinc-300',
      controlBtnHover: 'hover:bg-zinc-200',
      controlPanelBg: 'bg-zinc-50',
      controlPanelBorder: 'border-zinc-300',
      // Alert tokens, light theme. Solid backings (no alpha) so the Jazz
      // pattern doesn't show through and muddy the alert text. See dark
      // theme for the rationale.
      alertInfoBg: 'bg-cyan-50',
      alertInfoText: 'text-cyan-900',
      alertInfoBorder: 'border-cyan-600',
      alertWarnBg: 'bg-yellow-50',
      alertWarnText: 'text-yellow-900',
      alertWarnBorder: 'border-yellow-600',
      alertErrorBg: 'bg-red-50',
      alertErrorText: 'text-red-900',
      alertErrorBorder: 'border-red-600',
      alertVisionBg: 'bg-pink-50',
      alertVisionText: 'text-pink-900',
      alertVisionBorder: 'border-pink-600',
      tipPanelBg: '#ffffff',
      tipPanelBorder: 'rgba(0, 0, 0, 0.2)',
      tipPanelText: 'text-zinc-800',
      tipPanelStrong: 'text-zinc-900',
      // See dark theme for what these are. Light mode REQUIRES solid
      // backings on control panels: the Jazz pattern in pageBg is dense
      // enough that any translucency on a control container lets the
      // pattern show through and visually clutters the UI controls. The
      // border is slightly darker than in Neutral because it sits on
      // solid white and needs more contrast to read as a panel edge.
      panelBg: '#ffffff',
      panelBorder: 'rgba(0, 0, 0, 0.25)',
      // In Light, both panel tokens are solid white (no translucency at
      // all). See dark theme for the broader rationale.
      panelBgStrong: '#ffffff',
      // panelBg is solid white here, so a dark zinc text is fine.
      panelTextInactive: 'text-zinc-700',
      panelHoverBg: 'hover:bg-zinc-200/60',
      swatchHex: '#262626',
      swatchLabel: '#525252',
      colorNameText: '#262626',
      // See dark theme for what these viz tokens are. Light mode pushes
      // the opacity slightly higher than Neutral because the cream-with-
      // Jazz-pattern background has busy chroma in it and the rings need
      // a touch more weight to read cleanly through the pattern noise.
      vizRingStroke: 'rgba(0,0,0,0.22)',
      vizSpokeStroke: 'rgba(0,0,0,0.15)',
      vizAxisLabel: 'rgba(0,0,0,0.6)',
      vizDataBorder: 'rgba(0,0,0,0.22)',
      // Light mode already gets the Jazz pattern in pageBg as its
      // personality, so no vignette is layered on top.
      vignette: 'none',
    },
  };
  const t = themeTokens[theme] || themeTokens.dark;

  // Helper for accent shadows. In dark mode we use the full neon glow; in
  // neutral/light we dial the intensity way down so accent borders read but
  // don't vibrate against the calmer background.
  const accentGlow = (hexAccent, baseAlpha = 0.4) => {
    const { r, g, b } = hexToRgb(hexAccent);
    const alpha = baseAlpha * t.glowStrong;
    if (alpha < 0.05) return 'none';
    return `0 0 25px rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // For section heading neon text-shadow. Takes a hex and optional pixel
  // size (default 8 to match the original section heading glow). Returns
  // 'none' on non-dark themes since glow-on-light is illegible.
  const accentTextGlow = (hexAccent, px = 8) => {
    if (t.glowStrong < 0.5) return 'none';
    return `0 0 ${px}px ${hexAccent}`;
  };

  // Section heading text color. In dark mode we use the neon accent directly
  // (e.g. cyan for ramps, pink for harmony). In neutral/light, neon text
  // against a light background is unreadable, so we shift to a much darker
  // variant of the same hue family. The mappings are tuned so each accent
  // stays distinguishable from its neighbors (cyan vs purple stay clearly
  // different) while remaining legible.
  //
  // IMPORTANT: When you change a mapping here, change it everywhere the
  // accent is used as chrome - section heading text, section heading
  // textShadow glow, style labels (Punchy/Balanced/Muted), accent borders
  // and glows. Use themedAccent() below as the single source of truth for
  // any chrome that needs the section accent.
  const ACCENT_MAP = {
    // Hex keys must be lowercase. Each value is { neutralText, neutralBorder, light }.
    // Neutral needs OPPOSITE values for text vs border:
    //   - Text on 18% gray card reads better as a light tint (cyan-100 etc.)
    //   - Borders against the 18% gray page read better as a dark tint
    //     (cyan-800 etc.) because the dark line crisply outlines the card
    //     edge against the medium-value page bg.
    // Light theme uses the same value for both text and border (dark tint
    // works against near-white cards).
    '#00ffff': { neutralText: '#cffafe', neutralBorder: '#083344', light: '#155e75' }, // cyan/teal
    '#67e8f9': { neutralText: '#cffafe', neutralBorder: '#083344', light: '#155e75' }, // cyan variant
    '#ff00ff': { neutralText: '#fce7f3', neutralBorder: '#4a044e', light: '#86198f' }, // pink/fuchsia
    '#ff006e': { neutralText: '#fce7f3', neutralBorder: '#4a044e', light: '#86198f' },
    '#ffff00': { neutralText: '#fef9c3', neutralBorder: '#422006', light: '#854d0e' }, // yellow
    '#00ff99': { neutralText: '#dcfce7', neutralBorder: '#052e16', light: '#166534' }, // green
    '#a855f7': { neutralText: '#f3e8ff', neutralBorder: '#3b0764', light: '#6b21a8' }, // purple
  };

  // themedAccent: single source of truth for any chrome that uses a section
  // accent color. Returns the canonical accent in dark mode, the LIGHT
  // tint variant in neutral mode (for text colors on gray cards), or the
  // dark tint in light mode. For BORDERS in neutral mode, use
  // themedAccentBorder() instead.
  const themedAccent = (hexAccent) => {
    if (t.glowStrong > 0.5) return hexAccent;
    const mapped = ACCENT_MAP[hexAccent.toLowerCase()];
    if (!mapped) return '#1a1a1a';
    if (theme === 'neutral') return mapped.neutralText;
    return mapped.light;
  };

  // themedAccentBorder: like themedAccent but returns dark tints for
  // Neutral mode where borders need to crisply outline cards against
  // the gray page bg. In Dark and Light, identical to themedAccent.
  const themedAccentBorder = (hexAccent) => {
    if (t.glowStrong > 0.5) return hexAccent;
    const mapped = ACCENT_MAP[hexAccent.toLowerCase()];
    if (!mapped) return '#1a1a1a';
    if (theme === 'neutral') return mapped.neutralBorder;
    return mapped.light;
  };

  // Backward compatibility: keep sectionHeadColor pointing at themedAccent
  // so callers don't have to change names. They do exactly the same thing.
  const sectionHeadColor = themedAccent;

  return (
    <div className="min-h-screen p-6 relative overflow-hidden" style={{
      background: t.pageBg,
      boxShadow: t.vignette,
      fontFamily: '"Courier New", "Lucida Console", monospace'
    }}>
      {/* Theme-aware text colors are primarily driven by theme tokens
          (t.bodyText, t.mutedText, t.swatchHex, t.swatchLabel,
          t.colorNameText, t.titleColor, t.subtitleColor). Tokens are the
          source of truth: source class == rendered color.

          The exception is the Light theme, where many Tailwind text-color
          utilities (text-cyan-200, text-pink-100/80) hardcoded throughout
          the JSX would render as near-invisible light tints against the
          light cream cards. A narrow CSS override below handles Light
          only. The override uses a descendant rule pair (default + inside
          bg-black ancestor) like the previous version did; see
          ARCHITECTURE.md "Theme-aware text colors" for the design and
          why this is scoped to Light only.

          Neutral theme does NOT use this override. Neutral has been
          migrated to drive text colors entirely from theme tokens. If
          you find Neutral text that's not adapting correctly, the fix
          is to point that text at a token, not to extend this CSS
          block. */}
      {theme === 'light' && (
        <style>{`
          [class*="text-cyan-100/"]:not([class*="bg-black/"]),
          [class*="text-pink-100/"]:not([class*="bg-black/"]),
          [class*="text-green-100/"]:not([class*="bg-black/"]),
          [class*="text-yellow-100/"]:not([class*="bg-black/"]) {
            color: #2a2a2a !important;
            opacity: 0.85;
          }
          .text-cyan-200:not([class*="bg-black/"]),
          .text-cyan-100:not([class*="bg-black/"]),
          .text-pink-200:not([class*="bg-black/"]),
          [class*="text-pink-300/"]:not([class*="bg-black/"]),
          .text-yellow-200:not([class*="bg-black/"]),
          .text-yellow-100:not([class*="bg-black/"]),
          .text-green-100:not([class*="bg-black/"]) {
            color: #1a1a1a !important;
          }
          [class*="bg-black/"] [class*="text-cyan-100/"],
          [class*="bg-black/"] [class*="text-pink-100/"],
          [class*="bg-black/"] [class*="text-green-100/"],
          [class*="bg-black/"] [class*="text-yellow-100/"] {
            opacity: 1 !important;
          }
          [class*="bg-black/"] [class*="text-cyan-100/"] { color: #cffafe !important; }
          [class*="bg-black/"] [class*="text-pink-100/"] { color: #fce7f3 !important; }
          [class*="bg-black/"] [class*="text-green-100/"] { color: #dcfce7 !important; }
          [class*="bg-black/"] [class*="text-yellow-100/"] { color: #fef9c3 !important; }
          [class*="bg-black/"] .text-cyan-200 { color: #a5f3fc !important; }
          [class*="bg-black/"] .text-cyan-100 { color: #cffafe !important; }
          [class*="bg-black/"] .text-pink-200 { color: #fbcfe8 !important; }
          [class*="bg-black/"] [class*="text-pink-300/"] { color: #f9a8d4 !important; }
          [class*="bg-black/"] .text-yellow-200 { color: #fef08a !important; }
          [class*="bg-black/"] .text-yellow-100 { color: #fef9c3 !important; }
          [class*="bg-black/"] .text-green-100 { color: #dcfce7 !important; }
          input[class*="bg-black/"], textarea[class*="bg-black/"] {
            color: #e4e4e7 !important;
          }
        `}</style>
      )}
      {crtEnabled && (
        <div className="pointer-events-none fixed inset-0 z-50" style={{
          background: `repeating-linear-gradient(0deg, ${t.crtIntensity} 0px, ${t.crtIntensity} 1px, transparent 1px, transparent 3px)`,
          mixBlendMode: 'multiply'
        }} />
      )}
      {/* Vaporwave grid floor only renders in dark theme. On neutral/light
          backgrounds it adds visual noise that competes with the swatches. */}
      {t.showVaporwave && (
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 h-1/2 z-0" style={{
          backgroundImage: `linear-gradient(0deg, transparent 0%, rgba(255, 0, 255, 0.1) 50%, rgba(0, 255, 255, 0.2) 100%), linear-gradient(90deg, rgba(0, 255, 255, 0.4) 1px, transparent 1px), linear-gradient(0deg, rgba(255, 0, 255, 0.3) 1px, transparent 1px)`,
          backgroundSize: '100% 100%, 60px 60px, 60px 60px',
          transform: 'perspective(500px) rotateX(60deg)',
          transformOrigin: 'center top'
        }} />
      )}

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
          <p className="text-sm tracking-widest" style={{ color: t.subtitleColor, textShadow: t.subtitleGlow }}>▓▒░ PIXEL ART PALETTE GENERATOR ░▒▓</p>
          <p className="text-[10px] mt-1 opacity-40 tracking-widest font-mono" style={{ color: t.subtitleColor }}>v{__APP_VERSION__} &middot; {__BUILD_DATE__}</p>
          {/* Top-right control cluster: CRT toggle on top, three theme
              icon buttons in a horizontal row directly below, sized to
              match the CRT button's overall width.

              The CRT button has fixed-width content so toggling ON/OFF
              doesn't change its width (and therefore doesn't reflow the
              theme switcher below it, which stretches to match). Both
              icons (Monitor/MonitorOff) and the longer label ("CRT OFF",
              7 chars) are ALWAYS rendered; the inactive icon and the
              "missing" trailing character are made `invisible` so they
              still take up layout space. The visible state reads cleanly
              while width stays byte-stable across toggles. */}
          <div className="absolute top-0 right-0 z-20 flex flex-col gap-2 items-stretch">
            <button onClick={() => setCrtEnabled(!crtEnabled)} title={crtEnabled ? "Turn off CRT scanline overlay" : "Turn on CRT scanline overlay"} className={`px-3 py-2 rounded font-bold border-2 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-xs ${crtEnabled ? (t.glowStrong > 0.5 ? 'bg-green-400/30 text-green-300 border-green-400 hover:bg-green-400/50' : 'bg-green-200 text-green-900 border-green-600 hover:bg-green-300') : (t.glowStrong > 0.5 ? `${t.controlBtnDefault} ${t.controlBtnHover}` : 'bg-white/60 text-zinc-700 border-zinc-400 hover:bg-white/80')}`} style={crtEnabled && t.glowStrong > 0.5 ? { boxShadow: '0 0 10px rgba(0, 255, 100, 0.5)' } : {}}>
              {/* Both icons rendered, with the inactive one invisible.
                  Stack them in the same grid cell so they share the
                  layout slot. */}
              <span className="relative inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
                <Monitor size={16} className={`absolute ${crtEnabled ? '' : 'invisible'}`} />
                <MonitorOff size={16} className={`absolute ${crtEnabled ? 'invisible' : ''}`} />
              </span>
              {/* Label: stack "ON" and "OFF" in the same grid cell so the
                  containing button's width is always the wider of the two
                  ("CRT OFF"). The inactive label is `invisible` so it
                  still claims layout space but renders blank. The
                  visible label is centered in the cell, matching the
                  visible icon's centering. Hidden below sm breakpoint
                  to match prior responsive behavior. */}
              <span className="hidden sm:grid tabular-nums" style={{ gridTemplateAreas: '"stack"' }}>
                <span className={`${crtEnabled ? '' : 'invisible'} text-center`} style={{ gridArea: 'stack' }}>CRT ON</span>
                <span className={`${crtEnabled ? 'invisible' : ''} text-center`} style={{ gridArea: 'stack' }}>CRT OFF</span>
              </span>
            </button>
            {/* Theme selector: three icon buttons in a row. Icons follow the
                screen-brightness convention: moon=dark, half-filled
                circle=neutral (18% gray is also the photography reference
                for contrast/exposure), sun=light. flex with equal-width
                children stretches to match the CRT button's width above. */}
            <div className="flex gap-1 rounded border-2 p-1" style={{ borderColor: t.panelBorder, background: t.panelBg }}>
              {[
                { id: 'dark',    Icon: Moon,     hint: 'Dark: original vaporwave look' },
                { id: 'neutral', Icon: Contrast, hint: '18% gray: neutral background for unbiased color judgment' },
                { id: 'light',   Icon: Sun,      hint: 'Light: off-white background' },
              ].map(opt => {
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setTheme(opt.id)}
                    title={opt.hint}
                    aria-label={opt.hint}
                    className={`flex-1 flex items-center justify-center py-1 rounded transition-all ${theme === opt.id ? (t.glowStrong > 0.5 ? 'bg-cyan-300 text-purple-900' : 'bg-zinc-800 text-white') : `${t.panelTextInactive} ${t.panelHoverBg}`}`}
                    style={theme === opt.id && t.glowStrong > 0.5 ? { boxShadow: '0 0 8px rgba(0, 255, 255, 0.6)' } : {}}
                  >
                    <Icon size={14} />
                  </button>
                );
              })}
            </div>
          </div>
          {/* Top-left control cluster: an invisible spacer matching the
              CRT button on the right, then the CVD selector below it.
              This positions the CVD row at the same vertical height as
              the theme switcher on the right side, giving the header a
              symmetric layout. Spacer uses the SAME button markup as
              the real CRT button to guarantee height parity regardless
              of font / padding changes. The spacer text is "CRT OFF"
              (the longer state) so it matches the real button's now-
              stabilized width exactly. */}
          <div className="absolute top-0 left-0 z-20 flex flex-col gap-2 items-stretch pointer-events-none">
            <button aria-hidden="true" tabIndex={-1} className="invisible pointer-events-none px-3 py-2 rounded font-bold border-2 flex items-center justify-center gap-2 uppercase tracking-wider text-xs">
              <span className="relative inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
                <MonitorOff size={16} />
              </span>
              <span className="hidden sm:grid tabular-nums" style={{ gridTemplateAreas: '"stack"' }}>
                <span className="text-center" style={{ gridArea: 'stack' }}>CRT ON</span>
                <span className="text-center" style={{ gridArea: 'stack' }}>CRT OFF</span>
              </span>
            </button>
            {/* Color vision deficiency simulator: 4 labeled buttons (None /
                Pro / Deu / Tri) that switch which SVG color matrix filter
                is applied to the main content area. The buttons themselves
                live OUTSIDE the filtered region so the active state stays
                readable in all modes. Aligned horizontally with the theme
                switcher on the right via an invisible spacer above. */}
            <div className="flex gap-1 rounded border-2 p-1 pointer-events-auto" style={{ borderColor: t.panelBorder, background: t.panelBg }}>
              {[
                { id: 'none',   label: 'None', hint: 'Normal vision (no simulation)' },
                { id: 'protan', label: 'Pro',  hint: 'Protanopia: simulates red-blindness (~1% of men)' },
                { id: 'deutan', label: 'Deu',  hint: 'Deuteranopia: simulates green-blindness (~6% of men, most common CVD)' },
                { id: 'tritan', label: 'Tri',  hint: 'Tritanopia: simulates blue-blindness (very rare)' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setCvdMode(opt.id)}
                  title={opt.hint}
                  aria-label={opt.hint}
                  className={`flex-1 flex items-center justify-center py-1 px-1 rounded transition-all text-[10px] font-bold uppercase tracking-wider ${cvdMode === opt.id ? (t.glowStrong > 0.5 ? 'bg-cyan-300 text-purple-900' : 'bg-zinc-800 text-white') : `${t.panelTextInactive} ${t.panelHoverBg}`}`}
                  style={cvdMode === opt.id && t.glowStrong > 0.5 ? { boxShadow: '0 0 8px rgba(0, 255, 255, 0.6)' } : {}}
                >
                  {opt.id === 'none' ? <Eye size={12} /> : opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SVG filter definitions for colorblind simulation. Hidden from
            layout. Matrices are Brettel/Vienot/Mollon coefficients (the
            standard public-domain CVD simulation values used by browser
            accessibility tools). Order in each 20-value matrix:
            R1 R2 R3 R4 R5 / G1 G2 G3 G4 G5 / B1 B2 B3 B4 B5 / A1 A2 A3 A4 A5.
            Columns 4 (alpha multiplier) and 5 (additive offset) are 0
            except the alpha row identity. */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <filter id="cvd-protan">
              <feColorMatrix type="matrix" values="
                0.567 0.433 0     0 0
                0.558 0.442 0     0 0
                0     0.242 0.758 0 0
                0     0     0     1 0" />
            </filter>
            <filter id="cvd-deutan">
              <feColorMatrix type="matrix" values="
                0.625 0.375 0   0 0
                0.700 0.300 0   0 0
                0     0.300 0.7 0 0
                0     0     0   1 0" />
            </filter>
            <filter id="cvd-tritan">
              <feColorMatrix type="matrix" values="
                0.950 0.050 0     0 0
                0     0.433 0.567 0 0
                0     0.475 0.525 0 0
                0     0     0     1 0" />
            </filter>
          </defs>
        </svg>

        {/* CVD filter wrapper. Everything from this point through the
            bottom tip panel gets the active SVG color matrix applied.
            The header / theme / CVD selector deliberately sit ABOVE this
            wrapper so the selector buttons themselves stay readable in
            all modes. When cvdMode is 'none' the filter is the string
            'none' (no transform, identical to no filter at all). */}
        <div style={{ filter: cvdMode === 'none' ? 'none' : `url(#cvd-${cvdMode})` }}>

        <div className="rounded-lg p-6 mb-6 border-2 backdrop-blur-sm" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ff00ff'), boxShadow: t.glowStrong > 0.5 ? '0 0 30px rgba(255, 0, 255, 0.5), inset 0 0 20px rgba(0, 255, 255, 0.2)' : accentGlow('#ff00ff', 0.5) }}>
          <div className={`flex flex-wrap gap-2 mb-4 justify-center${activeTourTarget === 'mode-tabs' ? ' tour-highlight' : ''}`} data-tour-id="mode-tabs">
            <button onClick={() => setMode('color')} title="Build a palette from a single hex color" className={`px-4 py-2 rounded font-bold transition-all border-2 uppercase tracking-wider text-sm ${mode === 'color' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={mode === 'color' ? { boxShadow: '0 0 15px #00ffff' } : {}}>Single Color</button>
            <button onClick={() => setMode('ai')} title="Describe a subject, mood, or scene and let AI pick the palette" className={`px-4 py-2 rounded font-bold transition-all border-2 uppercase tracking-wider text-sm flex items-center gap-1 ${mode === 'ai' ? 'bg-pink-300 text-purple-900 border-pink-100' : 'bg-pink-900/60 text-pink-200 border-pink-700/50 hover:bg-pink-800/60'}`} style={mode === 'ai' ? { boxShadow: '0 0 15px #ff00ff' } : {}}><Wand2 size={16} />AI Assist</button>
            <button onClick={() => setMode('image')} title="Extract a palette from an uploaded image" className={`px-4 py-2 rounded font-bold transition-all border-2 uppercase tracking-wider text-sm flex items-center gap-1 ${mode === 'image' ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-yellow-900/60 text-yellow-200 border-yellow-700/50 hover:bg-yellow-800/60'}`} style={mode === 'image' ? { boxShadow: '0 0 15px #ffff00' } : {}}><ImageIcon size={16} />From Image</button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4 flex-wrap">
            {mode === 'color' && (
              <div className="flex gap-2 items-center flex-wrap">
                <input type="color" value={colorInput} onChange={(e) => setColorInput(e.target.value)} title="Pick a base color from the OS color picker" className="w-14 h-14 rounded border-2 border-cyan-400 cursor-pointer" style={{ boxShadow: '0 0 10px #00ffff' }} />
                <input type="text" value={colorInput} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColorInput(v); }} title="Type a hex color (e.g. #ff6b35)" className="px-3 py-2 rounded bg-black/60 text-cyan-200 font-mono border-2 border-cyan-400 w-32 focus:outline-none" />
                <button onClick={randomizeColor} title="Roll a random hex into the input. Does not change the palette. Click Add base to append it, or New palette to replace the palette with it." className="px-3 py-2 rounded font-bold bg-pink-500 text-white border-2 border-pink-300 hover:bg-pink-400 hover:scale-105 transition-all" style={{ boxShadow: '0 0 12px #ff00ff' }}><Dice5 size={18} /></button>
                <button onClick={addColorAsBase} title="Append this color to the palette as a new base. Stays on this tab so you can keep building. Non-destructive: existing ramps, pins, and customizations are preserved." className="px-4 py-2 rounded font-bold bg-cyan-300 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-200 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 15px #00ffff' }}>
                  <Plus size={18} />Add base
                </button>
                {addBaseFeedback && (
                  <span className="text-xs font-bold px-2 py-1 rounded bg-cyan-500 text-purple-900 border-2 border-cyan-200 uppercase tracking-wider">{addBaseFeedback}</span>
                )}
              </div>
            )}
            {mode === 'ai' && (
              <div className="flex gap-2 items-center w-full sm:w-auto">
                <input type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="describe anything..." title="Describe a subject, mood, or scene. Press Enter to generate." className="px-3 py-2 rounded bg-black/60 text-pink-200 border-2 border-pink-400 w-full sm:w-96 focus:outline-none" onKeyDown={(e) => e.key === 'Enter' && !aiLoading && handleAiGenerate()} disabled={aiLoading} />
                <button onClick={() => setAiInput(buildRandomDescription())} disabled={aiLoading} title="Roll a random description (does not call AI)" className="px-3 py-2 rounded font-bold bg-pink-500 text-white border-2 border-pink-300 hover:bg-pink-400 hover:scale-105 transition-all flex-shrink-0 disabled:opacity-60" style={{ boxShadow: '0 0 12px #ff00ff' }}><Dice5 size={18} /></button>
              </div>
            )}
            {mode === 'image' && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div onDragOver={handleDragOver} onDragEnter={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`w-full rounded-lg border-4 border-dashed transition-all p-6 ${isDragging ? 'border-yellow-300 bg-yellow-500/20 scale-[1.02]' : 'border-yellow-500/60 bg-yellow-900/20 hover:bg-yellow-900/30'}`} style={isDragging ? { boxShadow: '0 0 30px #ffff00' } : {}}>
                  <div className="flex flex-col items-center gap-3">
                    <Upload size={32} className={`transition-all ${isDragging ? 'text-yellow-200 scale-125' : 'text-yellow-300'}`} style={{ filter: 'drop-shadow(0 0 8px #ffff00)' }} />
                    <div className="text-center text-yellow-100">
                      <p className="font-bold text-base mb-1 uppercase tracking-widest">{isDragging ? '>>> DROP IT <<<' : 'Drag & Drop Image'}</p>
                      <p className="text-xs opacity-80">or paste from clipboard (Ctrl/Cmd+V)</p>
                    </div>
                    <label className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 cursor-pointer text-sm uppercase tracking-wider" style={{ boxShadow: '0 0 12px #ffff00' }}>
                      <Upload size={16} />{imageDataUrl ? 'Choose Different' : 'Browse Files'}
                      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => handleImageUpload(e.target.files[0])} className="hidden" />
                    </label>
                  </div>
                </div>
                {imageDataUrl && (
                  <>
                    <div className="flex flex-col sm:flex-row gap-3 items-center flex-wrap justify-center">
                      <div className="flex gap-2 items-center text-yellow-100">
                        <span className="text-sm font-bold uppercase tracking-wider">Colors:</span>
                        {[3, 4, 5, 6].map(n => (
                          <button key={n} onClick={() => setImageColorCount(n)} title={`Extract ${n} base colors from this image`} className={`w-8 h-8 rounded font-bold border-2 text-sm transition-all ${imageColorCount === n ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-purple-800/60'}`}>{n}</button>
                        ))}
                      </div>
                      <button onClick={reExtractFromImage} disabled={imageLoading} title="Re-run color extraction on the current image" className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all disabled:opacity-60 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 10px #ffff00' }}>{imageLoading ? 'ANALYZING...' : 'Re-extract'}</button>
                      <button onClick={() => setEyedropperActive(!eyedropperActive)} title={eyedropperActive ? "Cancel eyedropper" : "Pick a color directly from the image by clicking it"} className={`px-4 py-2 rounded font-bold border-2 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm ${eyedropperActive ? 'bg-cyan-300 text-purple-900 border-cyan-100' : 'bg-cyan-700 text-cyan-100 border-cyan-900 hover:bg-cyan-600'}`} style={{ boxShadow: eyedropperActive ? '0 0 15px #00ffff' : '0 0 8px rgba(0, 255, 255, 0.4)' }}>
                        <Pipette size={16} />{eyedropperActive ? 'Click image...' : 'Eyedropper'}
                      </button>
                    </div>
                    {eyedropperActive && (
                      <div className="text-cyan-100 text-xs bg-cyan-900/40 border-2 border-cyan-500/50 rounded p-2 text-center uppercase tracking-wider">▸ Hover to preview, click to add ◂</div>
                    )}
                    {/* Zoom row for eyedropper precision. Integer multipliers
                        only, applied via inline width style with
                        image-rendering: pixelated so no resampling happens.
                        The wrapper scrolls when the zoomed image exceeds the
                        available width. */}
                    <div className="flex gap-2 items-center justify-center text-cyan-100">
                      <span className="text-xs font-bold uppercase tracking-wider">Zoom:</span>
                      {[1, 2, 4, 8].map(n => (
                        <button key={n} onClick={() => setImageZoom(n)} title={`Display the image at ${n}x for finer eyedropper precision`} className={`w-9 h-8 rounded font-bold border-2 text-xs transition-all ${imageZoom === n ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={imageZoom === n ? { boxShadow: '0 0 8px #00ffff' } : {}}>{n}x</button>
                      ))}
                    </div>
                    <div className={`relative flex items-center justify-center bg-black/40 rounded border-2 p-2 overflow-auto max-h-[600px] ${eyedropperActive ? 'border-cyan-300' : 'border-pink-500/50'}`}>
                      {/* Zoom is applied by setting img width to naturalWidth
                          times the integer multiplier. Combined with
                          image-rendering: pixelated, the browser
                          nearest-neighbor scales it on display only. The
                          underlying naturalWidth/naturalHeight are unchanged,
                          so getPixelColorFromImage's coord math
                          (x/rect.width * naturalWidth) still resolves to the
                          exact source pixel. width is set via inline style
                          using a ref to read naturalWidth once the image
                          loads. */}
                      <img
                        ref={imageRef}
                        src={imageDataUrl}
                        alt="Uploaded"
                        className={imageZoom === 1 ? 'max-h-48 rounded' : 'rounded'}
                        style={{
                          imageRendering: 'pixelated',
                          cursor: eyedropperActive ? 'crosshair' : 'default',
                          ...(imageZoom > 1 && imageNaturalSize.width > 0 ? {
                            width: imageNaturalSize.width * imageZoom + 'px',
                            height: imageNaturalSize.height * imageZoom + 'px',
                            maxHeight: 'none',
                            maxWidth: 'none',
                          } : {}),
                        }}
                        onLoad={(e) => setImageNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                        onMouseMove={handleImageHover}
                        onMouseLeave={handleImageLeave}
                        onClick={handleImageClick}
                      />
                      {eyedropperActive && hoveredColor && (
                        <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/80 border-2 border-cyan-400 rounded px-2 py-1" style={{ boxShadow: '0 0 12px #00ffff', zIndex: 10 }}>
                          <div className="w-6 h-6 rounded border border-cyan-200" style={{ backgroundColor: hoveredColor }} />
                          <span className="text-cyan-200 text-xs font-mono font-bold">{hoveredColor.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {imageError && <div className={`text-sm rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{imageError}</div>}
              </div>
            )}

            {mode === 'ai' ? (
              <>
                <button onClick={handleAiGenerate} disabled={aiLoading} title="Send the description to AI and generate a palette" className="px-5 py-2 rounded font-bold bg-pink-400 text-purple-900 border-2 border-pink-200 hover:bg-pink-300 hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-60 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 15px #ff00ff' }}>
                  <Wand2 size={18} className={aiLoading ? 'animate-spin' : ''} />{aiLoading ? 'Processing...' : 'Execute'}
                </button>
                <button onClick={handleAiRandom} disabled={aiLoading} title="AI invents a random subject and generates its palette" className="px-5 py-2 rounded font-bold bg-purple-500 text-cyan-100 border-2 border-purple-200 hover:bg-purple-400 hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-60 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 15px #a855f7' }}>
                  <Dice5 size={18} className={aiLoading ? 'animate-spin' : ''} />Surprise Me
                </button>
                <button
                  onClick={() => setShowAISettings(true)}
                  title="AI Settings"
                  className={`px-4 py-2 rounded font-bold border-2 font-mono text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all hover:scale-105 ${aiConfigured === false ? 'bg-purple-950 text-purple-300 border-purple-500 ai-setup-pulse' : 'bg-purple-900 text-purple-200 border-purple-700'}`}
                  style={aiConfigured !== false ? { boxShadow: '0 0 8px rgba(126,34,206,0.4)' } : undefined}
                >
                  ⚙{aiConfigured === false && ' AI Setup'}
                </button>
              </>
            ) : mode === 'image' ? null : (
              <button onClick={handleGenerate} title="Replace the palette with a new single-ramp palette built from the hex above. Destructive: wipes pins, hidden shades, ramp locks, side-by-side slots, harmony anchor, and per-ramp customizations. To keep your existing palette, click Add base instead." className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 10px #ffff00' }}>
                <Sparkles size={18} />New palette
              </button>
            )}
          </div>

          {mode === 'ai' && aiReasoning && (
            <div className={`mb-4 p-3 rounded border-2 text-sm italic ${t.alertVisionBg} ${t.alertVisionText} ${t.alertVisionBorder}`}>
              <span className="font-bold not-italic uppercase tracking-wider">▸ VISION ▸ </span>{aiReasoning}
            </div>
          )}
          {mode === 'ai' && aiError && (
            <div className={`mb-4 p-3 rounded border-2 text-sm ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{aiError}</div>
          )}

          <div className="mt-4 pt-4 border-t border-cyan-700/30">
            <div className="flex flex-wrap gap-2 items-center justify-center text-cyan-100 mb-3">
              <span className="text-sm font-bold uppercase tracking-wider w-full sm:w-auto text-center">Preview Sprite:</span>
              {Object.entries(spriteLibrary).map(([key, sprite]) => {
                const previewRamp = ramps[0] || ['#000', '#444', '#888', '#fff'];
                const isCustom = !DEFAULT_SPRITE_LIBRARY[key];
                return (
                  <div key={key} className="relative">
                    <button onClick={() => setSpriteKey(key)} className={`flex flex-col items-center gap-1 p-2 rounded border-2 transition-all ${spriteKey === key ? 'bg-cyan-300/30 border-cyan-300' : `${t.controlBtnDefault} ${t.controlBtnHover} hover:border-cyan-500/50`}`} style={spriteKey === key ? { boxShadow: '0 0 10px #00ffff' } : {}} title={sprite.name}>
                      <div className="w-12 h-12 flex items-center justify-center bg-black/40 rounded overflow-hidden">
                        <PixelSprite palette={previewRamp} scale={1.2} spriteKey={key} spriteLibrary={spriteLibrary} />
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider ${spriteKey === key ? 'text-cyan-200' : t.bodyText}`}>{sprite.name}</span>
                    </button>
                    {isCustom && (
                      <>
                        <button onClick={() => removeCustomSprite(key)} className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white rounded-full border border-pink-200 hover:bg-pink-400 flex items-center justify-center text-xs font-bold" title="Remove">×</button>
                        <button onClick={(e) => { e.stopPropagation(); copySpriteSource(key); }} className="absolute -top-1 -left-1 w-5 h-5 bg-cyan-400 text-purple-900 rounded-full border border-cyan-200 hover:bg-cyan-300 flex items-center justify-center" title="Copy sprite source"><Copy size={10} /></button>
                      </>
                    )}
                  </div>
                );
              })}
              <button onClick={() => setShowSpriteImporter(!showSpriteImporter)} title="Open the sprite importer to add a custom preview sprite from a Piskel .c export" className="flex flex-col items-center gap-1 p-2 rounded border-2 border-dashed border-pink-400 bg-pink-900/30 hover:bg-pink-900/50 transition-all">
                <div className="w-12 h-12 flex items-center justify-center text-pink-300 text-2xl font-bold">+</div>
                <span className="text-[10px] uppercase tracking-wider text-pink-200">Import</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-4 items-center justify-center text-cyan-100 mt-3 pt-3 border-t border-cyan-700/20">
              <div className="flex gap-2 items-center">
                <span className="text-sm font-bold uppercase tracking-wider">Shades:</span>
                {[4, 5, 6, 7, 8].map(n => (
                  <button key={n} onClick={() => setRampSize(n)} title={`Use ${n} shades per ramp (default for new and unset ramps)`} className={`w-9 h-9 rounded font-bold border-2 transition-all ${rampSize === n ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={rampSize === n ? { boxShadow: '0 0 10px #00ffff' } : {}}>{n}</button>
                ))}
              </div>
              <div className="flex gap-2 items-center" title="Scales the warm/cool hue shifts applied to shadows and highlights. 0% is flat, 100% is the default, 200% is painterly. Affects all styles.">
                <span className="text-sm font-bold uppercase tracking-wider">Hue Shift:</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  value={Math.round(hueShiftStrength * 100)}
                  onChange={(e) => setHueShiftStrength(Number(e.target.value) / 100)}
                  className="w-32 accent-cyan-300"
                  aria-label="Hue shift strength"
                  title={`Hue shift strength: ${Math.round(hueShiftStrength * 100)}%`}
                />
                <span className="text-sm font-mono text-cyan-200 w-12 text-right tabular-nums">{Math.round(hueShiftStrength * 100)}%</span>
                {hueShiftStrength !== 1.0 && (
                  <button
                    onClick={() => setHueShiftStrength(1.0)}
                    title="Reset Hue Shift to 100% (default)"
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}
                  >Reset</button>
                )}
              </div>
            </div>

            {showSpriteImporter && (
              <div className="mt-3 p-4 rounded border-2 border-pink-500/50 bg-black/40">
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-pink-200 uppercase tracking-wider">▸ Import sprite from Piskel C file</p>
                  <div onDragOver={handleSpriteDragOver} onDragEnter={handleSpriteDragOver} onDragLeave={handleSpriteDragLeave} onDrop={handleSpriteDrop} className={`rounded border-2 border-dashed transition-all p-3 ${spriteDragging ? 'border-cyan-300 bg-cyan-500/20 scale-[1.02]' : 'border-cyan-500/40 bg-cyan-900/20 hover:bg-cyan-900/30'}`}>
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={24} className={`transition-all ${spriteDragging ? 'text-cyan-200 scale-125' : 'text-cyan-300'}`} />
                      <p className="text-xs text-cyan-100 text-center">{spriteDragging ? '>>> DROP IT <<<' : 'Drop .c file or paste below'}</p>
                      <label className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-200 hover:bg-cyan-300 transition-all flex items-center gap-2 cursor-pointer text-xs uppercase tracking-wider">
                        <Upload size={14} />Browse for .c file
                        <input type="file" accept=".c,.txt,text/plain" onChange={(e) => handleSpriteFile(e.target.files[0])} className="hidden" />
                      </label>
                    </div>
                  </div>
                  <input type="text" value={spriteImportName} onChange={(e) => setSpriteImportName(e.target.value)} placeholder="Sprite name (e.g. Walkman)" title="Name shown under the sprite tile in the preview row" className="px-3 py-2 rounded bg-black/60 text-cyan-200 border-2 border-cyan-400 w-full text-sm focus:outline-none" />
                  <textarea value={spriteImportText} onChange={(e) => setSpriteImportText(e.target.value)} placeholder="...or paste the C array text" title="Paste the contents of a Piskel C export here" className="px-3 py-2 rounded bg-black/60 text-cyan-200 font-mono text-xs border-2 border-cyan-400 w-full focus:outline-none" rows={4} />
                  {spriteImportError && <div className={`text-xs rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{spriteImportError}</div>}
                  <div className="flex gap-2">
                    <button onClick={importSprite} title="Add this sprite to the preview library" className="px-4 py-2 rounded font-bold bg-pink-400 text-purple-900 border-2 border-pink-200 hover:bg-pink-300 hover:scale-105 transition-all uppercase tracking-wider text-sm flex-1" style={{ boxShadow: '0 0 10px #ff00ff' }}>Import Sprite</button>
                    <button onClick={() => { setShowSpriteImporter(false); setSpriteImportError(''); }} title="Close the importer without saving" className="px-4 py-2 rounded font-bold bg-purple-700 text-cyan-100 border-2 border-cyan-500 hover:bg-purple-600 transition-all uppercase tracking-wider text-sm">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-lg p-6 mb-6 border-2 backdrop-blur-sm${activeTourTarget === 'ramp-area' ? ' tour-highlight' : ''}`} data-tour-id="ramp-area" style={{ background: t.cardBgCyan, borderColor: themedAccentBorder('#00ffff'), boxShadow: accentGlow('#00ffff', 0.4) }}>
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest" style={{ color: sectionHeadColor('#00ffff'), textShadow: accentTextGlow('#00ffff') }}><Sun size={22} />Color Ramps</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Per-ramp export style toggle. Governs the per-ramp Copy
                  and Download buttons on every ramp card. Decoupled from
                  vizStyle (Visualization panel near the bottom of the
                  page) so changing one does not change the other. Three
                  buttons share the segmented look of the existing
                  vizStyle picker in the Visualization section for
                  consistency, but at smaller size since this is a
                  header-row control. */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded border-2 ${t.controlPanelBg} ${t.controlPanelBorder}`} title="Style used by the Copy and Download buttons on each ramp card. Independent of the Visualization panel's style. Hidden shades are always excluded.">
                <span className={`text-[10px] font-bold uppercase tracking-wider mr-1 ${theme === 'dark' ? 'text-cyan-200/80' : t.panelTextInactive}`}>Ramp export:</span>
                <button onClick={() => setRampExportStyle('punchy')} title="Per-ramp Copy and Download use Punchy shades" className={`px-2 py-0.5 rounded font-bold border transition-all text-[10px] uppercase tracking-wider ${rampExportStyle === 'punchy' ? 'bg-pink-300 text-purple-900 border-pink-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={rampExportStyle === 'punchy' ? { boxShadow: '0 0 8px #ff00ff' } : {}}>Punchy</button>
                <button onClick={() => setRampExportStyle('balanced')} title="Per-ramp Copy and Download use Balanced shades" className={`px-2 py-0.5 rounded font-bold border transition-all text-[10px] uppercase tracking-wider ${rampExportStyle === 'balanced' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={rampExportStyle === 'balanced' ? { boxShadow: '0 0 8px #00ffff' } : {}}>Balanced</button>
                <button onClick={() => setRampExportStyle('muted')} title="Per-ramp Copy and Download use Muted shades" className={`px-2 py-0.5 rounded font-bold border transition-all text-[10px] uppercase tracking-wider ${rampExportStyle === 'muted' ? 'bg-purple-300 text-purple-900 border-purple-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={rampExportStyle === 'muted' ? { boxShadow: '0 0 8px #a855f7' } : {}}>Muted</button>
              </div>
              {baseColors.length > 1 && (
                <button onClick={toggleAllRampsCollapse} title={anyRampExpanded ? 'Collapse every ramp card to its icon previews' : 'Expand every ramp card to show all swatches'} className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${t.controlBtnDefault} ${t.controlBtnHover}`}>
                  {anyRampExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {anyRampExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              )}
              <button onClick={resetToDefaults} title={confirmReset ? 'Click again to confirm. Wipes pins, hidden shades, ramp locks, per-ramp sizes and saturations, hue shift strength, side-by-side slots, harmony anchor, and the AI prompt. Picks a new random base color. Preserves shade count, hardware lock, and theme.' : 'Reset all per-palette customizations and start from a new random base color. Asks for confirmation.'} className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${confirmReset ? 'bg-red-300 text-red-900 border-red-100 animate-pulse' : 'bg-pink-500 text-white border-pink-200 hover:bg-pink-400'}`}>
                <RotateCcw size={14} />
                {confirmReset ? 'Confirm?' : 'Reset to Defaults'}
              </button>
            </div>
          </div>
          {activeHardware && (
            <div className="mb-4 p-2 rounded border-2 border-yellow-400 bg-yellow-900/30 flex items-center gap-2 text-xs" style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.4)' }}>
              <Cpu size={14} className="text-yellow-200 flex-shrink-0" />
              <span className="text-yellow-100">
                <strong className="text-yellow-200 uppercase tracking-wider">Locked to {activeHardware.name}.</strong>
                {' '}Every generated shade snaps to one of the {activeHardware.colors.length} hardware-legal {activeHardware.colors.length === 1 ? 'color' : 'colors'}. Ramps with more requested shades than the palette supports will visually collapse to unique entries.
              </span>
            </div>
          )}
          {baseColors.map((_, i) => {
            const punchy = rampsPunchy[i];
            const balanced = rampsBalanced[i];
            const muted = rampsMuted[i];
            // Per-style labels: each style ramp may have its base land at
            // a different post-sort position because the style curves
            // can clamp midHighlight/midShadow above/below the base in
            // certain L ranges. Compute labels independently for each.
            const effectiveBase = resolveBaseForRamp(baseColors[i], i);
            const labelsP = labelsForRamp(punchy, effectiveBase);
            const labelsB = labelsForRamp(balanced, effectiveBase);
            const labelsM = labelsForRamp(muted, effectiveBase);
            // For downstream uses that need a single labels array (e.g.
            // the shade label tooltip line and the sprite preview which
            // operates on the punchy ramp), use the punchy variant.
            const labels = labelsP;
            // Filtered variants honor hiddenShades for that base. Used by
            // the sprite preview (so the demo updates as shades are
            // hidden), the swatch grid, and the card bg tint. The full
            // unfiltered ramps stay around because pin overrides and
            // shade-index semantics still reference the pre-filter
            // positions.
            const fPunchyTop = filterHidden(punchy, labelsP, i);
            const fBalancedTop = filterHidden(balanced, labelsB, i);
            const fMutedTop = filterHidden(muted, labelsM, i);
            // For the card bg tint, use the brightest visible shade of
            // each filtered ramp. The "last visible shade" refusal in
            // hideShade ensures these arrays always have length >= 1, but
            // we still guard defensively in case a load restored an
            // edge-case state.
            const bgFromHex = (hex, alpha) => {
              const { r, g, b } = hexToRgb(hex);
              return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };
            const punchyBg = bgFromHex(fPunchyTop.hexes[fPunchyTop.hexes.length - 1] || punchy[punchy.length - 1], 0.7);
            const balancedBg = bgFromHex(fBalancedTop.hexes[fBalancedTop.hexes.length - 1] || balanced[balanced.length - 1], 0.7);
            const mutedBg = bgFromHex(fMutedTop.hexes[fMutedTop.hexes.length - 1] || muted[muted.length - 1], 0.7);
            const baseHex = baseColors[i];
            // Contrast check: if the base color is too close to the card background
            // (e.g. user picked a near-black or dark-purple base), fall back to a
            // light cyan border so the bounding box stays visible.
            const lumChannel = (c) => {
              const v = c / 255;
              return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            };
            const relLum = ({ r, g, b }) => 0.2126 * lumChannel(r) + 0.7152 * lumChannel(g) + 0.0722 * lumChannel(b);
            const baseRgb = hexToRgb(baseHex);
            // Approximate the ramps-section background (dark purple gradient ~30,5,56)
            const cardBgLum = relLum({ r: 30, g: 5, b: 56 });
            const baseLum = relLum(baseRgb);
            const contrastRatio = (Math.max(baseLum, cardBgLum) + 0.05) / (Math.min(baseLum, cardBgLum) + 0.05);
            const useFallback = contrastRatio < 2.0;
            const borderHex = useFallback ? '#a8e0ff' : baseHex;
            const baseBorder = bgFromHex(borderHex, 0.85);
            const baseGlow = bgFromHex(borderHex, 0.45);
            // When the ramp is locked, override the per-ramp base-color
            // border with a yellow lock-indicator border so the locked
            // state is visible at a glance across the page. The glow
            // also goes yellow. Lock state ranks above per-ramp base
            // color for border purposes; the swatches themselves still
            // render in their own colors.
            const isLocked = lockedRamps.has(i);
            const cardBorder = isLocked ? 'rgba(255, 220, 0, 0.85)' : baseBorder;
            const cardGlow = isLocked ? 'rgba(255, 220, 0, 0.5)' : baseGlow;
            return (
              <div key={i} className="mb-4 last:mb-0 relative rounded-lg p-4" style={{ border: `2px solid ${cardBorder}`, boxShadow: `0 0 14px ${cardGlow}` }}>
                {/* Top-right action buttons: edit (toggles editor), shuffle
                    this ramp's jitter, lock (freezes this ramp against
                    global regenerate), restore hidden shades (only when
                    this base has any), and remove (visible when >1 ramp).
                    The shuffle button is hidden when locked, since
                    re-jittering contradicts the lock contract; shuffleRamp
                    itself also gates on lock as a defense in depth. */}
                <div className="absolute -top-2 right-2 flex gap-1 z-10">
                  <button onClick={() => toggleBaseEditor(i)} title={editingIndex === i ? 'Close editor' : 'Edit base color'} className={`w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center ${editingIndex === i ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-cyan-500 text-white border-cyan-200 hover:bg-cyan-400'}`} style={editingIndex === i ? { boxShadow: '0 0 10px #ffff00' } : { boxShadow: '0 0 8px rgba(0, 200, 255, 0.6)' }}>
                    <Sliders size={14} />
                  </button>
                  {!isLocked && (
                    <button onClick={() => shuffleRamp(i)} title="Reshuffle this ramp's jitter (does not affect other ramps)" className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-purple-600 text-cyan-100 border-cyan-400 hover:bg-purple-500" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }}>
                      <Shuffle size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => toggleRampLock(i)}
                    title={isLocked
                      ? 'Unlock this ramp. Once unlocked, it will be affected by Generate, Shuffle, and Harmonize again.'
                      : 'Lock this ramp. The Generate/Shuffle buttons will skip it, and Harmonize will use it as a fixed reference. Pins and hidden shades are unaffected (they were per-ramp anyway).'}
                    className={`w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center ${isLocked ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-600 text-cyan-100 border-cyan-400 hover:bg-purple-500'}`}
                    style={isLocked ? { boxShadow: '0 0 10px rgba(255, 220, 0, 0.8)' } : { boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }}
                  >
                    {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  {/* Duplicate: append a copy of this ramp at the end of the
                      palette, carrying over per-ramp settings (pins, shade
                      count, sat multiplier, hidden shades, shuffle offset).
                      Lock state does not carry over (duplicate is for
                      tweaking; the user can re-lock if they want). The
                      auto-collapse useEffect handles whether the new
                      ramp's card starts collapsed (total >= 3 collapses
                      it; total < 3 leaves it expanded). With the v0.6
                      perceptual engine, the duplicate is byte-identical
                      to the source — engine is deterministic from
                      (base, style, size, hueShift, curve, gamut,
                      satMult) and ignores the shuffle seed. */}
                  <button
                    onClick={() => duplicateRamp(i)}
                    title="Duplicate this ramp at the end of the palette. Carries over pins, shade count, saturation multiplier, hidden shades, and shuffle offset. Does not carry over lock state. The duplicate is identical to the source."
                    className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-purple-600 text-cyan-100 border-cyan-400 hover:bg-purple-500"
                    style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }}
                  >
                    <CopyPlus size={12} />
                  </button>
                  {/* Per-ramp export buttons. Both operate on the
                      rampExportStyle setting (the Punchy/Balanced/Muted
                      toggle in the Color Ramps section header), which is
                      independent of the Visualization panel's vizStyle.
                      Hidden shades are excluded (same as the full-palette
                      exporters). */}
                  <button
                    onClick={() => copyRampToClipboard(i)}
                    title={`Copy this ramp's hex values to clipboard at the active per-ramp export style (${rampExportStyle}). Change the style via the Punchy/Balanced/Muted toggle in the section header. Hidden shades excluded.`}
                    className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-cyan-500 text-white border-cyan-200 hover:bg-cyan-400"
                    style={{ boxShadow: '0 0 8px rgba(0, 200, 255, 0.6)' }}
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => downloadSingleRampGpl(i)}
                    title={`Download this ramp as a single-ramp .gpl file at the active per-ramp export style (${rampExportStyle}). Change the style via the Punchy/Balanced/Muted toggle in the section header. Hidden shades excluded.`}
                    className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-yellow-400 text-purple-900 border-yellow-200 hover:bg-yellow-300"
                    style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }}
                  >
                    <Download size={12} />
                  </button>
                  {Array.isArray(hiddenShades[i]) && hiddenShades[i].length > 0 && (
                    <button onClick={() => resetHiddenShades(i)} title={`Restore ${hiddenShades[i].length} hidden shade${hiddenShades[i].length === 1 ? '' : 's'}`} className="h-7 px-2 bg-yellow-400 text-purple-900 rounded-full border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-110 transition-all flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }}>
                      <Sparkles size={12} />Restore {hiddenShades[i].length}
                    </button>
                  )}
                  {baseColors.length > 1 && (
                    <button onClick={() => removeRamp(i)} title="Remove this ramp" className="w-7 h-7 bg-pink-500 text-white rounded-full border-2 border-pink-200 hover:bg-pink-400 hover:scale-110 transition-all flex items-center justify-center text-base font-bold" style={{ boxShadow: '0 0 8px rgba(255, 0, 110, 0.6)' }}>×</button>
                  )}
                </div>

                {/* Base color editor (feature #1). Slides in above the ramps row. */}
                {editingIndex === i && (
                  <div className="mb-4 p-3 rounded border-2 border-yellow-500/60 bg-black/40" style={{ boxShadow: '0 0 12px rgba(255, 255, 0, 0.25)' }}>
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="text-xs font-bold text-yellow-200 uppercase tracking-wider">▸ Adjust Base</span>
                      <div className="flex items-center gap-2">
                        <input type="color" value={baseColors[i]} onChange={(e) => updateEditorHex(e.target.value)} title="Pick a new base color from the OS color picker" className="w-10 h-10 rounded border-2 border-yellow-400 cursor-pointer" style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.5)' }} />
                        <input type="text" value={baseColors[i]} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) updateEditorHex(v); }} title="Type a hex color (e.g. #ff6b35)" className="px-2 py-1 rounded bg-black/60 text-yellow-100 font-mono text-sm border-2 border-yellow-400 w-24 focus:outline-none" />
                      </div>
                      <div className="ml-auto">
                        <button onClick={() => setEditingIndex(null)} title="Close the base color editor" className="text-xs px-2 py-1 rounded font-bold bg-purple-700 text-cyan-100 border-2 border-cyan-500 hover:bg-purple-600 transition-all uppercase tracking-wider">Done</button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {/* Hue 0-359 (wraps), Sat 0-100, Value 0-100. HSV: V=100 with S=100 is the pure color, not white. */}
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-mono text-yellow-200 w-12">Hue</span>
                        <input type="range" min={0} max={359} value={editorHsv.h} onChange={(e) => updateEditorHsv({ ...editorHsv, h: Number(e.target.value) })} title={`Hue: ${editorHsv.h}°`} className="flex-1 accent-yellow-400" />
                        <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{editorHsv.h}°</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-mono text-yellow-200 w-12">Sat</span>
                        <input type="range" min={0} max={100} value={editorHsv.s} onChange={(e) => updateEditorHsv({ ...editorHsv, s: Number(e.target.value) })} title={`Saturation: ${editorHsv.s}%`} className="flex-1 accent-yellow-400" />
                        <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{editorHsv.s}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-mono text-yellow-200 w-12">Value</span>
                        <input type="range" min={0} max={100} value={editorHsv.v} onChange={(e) => updateEditorHsv({ ...editorHsv, v: Number(e.target.value) })} title={`Value: ${editorHsv.v}%`} className="flex-1 accent-yellow-400" />
                        <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{editorHsv.v}%</span>
                      </div>
                    </div>
                    {/* Per-ramp overrides: shade count and saturation
                        multiplier. Both live in the editor since they're
                        per-ramp scopes. Size overrides the global Shades
                        selector; saturation multiplier is applied to the
                        base color BEFORE generateRamp, scaling the resulting
                        ramp's saturation up or down. Reset buttons clear
                        the override and fall back to global / 1x. */}
                    <div className="mt-3 pt-3 border-t border-yellow-500/30 flex flex-col gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] font-bold text-yellow-200 uppercase tracking-wider">Shades:</span>
                        <div className="flex gap-1">
                          {[4, 5, 6, 7, 8].map(n => {
                            const effective = resolveSizeForRamp(i);
                            const isOverride = rampSizeOverrides[i] !== undefined;
                            const isActive = effective === n;
                            return (
                              <button
                                key={n}
                                onClick={() => setRampSizeOverrides(prev => ({ ...prev, [i]: n }))}
                                className={`w-7 h-7 rounded text-xs font-bold border-2 transition-all ${isActive ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-100 border-yellow-700/50 hover:bg-purple-800/60'}`}
                                style={isActive ? { boxShadow: '0 0 8px rgba(255, 255, 0, 0.5)' } : {}}
                                title={isActive ? (isOverride ? `Currently overridden to ${n}` : `${n} (inheriting global)`) : `Override this ramp to ${n} shades`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                        {rampSizeOverrides[i] !== undefined && (
                          <button onClick={() => setRampSizeOverrides(prev => { const n = { ...prev }; delete n[i]; return n; })} title={`Clear the per-ramp size override and use the global setting (${rampSize})`} className="text-[10px] px-2 py-1 rounded font-bold bg-purple-700 text-yellow-100 border-2 border-yellow-700/50 hover:bg-purple-600 transition-all uppercase tracking-wider">Inherit ({rampSize})</button>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[11px] font-bold text-yellow-200 uppercase tracking-wider w-12">Sat ×</span>
                        <input
                          type="range"
                          min={50}
                          max={200}
                          step={5}
                          value={Math.round((rampSatOverrides[i] ?? 1) * 100)}
                          onChange={(e) => {
                            const pct = Number(e.target.value);
                            setRampSatOverrides(prev => ({ ...prev, [i]: pct / 100 }));
                          }}
                          className="flex-1 accent-yellow-400 min-w-[100px]"
                          title={`Saturation multiplier for this ramp: ${(rampSatOverrides[i] ?? 1).toFixed(2)}x (range 0.50x to 2.00x)`}
                        />
                        <span className="text-[11px] font-mono text-yellow-100 w-14 text-right">{(rampSatOverrides[i] ?? 1).toFixed(2)}x</span>
                        {rampSatOverrides[i] !== undefined && rampSatOverrides[i] !== 1 && (
                          <button onClick={() => setRampSatOverrides(prev => { const n = { ...prev }; delete n[i]; return n; })} title="Reset per-ramp saturation multiplier to 1.00x" className="text-[10px] px-2 py-1 rounded font-bold bg-purple-700 text-yellow-100 border-2 border-yellow-700/50 hover:bg-purple-600 transition-all uppercase tracking-wider">Reset</button>
                        )}
                      </div>
                      <RampAdvancedPanel
                        open={advancedOpen[String(i)] ?? false}
                        curve={curvePerRamp[String(i)] ?? 'eased'}
                        gamut={gamutPerRamp[String(i)] ?? 'auto'}
                        onToggle={() => setAdvancedOpen(prev => ({ ...prev, [String(i)]: !prev[String(i)] }))}
                        onCurveChange={c => setCurvePerRamp(prev => ({ ...prev, [String(i)]: c }))}
                        onGamutChange={g => setGamutPerRamp(prev => ({ ...prev, [String(i)]: g }))}
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col lg:flex-row gap-4 items-start">
                  <div onClick={() => toggleRampCollapse(i)} title={collapsedRamps.has(i) ? 'Expand this ramp card' : 'Collapse this ramp card to icons only'} className="flex flex-row gap-3 items-start flex-shrink-0 flex-wrap cursor-pointer select-none hover:opacity-90 transition-opacity">
                    <div className="w-36 flex flex-col items-center gap-1 p-3 rounded border-2 border-pink-500/50" style={{ background: punchyBg, boxShadow: '0 0 12px rgba(255, 0, 255, 0.3)' }}>
                      <PixelSprite palette={fPunchyTop.hexes} scale={(() => { const w = spriteLibrary[spriteKey]?.pattern?.[0]?.length || 14; if (w >= 32) return 3; if (w >= 22) return 3; if (w >= 18) return 4; return 5; })()} spriteKey={spriteKey} spriteLibrary={spriteLibrary} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themedAccent('#ff00ff'), textShadow: accentTextGlow('#ff00ff', 6) }}>Punchy</span>
                      <span className="text-xs font-bold text-center uppercase tracking-wider break-words w-full leading-tight" style={{ color: t.colorNameText }}>{aiColorNames[i] || `Color ${i + 1}`}</span>
                    </div>
                    <div className="w-36 flex flex-col items-center gap-1 p-3 rounded border-2 border-cyan-500/50" style={{ background: balancedBg, boxShadow: '0 0 12px rgba(0, 255, 255, 0.3)' }}>
                      <PixelSprite palette={fBalancedTop.hexes} scale={(() => { const w = spriteLibrary[spriteKey]?.pattern?.[0]?.length || 14; if (w >= 32) return 3; if (w >= 22) return 3; if (w >= 18) return 4; return 5; })()} spriteKey={spriteKey} spriteLibrary={spriteLibrary} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themedAccent('#00ffff'), textShadow: accentTextGlow('#00ffff', 6) }}>Balanced</span>
                      <span className="text-xs font-bold text-center uppercase tracking-wider break-words w-full leading-tight" style={{ color: t.colorNameText }}>{aiColorNames[i] || `Color ${i + 1}`}</span>
                    </div>
                    <div className="w-36 flex flex-col items-center gap-1 p-3 rounded border-2 border-purple-400/60" style={{ background: mutedBg, boxShadow: '0 0 12px rgba(168, 85, 247, 0.3)' }}>
                      <PixelSprite palette={fMutedTop.hexes} scale={(() => { const w = spriteLibrary[spriteKey]?.pattern?.[0]?.length || 14; if (w >= 32) return 3; if (w >= 22) return 3; if (w >= 18) return 4; return 5; })()} spriteKey={spriteKey} spriteLibrary={spriteLibrary} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themedAccent('#a855f7'), textShadow: accentTextGlow('#a855f7', 6) }}>Muted</span>
                      <span className="text-xs font-bold text-center uppercase tracking-wider break-words w-full leading-tight" style={{ color: t.colorNameText }}>{aiColorNames[i] || `Color ${i + 1}`}</span>
                    </div>
                    <span className="self-center pl-1 text-cyan-200" aria-hidden="true">
                      {collapsedRamps.has(i) ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </span>
                  </div>
                  {!collapsedRamps.has(i) && (() => {
                  // Reuse fPunchyTop/fBalancedTop/fMutedTop computed at
                  // the top of the loop iteration. Aliases for brevity.
                  const fPunchy = fPunchyTop;
                  const fBalanced = fBalancedTop;
                  const fMuted = fMutedTop;
                  // Right-click hide uses the ORIGINAL shade index
                  // (pre-filter) so the hidden map keys stay aligned with
                  // the full computed ramps. originalIndices[k] gives that
                  // for the kth visible swatch.
                  const rampLen = punchy.length;
                  // Adjacent-pair contrast helper: build a hover-tooltip
                  // fragment describing the WCAG ratio between this swatch
                  // and each of its left/right visible neighbors in the same
                  // row. Returns null for ramps of length 1 (no neighbors)
                  // and an empty string for the only-one-side cases isn't
                  // useful; we always include whichever sides exist.
                  const adjTip = (rampHexes, rampLabels, k) => {
                    if (rampHexes.length <= 1) return null;
                    const here = rampHexes[k];
                    const parts = [];
                    if (k > 0) {
                      const prev = rampHexes[k - 1];
                      const prevLabel = rampLabels[k - 1] || `shade ${k}`;
                      const ratio = wcagContrast(here, prev);
                      const tier = wcagAaTier(ratio);
                      parts.push(`vs ${prevLabel}: ${ratio.toFixed(2)}:1 ${tier}`);
                    }
                    if (k < rampHexes.length - 1) {
                      const next = rampHexes[k + 1];
                      const nextLabel = rampLabels[k + 1] || `shade ${k + 2}`;
                      const ratio = wcagContrast(here, next);
                      const tier = wcagAaTier(ratio);
                      parts.push(`vs ${nextLabel}: ${ratio.toFixed(2)}:1 ${tier}`);
                    }
                    return `Contrast: ${parts.join(', ')}`;
                  };
                  return (
                  <div className="flex flex-col gap-3 flex-1 min-w-0">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent('#ff00ff'), textShadow: accentTextGlow('#ff00ff', 6) }}>▸ Punchy</div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fPunchy.hexes.length}, minmax(0, 100px))` }}>
                        {fPunchy.hexes.map((hex, k) => {
                          const origJ = fPunchy.originalIndices[k];
                          return <Swatch key={`p-${i}-${origJ}`} hex={hex} label={fPunchy.labels[k] || ''} borderClass="border-pink-400" shadowRgba="rgba(255, 0, 255, 0.3)" baseIndex={i} shadeIndex={origJ} style="punchy" onContextMenu={() => hideShade(i, origJ, rampLen)} extraTooltip={adjTip(fPunchy.hexes, fPunchy.labels, k)} />;
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent('#00ffff'), textShadow: accentTextGlow('#00ffff', 6) }}>▸ Balanced</div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fBalanced.hexes.length}, minmax(0, 100px))` }}>
                        {fBalanced.hexes.map((hex, k) => {
                          const origJ = fBalanced.originalIndices[k];
                          return <Swatch key={`b-${i}-${origJ}`} hex={hex} label={fBalanced.labels[k] || ''} borderClass="border-cyan-400" shadowRgba="rgba(0, 255, 255, 0.3)" baseIndex={i} shadeIndex={origJ} style="balanced" onContextMenu={() => hideShade(i, origJ, rampLen)} extraTooltip={adjTip(fBalanced.hexes, fBalanced.labels, k)} />;
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent('#a855f7'), textShadow: accentTextGlow('#a855f7', 6) }}>▸ Muted</div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fMuted.hexes.length}, minmax(0, 100px))` }}>
                        {fMuted.hexes.map((hex, k) => {
                          const origJ = fMuted.originalIndices[k];
                          return <Swatch key={`m-${i}-${origJ}`} hex={hex} label={fMuted.labels[k] || ''} borderClass="border-purple-400" shadowRgba="rgba(168, 85, 247, 0.3)" baseIndex={i} shadeIndex={origJ} style="muted" onContextMenu={() => hideShade(i, origJ, rampLen)} extraTooltip={adjTip(fMuted.hexes, fMuted.labels, k)} />;
                        })}
                      </div>
                    </div>
                  </div>
                  );
                  })()}
                </div>
                {/* Per-shade pin editor. Renders below the ramp rows when the
                    user has clicked a pushpin on a swatch belonging to this
                    base. Per-style: each pin affects only the style row it
                    was clicked on. The editor reads its starting hex from
                    the matching style's ramp so the picker opens on the
                    user's actual current shade. */}
                {pinEditor && pinEditor.baseIndex === i && (() => {
                  const j = pinEditor.shadeIndex;
                  const ps = pinEditor.style;
                  const sourceRamp = ps === 'balanced' ? rampsBalanced[i] : ps === 'muted' ? rampsMuted[i] : rampsPunchy[i];
                  const currentHex = (sourceRamp && sourceRamp[j]) || baseColors[i];
                  const pinned = isShadePinned(i, j, ps);
                  const shadeLabel = labels[j] || `shade ${j + 1}`;
                  const styleLabel = ps === 'balanced' ? 'Balanced' : ps === 'muted' ? 'Muted' : 'Punchy';
                  const styleColor = ps === 'balanced' ? '#00ffff' : ps === 'muted' ? '#a855f7' : '#ff00ff';
                  return (
                    <div className="mt-4 p-3 rounded border-2 border-yellow-500/60 bg-black/40" style={{ boxShadow: '0 0 12px rgba(255, 255, 0, 0.25)' }}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-bold text-yellow-200 uppercase tracking-wider flex items-center gap-1">
                          <Pin size={12} /> Pin Shade: <span style={{ color: styleColor }}>{styleLabel}</span> / <span className="text-pink-200">{shadeLabel}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <input type="color" value={currentHex} onChange={(e) => setOverride(i, j, ps, e.target.value)} title="Pick the hex color this shade will be pinned to" className="w-10 h-10 rounded border-2 border-yellow-400 cursor-pointer" style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.5)' }} />
                          <input type="text" value={currentHex} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) setOverride(i, j, ps, v); }} title="Type a hex color for this pin (e.g. #ff6b35)" className="px-2 py-1 rounded bg-black/60 text-yellow-100 font-mono text-sm border-2 border-yellow-400 w-24 focus:outline-none" />
                        </div>
                        <span className="text-[11px] text-yellow-100/70 italic">Affects only the {styleLabel} ramp</span>
                        <div className="ml-auto flex gap-2">
                          {pinned && (
                            <button onClick={() => { clearOverride(i, j, ps); setPinEditor(null); }} title="Remove this pin and close the editor" className="text-xs px-2 py-1 rounded font-bold bg-pink-500 text-white border-2 border-pink-200 hover:bg-pink-400 transition-all uppercase tracking-wider flex items-center gap-1">
                              <Trash2 size={12} />Unpin
                            </button>
                          )}
                          <button onClick={() => setPinEditor(null)} title="Close the pin editor (keeps the current pin)" className="text-xs px-2 py-1 rounded font-bold bg-purple-700 text-cyan-100 border-2 border-cyan-500 hover:bg-purple-600 transition-all uppercase tracking-wider">Close</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>

        <div className="rounded-lg mb-6 border-2 backdrop-blur-sm overflow-hidden" style={{ background: t.cardBgPink, borderColor: themedAccentBorder('#ff00ff'), boxShadow: accentGlow('#ff00ff', 0.4) }}>
          <button onClick={() => setHarmonyOpen(o => !o)} title={harmonyOpen ? 'Collapse Harmony Colors' : 'Expand Harmony Colors'} className={`w-full p-4 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
            <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest" style={{ color: sectionHeadColor('#ff00ff'), textShadow: accentTextGlow('#ff00ff') }}><Sparkles size={22} />Harmony Colors</h2>
            <span style={{ color: sectionHeadColor('#ff00ff') }}>{harmonyOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</span>
          </button>
          {harmonyOpen && <div className="px-6 pb-6">
          <p className="text-xs text-pink-100/80 mb-4 italic">▸ Click any swatch to add a ramp, or "Add All" / "Add Both" for sets ◂ Hover a category name for tips ◂</p>
          {/* Anchor selector: pick which ramp the harmony palette is derived
              from. Only shown when there's more than one ramp; with a single
              base, the harmony is unambiguous. Each thumbnail is a small
              clickable swatch showing the base color of that ramp. */}
          {baseColors.length > 1 && (
            <div className="mb-4 p-3 rounded border-2 border-pink-500/40 bg-black/30">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-pink-200 uppercase tracking-wider">▸ Derive From:</span>
                <div className="flex gap-2 flex-wrap items-center">
                  {baseColors.map((hex, i) => {
                    const selected = safeAnchor === i;
                    const labelName = aiColorNames[i] || `Color ${i + 1}`;
                    return (
                      <button
                        key={`anchor-${i}`}
                        onClick={() => setHarmonyAnchor(i)}
                        title={`Use ${labelName} (${hex.toUpperCase()}) as harmony source`}
                        className={`flex items-center gap-2 px-2 py-1 rounded border-2 transition-all ${selected ? 'border-pink-200 bg-pink-500/30 scale-105' : 'border-pink-700/50 bg-purple-900/40 hover:bg-purple-800/60 hover:border-pink-400/60'}`}
                        style={selected ? { boxShadow: '0 0 10px rgba(255, 0, 255, 0.6)' } : {}}
                      >
                        <div className="w-6 h-6 rounded border flex-shrink-0" style={{ backgroundColor: hex, borderColor: t.vizDataBorder }} />
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${selected ? 'text-pink-100' : 'text-pink-300/80'}`}>{labelName}</span>
                      </button>
                    );
                  })}
                </div>
                {/* Harmonize cluster: mode selector, button, restore, status. */}
                <div className="ml-auto flex flex-col items-end gap-1.5">
                  {(() => {
                    const anchorName = aiColorNames[safeAnchor] || `Color ${safeAnchor + 1}`;
                    let unlockedCount = 0;
                    for (let i = 0; i < baseColors.length; i++) {
                      if (i === safeAnchor) continue;
                      if (lockedRamps.has(i)) continue;
                      unlockedCount++;
                    }
                    const disabled = unlockedCount === 0;
                    const MODES = [
                      { key: 'complement',       label: 'Compl.',  tip: 'All unlocked ramps snap to the complementary hue (180° from anchor). Maximum contrast.' },
                      { key: 'analogous',        label: 'Analog',  tip: 'Ramps cluster tightly around the anchor (±15–60°). Low contrast, cohesive feel.' },
                      { key: 'triadic',          label: 'Triadic', tip: 'Ramps distributed at 120° intervals around the wheel. Balanced and vibrant.' },
                      { key: 'split-complement', label: 'Split',   tip: 'Ramps land at ±150° from anchor (adjacent to the complement). Softer than straight complement.' },
                      { key: 'square',           label: 'Square',  tip: 'Ramps at 90° intervals around the wheel. Even spacing, four-color symmetry.' },
                      { key: 'tetradic',         label: 'Tetrad',  tip: 'Two complementary pairs with a 60° offset between them (rectangle on the wheel).' },
                    ];
                    return (
                      <>
                        <div className="flex flex-wrap justify-end gap-1">
                          {MODES.map(({ key, label, tip }) => (
                            <button
                              key={key}
                              onClick={() => setHarmonizeMode(key)}
                              title={tip}
                              className={`px-2 py-0.5 rounded font-bold border transition-all text-[10px] uppercase tracking-wider ${
                                harmonizeMode === key
                                  ? 'bg-pink-400 text-purple-900 border-pink-100'
                                  : 'bg-purple-900/40 text-pink-300/80 border-pink-700/40 hover:bg-purple-800/60 hover:border-pink-500/60'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          {harmonizeBaseline && (
                            <button
                              onClick={restoreHarmonizeBaseline}
                              title="Restore the hues from before any Harmonize was applied. Saturation and lightness stay as-is."
                              className="px-2 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 uppercase tracking-wider text-[10px] bg-yellow-400 text-purple-900 border-yellow-100 hover:bg-yellow-300"
                              style={{ boxShadow: '0 0 8px rgba(255, 230, 0, 0.4)' }}
                            >
                              <RotateCcw size={11} />Restore
                            </button>
                          )}
                          <button
                            onClick={harmonize}
                            disabled={disabled}
                            title={disabled
                              ? 'Nothing to harmonize: every non-anchor ramp is locked.'
                              : `Snap hues of ${unlockedCount} unlocked ramp${unlockedCount === 1 ? '' : 's'} to ${harmonizeMode.replace('-', ' ')} positions relative to ${anchorName}. Saturation and lightness preserved.`}
                            className={`px-3 py-2 rounded font-bold border-2 transition-all flex items-center gap-2 uppercase tracking-wider text-xs ${disabled
                              ? 'bg-purple-900/40 text-pink-300/40 border-pink-700/30 cursor-not-allowed'
                              : 'bg-pink-400 text-purple-900 border-pink-100 hover:bg-pink-300 hover:scale-105'}`}
                            style={disabled ? {} : { boxShadow: '0 0 10px rgba(255, 0, 255, 0.5)' }}
                          >
                            <Sparkles size={14} />Harmonize
                          </button>
                        </div>
                        <span className="text-[10px] text-pink-200/70 italic">
                          {disabled
                            ? 'All non-anchor ramps are locked.'
                            : `Will rotate ${unlockedCount} ramp${unlockedCount === 1 ? '' : 's'} — ${harmonizeMode.replace('-', ' ')}.`}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          {(() => {
            // Tooltips are short on purpose: native title attribute has no
            // line-wrap control across browsers, so we keep them to a couple
            // of sentences. Each combines what it is + when to use it for
            // pixel art + the mood/feel.
            const tips = {
              complementary: 'Opposite hues on the wheel. Maximum contrast and high energy. Use for focal points like enemy eyes against a background, or a hero against the environment. Can clash if both are fully saturated.',
              analogous: 'Adjacent hues within 30 degrees. Low contrast, calm, harmonious. Use for cohesive natural scenes: forests, oceans, sunsets, anything that should feel unified.',
              triadic: 'Three hues evenly spaced 120 degrees apart. Vivid and balanced. Use for playful character palettes: a hero plus two distinct accent pieces. Strong but more flexible than complementary.',
              splitComp: 'The base plus two hues flanking its complement (150 and 210 degrees). Same punch as complementary but softer. Use when complementary feels too harsh. Good for cozy indoor scenes.',
              tetradic: 'Four hues forming a rectangle on the wheel (two complementary pairs). Rich and complex. Use for scenes with multiple distinct elements like a market stall. Hard to balance; let one color dominate and others accent.',
              square: 'Four hues evenly spaced 90 degrees apart. Bold, graphic, retro-arcade. Maximum balanced contrast. All four will fight if equally weighted; treat one as dominant and the rest as accents.',
            };
            const PairCard = ({ title, tip, hexes, names, addLabel = '+ Add Both' }) => {
              const allAdded = hexes.every(h => baseColors.includes(h));
              return (
                <div className="flex flex-col items-center p-3 bg-black/30 rounded border border-pink-500/40">
                  <span title={tip} className="text-xs font-bold text-pink-200 mb-2 uppercase tracking-wider cursor-help border-b border-dashed border-pink-400/40">{title}</span>
                  <div className="flex gap-2 mb-2 flex-wrap justify-center">
                    {hexes.map((hex, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <HarmonySwatch hex={hex} name={names[idx]} />
                        <span className="text-[10px] font-mono text-cyan-200">{hex.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                  {hexes.length === 1 ? null : (
                    <button
                      onClick={() => hexes.length === 2
                        ? addHarmonyPair(hexes[0], hexes[1], names[0], names[1])
                        : addHarmonyMany(hexes.map((h, k) => ({ hex: h, name: names[k] })))}
                      disabled={allAdded}
                      title={hexes.length === 2 ? "Add both harmony colors as new bases" : "Add all harmony colors as new bases"}
                      className="text-[10px] px-2 py-1 rounded bg-pink-600 text-white border border-pink-300 hover:bg-pink-500 transition-all font-bold disabled:opacity-40 uppercase tracking-wider"
                    >
                      {addLabel}
                    </button>
                  )}
                </div>
              );
            };
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {/* Complementary: single color. No add button (use the swatch click). */}
                <div className="flex flex-col items-center p-3 bg-black/30 rounded border border-pink-500/40">
                  <span title={tips.complementary} className="text-xs font-bold text-pink-200 mb-2 uppercase tracking-wider cursor-help border-b border-dashed border-pink-400/40">Complementary</span>
                  <HarmonySwatch hex={harmony.complementary} name="complementary" />
                  <span className="text-[10px] font-mono text-cyan-200 mt-1">{harmony.complementary.toUpperCase()}</span>
                </div>
                <PairCard
                  title="Analogous"
                  tip={tips.analogous}
                  hexes={[harmony.analogous1, harmony.analogous2]}
                  names={['analogous 1', 'analogous 2']}
                />
                <PairCard
                  title="Triadic"
                  tip={tips.triadic}
                  hexes={[harmony.triadic1, harmony.triadic2]}
                  names={['triadic 1', 'triadic 2']}
                />
                <PairCard
                  title="Split-Comp"
                  tip={tips.splitComp}
                  hexes={[harmony.splitComp1, harmony.splitComp2]}
                  names={['split-comp 1', 'split-comp 2']}
                />
                <PairCard
                  title="Tetradic"
                  tip={tips.tetradic}
                  hexes={[harmony.tetradic1, harmony.tetradic2, harmony.tetradic3]}
                  names={['tetradic 1', 'tetradic 2', 'tetradic 3']}
                  addLabel="+ Add All"
                />
                <PairCard
                  title="Square"
                  tip={tips.square}
                  hexes={[harmony.square1, harmony.square2, harmony.square3]}
                  names={['square 1', 'square 2', 'square 3']}
                  addLabel="+ Add All"
                />
              </div>
            );
          })()}
          </div>}
        </div>

        {/* ---------- Visualize & Compare (collapsible) ---------- */}
        {(() => {
          const styleAccent = vizStyle === 'balanced' ? '#00ffff' : vizStyle === 'muted' ? '#a855f7' : '#ff00ff';
          const leftSnap = getSnapshotForSlot(sbsLeft, sbsLeftPayload);
          const rightSnap = getSnapshotForSlot(sbsRight, sbsRightPayload);
          const isTwoColumn = sbsRight !== null;
          const renderSlotViz = (snap, label, slotKey, compact) => {
            const slotValue = slotKey === 'left' ? sbsLeft : sbsRight;
            const loading = slotKey === 'left' ? sbsLeftLoading : sbsRightLoading;
            const error = slotKey === 'left' ? sbsLeftError : sbsRightError;
            if (loading) {
              return (
                <div className="text-center text-cyan-100/70 italic text-sm py-12 border-2 border-dashed border-cyan-700/40 rounded">
                  Loading {label}...
                </div>
              );
            }
            if (error) {
              return (
                <div className={`text-xs rounded p-3 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>
                  {error}
                </div>
              );
            }
            if (!snap || !Array.isArray(snap.baseColors) || snap.baseColors.length === 0) {
              return (
                <div className="text-center text-cyan-100/50 italic text-sm py-12 border-2 border-dashed border-cyan-700/40 rounded">
                  {slotValue === null ? 'Pick a palette above to compare' : 'No colors to show'}
                </div>
              );
            }
            const ramps = buildRampsForSnapshot(snap, vizStyle);
            // Cross-ramp dedupe for visualization: hardware-locked palettes
            // often produce the same hex in multiple ramp positions. Polar
            // plot and lightness strip get noisier without dedupe.
            const allColors = dedupeHexes(ramps.flat());
            const sortedByL = [...allColors].sort((a, b) => hexToHsl(a).l - hexToHsl(b).l);
            // Per-row mosaic dedupe: each ramp's non-consecutive duplicates
            // collapse, preserving the per-ramp grouping. The main editor UI
            // still shows all positions.
            const mosaicRamps = ramps.map(ramp => dedupeHexes(ramp));
            const namesSource = Array.isArray(snap.aiColorNames) ? snap.aiColorNames : aiColorNames;
            const plotSize = compact ? 200 : 280;
            const mosaicH = compact ? '28px' : '40px';
            const lightnessH = compact ? '22px' : '32px';
            return (
              <div className="flex flex-col gap-4">
                {compact && sbsRemapSource && (() => {
                  const slotRemap = slotKey === 'left' ? sbsLeftRemap : sbsRightRemap;
                  const slotRemapLoading = slotKey === 'left' ? sbsLeftRemapLoading : sbsRightRemapLoading;
                  const canvasRef = slotKey === 'left' ? sbsLeftRemapCanvasRef : sbsRightRemapCanvasRef;
                  const slotPayload = slotKey === 'left' ? sbsLeftPayload : sbsRightPayload;
                  const slotLetter = slotKey === 'left' ? 'A' : 'B';
                  return (
                    <div>
                      <h4 className="text-[11px] font-bold text-cyan-200 uppercase tracking-widest mb-1">Image Preview</h4>
                      <div className="flex justify-center bg-black/30 rounded border" style={{ borderColor: t.vizDataBorder, minHeight: '64px' }}>
                        {slotRemapLoading && !slotRemap && (
                          <div className="text-[11px] text-cyan-100/70 italic py-6">Computing...</div>
                        )}
                        {slotRemap && (
                          <canvas
                            ref={canvasRef}
                            style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '256px', height: 'auto', display: 'block' }}
                            title={`Uploaded image remapped to this slot's palette (${slotRemap.width}x${slotRemap.height}, ${remapDither === 'floyd-steinberg' ? 'Floyd-Steinberg' : 'no dither'})`}
                          />
                        )}
                        {!slotRemap && !slotRemapLoading && (
                          <div className="text-[11px] text-cyan-100/40 italic py-6">No preview</div>
                        )}
                      </div>
                      <div className="text-[10px] text-cyan-100/60 italic text-center mt-1 font-mono truncate" title={`Slot ${slotLetter}: ${getSlotLabel(slotValue, slotPayload)}`}>
                        Slot {slotLetter}: {getSlotLabel(slotValue, slotPayload)}
                      </div>
                    </div>
                  );
                })()}
                <div>
                  <h4 className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold text-cyan-200 uppercase tracking-widest mb-1`}>
                    {compact ? 'Chromatic Plot' : '▸ Chromatic Plot'}
                  </h4>
                  {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">Each color positioned by hue (angle) and saturation (distance from center). Tight clusters = cohesive palette.</p>}
                  <div className="flex justify-center">
                    <svg width={plotSize} height={plotSize} viewBox="0 0 280 280">
                      <circle cx="140" cy="140" r="125" fill="none" stroke={t.vizRingStroke} strokeWidth="1" />
                      <circle cx="140" cy="140" r="83" fill="none" stroke={t.vizRingStroke} strokeWidth="1" />
                      <circle cx="140" cy="140" r="42" fill="none" stroke={t.vizRingStroke} strokeWidth="1" />
                      {[0, 60, 120, 180, 240, 300].map(deg => {
                        const rad = (deg - 90) * Math.PI / 180;
                        const x2 = 140 + Math.cos(rad) * 125;
                        const y2 = 140 + Math.sin(rad) * 125;
                        return <line key={deg} x1="140" y1="140" x2={x2} y2={y2} stroke={t.vizSpokeStroke} strokeWidth="1" />;
                      })}
                      {allColors.map((hex, i) => {
                        const { h, s, l } = hexToHsl(hex);
                        const rad = (h - 90) * Math.PI / 180;
                        const dist = (s / 100) * 125;
                        const cx = 140 + Math.cos(rad) * dist;
                        const cy = 140 + Math.sin(rad) * dist;
                        const strokeColor = l > 50 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
                        return <circle key={i} cx={cx} cy={cy} r="6" fill={hex} stroke={strokeColor} strokeWidth="1.5">
                          <title>{hex.toUpperCase()} H={h.toFixed(0)}{compact ? '' : '°'} S={s.toFixed(0)}{compact ? '' : '%'} L={l.toFixed(0)}{compact ? '' : '%'}</title>
                        </circle>;
                      })}
                      {!compact && (
                        <>
                          <text x="140" y="14" textAnchor="middle" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">0°</text>
                          <text x="271" y="144" textAnchor="end" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">90°</text>
                          <text x="140" y="274" textAnchor="middle" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">180°</text>
                          <text x="9" y="144" textAnchor="start" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">270°</text>
                        </>
                      )}
                    </svg>
                  </div>
                </div>
                <div>
                  <h4 className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold text-cyan-200 uppercase tracking-widest mb-1`}>
                    {compact ? 'Lightness Distribution' : '▸ Lightness Distribution'}
                  </h4>
                  {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">All colors sorted darkest to lightest. Gaps indicate missing tonal ranges.</p>}
                  <div className="flex w-full rounded overflow-hidden border" style={{ height: lightnessH, borderColor: t.vizDataBorder }}>
                    {sortedByL.map((hex, i) => (
                      <div key={i} className="flex-1" style={{ background: hex }} title={`${hex.toUpperCase()} L=${hexToHsl(hex).l.toFixed(0)}`} />
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className={`${compact ? 'text-[11px]' : 'text-sm'} font-bold text-cyan-200 uppercase tracking-widest mb-1`}>
                    {compact ? 'Mosaic' : '▸ Mosaic'}
                  </h4>
                  {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">All ramps side-by-side. Look for adjacent colors that clash or harmonize.</p>}
                  <div className="flex flex-col gap-1">
                    {mosaicRamps.map((ramp, i) => (
                      <div key={i} className="flex w-full rounded overflow-hidden border" style={{ height: mosaicH, borderColor: t.vizDataBorder }}>
                        {ramp.map((hex, j) => (
                          <div key={`${i}-${j}`} className="flex-1" style={{ background: hex }} title={`${(namesSource && namesSource[i]) || `Color ${i + 1}`} ${hex.toUpperCase()}`} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {compact && <div className="text-[10px] text-cyan-100/50 text-center font-mono">{ramps.length} ramps, {allColors.length} unique colors</div>}
              </div>
            );
          };
          const slotClassicOptions = CLASSIC_PALETTES.map(c => ({ value: `classic:${c.id}`, label: c.name }));
          const slotSavedOptions = savedPalettes.map(p => ({ value: p.slug, label: p.name }));
          const parseSlot = (raw) => (raw === '' ? null : raw);
          const renderSlotAOptions = () => (
            <>
              <option value="working">Current working palette (live)</option>
              {slotClassicOptions.length > 0 && (
                <optgroup label="Classic palettes">
                  {slotClassicOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              )}
              {slotSavedOptions.length > 0 && (
                <optgroup label="Saved palettes">
                  {slotSavedOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              )}
            </>
          );
          const renderSlotBOptions = () => (
            <>
              <option value="">(empty)</option>
              <option value="working">Current working palette (live)</option>
              {slotClassicOptions.length > 0 && (
                <optgroup label="Classic palettes">
                  {slotClassicOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              )}
              {slotSavedOptions.length > 0 && (
                <optgroup label="Saved palettes">
                  {slotSavedOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              )}
            </>
          );
          return (
            <div className="rounded-lg mb-6 border-2 backdrop-blur-sm overflow-hidden" style={{ background: t.cardBgViz, borderColor: themedAccentBorder(styleAccent), boxShadow: accentGlow(styleAccent, 0.4) }}>
              <button onClick={() => setSbsOpen(o => !o)} title={sbsOpen ? "Collapse the Visualize & Compare section" : "Expand the Visualize & Compare section"} className={`w-full p-4 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
                <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest" style={{ color: sectionHeadColor(styleAccent), textShadow: accentTextGlow(styleAccent) }}><BarChart3 size={22} />Visualize & Compare</h2>
                <span className="text-cyan-200">{sbsOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</span>
              </button>
              {sbsOpen && (
                <div className="p-6 pt-2 flex flex-col gap-6">
                  <div className="flex gap-2 items-center flex-wrap justify-center bg-black/30 rounded border-2 border-cyan-500/40 px-3 py-2">
                    <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Style:</span>
                    <button onClick={() => setVizStyle('punchy')} title="Show high-contrast Punchy ramps in the visualization" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${vizStyle === 'punchy' ? 'bg-pink-300 text-purple-900 border-pink-100' : 'bg-purple-900/60 text-pink-200 border-pink-700/50 hover:bg-purple-800/60'}`} style={vizStyle === 'punchy' ? { boxShadow: '0 0 10px #ff00ff' } : {}}>Punchy</button>
                    <button onClick={() => setVizStyle('balanced')} title="Show mid-contrast Balanced ramps in the visualization" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${vizStyle === 'balanced' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={vizStyle === 'balanced' ? { boxShadow: '0 0 10px #00ffff' } : {}}>Balanced</button>
                    <button onClick={() => setVizStyle('muted')} title="Show low-contrast Muted ramps in the visualization" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${vizStyle === 'muted' ? 'bg-purple-300 text-purple-900 border-purple-100' : 'bg-purple-900/60 text-purple-200 border-purple-700/50 hover:bg-purple-800/60'}`} style={vizStyle === 'muted' ? { boxShadow: '0 0 10px #a855f7' } : {}}>Muted</button>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-cyan-200 uppercase tracking-widest mb-2">▸ Image Preview</h3>
                    <p className="text-[11px] text-cyan-100/70 italic mb-2">Upload an image. Every pixel snaps to the nearest color in the active palette (current style, hidden shades excluded, hardware lock honored). Auto-updates as you edit; 300ms debounce.</p>
                    {!remapImageDataUrl && (
                      <div
                        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setRemapDragOver(true); }}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!remapDragOver) setRemapDragOver(true); }}
                        onDragLeave={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const related = e.relatedTarget;
                          if (!related || !e.currentTarget.contains(related)) {
                            setRemapDragOver(false);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          setRemapDragOver(false);
                          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                          if (f) handleRemapImageUpload(f);
                        }}
                        className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded p-6 transition-colors ${remapDragOver ? 'border-cyan-300 bg-cyan-900/40' : 'border-cyan-500/50 bg-black/30'}`}
                        style={remapDragOver ? { boxShadow: '0 0 12px rgba(0, 255, 255, 0.5)' } : {}}
                      >
                        <ImageIcon size={28} className={remapDragOver ? 'text-cyan-200' : 'text-cyan-300/60'} />
                        <p className="text-xs text-cyan-100/70 text-center">{remapDragOver ? 'Release to upload' : 'Drop an image here, or browse for a file, to remap against the palette.'}</p>
                        <label className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all flex items-center gap-1 uppercase tracking-wider text-xs cursor-pointer" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.4)' }}>
                          <Upload size={14} />Browse files
                          <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) handleRemapImageUpload(f); e.target.value = ''; }} className="hidden" />
                        </label>
                        {remapError && (
                          <p className="text-xs text-red-300 mt-1">{remapError}</p>
                        )}
                      </div>
                    )}
                    {remapImageDataUrl && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                          <span className="text-cyan-100/80 truncate" title={remapImageName}>
                            Source: <span className="text-cyan-200 font-bold">{remapImageName || 'image'}</span>
                            {remapImageNaturalSize && (
                              <span className="text-cyan-100/50 ml-2">{remapImageNaturalSize.w}x{remapImageNaturalSize.h}</span>
                            )}
                          </span>
                          <button onClick={clearRemapImage} title="Remove the uploaded image" className={`px-2 py-1 rounded font-bold border-2 transition-all flex items-center gap-1 uppercase tracking-wider text-[11px] ${t.controlBtnDefault} ${t.controlBtnHover}`}>
                            <X size={12} />Clear
                          </button>
                        </div>
                        {remapLoading && (
                          <div className={`px-2 py-1 rounded border-2 text-[11px] font-bold uppercase tracking-wider ${t.alertInfoBg} ${t.alertInfoText} ${t.alertInfoBorder}`}>
                            Computing...
                          </div>
                        )}
                        {remapError && (
                          <p className="text-xs text-red-300">{remapError}</p>
                        )}
                        {!isTwoColumn && (
                          <div className="flex justify-center bg-black/30 rounded border-2 border-cyan-700/40 p-2">
                            {!remapOutput && (
                              <div className="flex flex-col items-center gap-2 py-4">
                                <img src={remapImageDataUrl} alt="source" style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '320px', height: 'auto' }} />
                                <p className="text-[11px] text-cyan-100/60 italic">Remapping...</p>
                              </div>
                            )}
                            {remapOutput && (
                              <canvas ref={remapCanvasRef} style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }} />
                            )}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 bg-black/30 rounded border-2 border-cyan-700/40 px-3 py-2">
                          <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">Dither:</span>
                          <button onClick={() => setRemapDither('none')} title="No dithering: every source pixel maps to its single nearest palette color" className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${remapDither === 'none' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}>None</button>
                          <button onClick={() => setRemapDither('floyd-steinberg')} title="Floyd-Steinberg error diffusion: better gradient handling at the cost of a busier image" className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${remapDither === 'floyd-steinberg' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}>Floyd-Steinberg</button>
                        </div>
                        {!isTwoColumn && remapOutput && remapImageNaturalSize && (() => {
                          const scaleOpts = computeRemapScaleOptions(remapImageNaturalSize.w, remapImageNaturalSize.h, 8192);
                          if (scaleOpts.length === 0) {
                            return (
                              <div className="flex items-center gap-2 bg-black/30 rounded border-2 border-cyan-700/40 px-3 py-2 text-[11px] text-yellow-200">
                                ▲ Source image exceeds 8192px on at least one axis. Resize the upload to enable export.
                              </div>
                            );
                          }
                          const fmtScale = (s) => (Number.isInteger(s) ? s + 'x' : s + 'x');
                          const projectedCost = estimateRemapCost(
                            Math.max(1, Math.floor(remapImageNaturalSize.w * remapDownloadScale)),
                            Math.max(1, Math.floor(remapImageNaturalSize.h * remapDownloadScale)),
                            getActiveRemapPalette().length,
                            remapDither
                          );
                          const willWarn = projectedCost > 50000000;
                          return (
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-wrap items-center gap-2 justify-between bg-black/30 rounded border-2 border-cyan-700/40 px-3 py-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">Export scale:</span>
                                  <select
                                    value={remapDownloadScale}
                                    onChange={(e) => {
                                      const v = parseFloat(e.target.value);
                                      setRemapDownloadScale(Number.isFinite(v) && v > 0 ? v : 1);
                                      setRemapDownloadConfirmPending(false);
                                      if (remapDownloadConfirmTimerRef.current) { clearTimeout(remapDownloadConfirmTimerRef.current); remapDownloadConfirmTimerRef.current = null; }
                                    }}
                                    title="Multiplier applied to the upload's natural size at export. Nearest-neighbor sampling preserves pixel-art aesthetics."
                                    className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider cursor-pointer ${t.controlBtnDefault} ${t.controlBtnHover}`}
                                  >
                                    {scaleOpts.map((s) => {
                                      const w = Math.max(1, Math.floor(remapImageNaturalSize.w * s));
                                      const h = Math.max(1, Math.floor(remapImageNaturalSize.h * s));
                                      return <option key={s} value={s}>{fmtScale(s)} ({w}x{h})</option>;
                                    })}
                                  </select>
                                </div>
                                <button
                                  onClick={downloadRemap}
                                  disabled={remapLoading}
                                  title={remapDownloadConfirmPending ? "Click again within 5 seconds to commit this slow export" : (willWarn ? "Heavy export: clicking will prompt for confirmation first" : "Download the remapped image as PNG at the selected scale")}
                                  className={`px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 uppercase tracking-wider text-[11px] ${
                                    remapLoading
                                      ? 'bg-purple-900/60 text-cyan-200/50 border-cyan-700/30 cursor-not-allowed'
                                      : remapDownloadConfirmPending
                                        ? 'bg-yellow-300 text-purple-900 border-yellow-100 hover:bg-yellow-200'
                                        : 'bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300'
                                  }`}
                                  style={!remapLoading ? { boxShadow: remapDownloadConfirmPending ? '0 0 8px rgba(255, 230, 0, 0.5)' : '0 0 8px rgba(0, 255, 255, 0.4)' } : {}}
                                >
                                  <Download size={12} />
                                  {remapDownloadConfirmPending ? 'Click to confirm' : 'Download PNG'}
                                </button>
                              </div>
                              {remapDownloadConfirmPending && (
                                <div className={`px-2 py-1 rounded border-2 text-[11px] font-bold uppercase tracking-wider ${t.alertWarnBg} ${t.alertWarnText} ${t.alertWarnBorder}`}>
                                  ▲ This export will take a while (an estimated {(projectedCost / 1000000).toFixed(0)}M pixel operations). The browser tab may freeze during the work. Click Download again within 5 seconds to proceed, or change the scale or dither setting.
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                      <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Slot A</span>
                      <select
                        value={sbsLeft === null ? 'working' : sbsLeft}
                        onChange={(e) => setSbsLeft(e.target.value)}
                        title="Pick the palette to visualize (or compare in the left column)"
                        className="w-full px-2 py-1.5 rounded bg-black/60 text-cyan-100 border-2 border-cyan-400 focus:outline-none text-sm font-mono"
                      >
                        {renderSlotAOptions()}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Slot B</span>
                        {sbsRight && (
                          <button onClick={() => setSbsRight(null)} title="Clear slot B to return to single-column view" className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-500 text-white border border-pink-200 hover:bg-pink-400 uppercase tracking-wider">Clear</button>
                        )}
                      </div>
                      <select
                        value={sbsRight === null ? '' : sbsRight}
                        onChange={(e) => setSbsRight(parseSlot(e.target.value))}
                        title="Pick a second palette to compare side-by-side (empty = single-column view)"
                        className="w-full px-2 py-1.5 rounded bg-black/60 text-cyan-100 border-2 border-cyan-400 focus:outline-none text-sm font-mono"
                      >
                        {renderSlotBOptions()}
                      </select>
                    </div>
                  </div>
                  {isTwoColumn ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-3 bg-black/30 rounded border-2 border-cyan-500/40 p-3">
                        <div className="text-[10px] text-cyan-100/60 font-mono truncate" title={getSlotLabel(sbsLeft, sbsLeftPayload)}>{getSlotLabel(sbsLeft, sbsLeftPayload)}</div>
                        {renderSlotViz(leftSnap, 'Slot A', 'left', true)}
                      </div>
                      <div className="flex flex-col gap-3 bg-black/30 rounded border-2 border-cyan-500/40 p-3">
                        <div className="text-[10px] text-cyan-100/60 font-mono truncate" title={getSlotLabel(sbsRight, sbsRightPayload)}>{getSlotLabel(sbsRight, sbsRightPayload)}</div>
                        {renderSlotViz(rightSnap, 'Slot B', 'right', true)}
                      </div>
                    </div>
                  ) : (
                    <div>
                      {renderSlotViz(leftSnap, 'Slot A', 'left', false)}
                    </div>
                  )}
                  <p className="text-[10px] text-cyan-100/40 italic text-center">Style applies to all views. Hidden shades are filtered out.</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ---------- Saved Palettes (collapsible) ---------- */}
        <div className="rounded-lg mb-6 border-2 backdrop-blur-sm overflow-hidden" style={{ background: t.cardBgYellow, borderColor: themedAccentBorder('#ffff00'), boxShadow: accentGlow('#ffff00', 0.25) }}>
          <button onClick={() => setSavedOpen(o => !o)} title={savedOpen ? "Collapse the Saved Palettes section" : "Expand the Saved Palettes section"} className={`w-full p-4 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
            <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest" style={{ color: sectionHeadColor('#ffff00'), textShadow: accentTextGlow('#ffff00') }}><FolderOpen size={22} />Saved Palettes <span className="text-xs normal-case tracking-normal" style={{ color: theme === 'dark' ? 'rgba(254, 240, 138, 0.7)' : theme === 'neutral' ? '#2a1a00' : '#713f12' }}>({savedPalettes.length})</span></h2>
            <span className="text-cyan-200">{savedOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</span>
          </button>
          {savedOpen && (
            <div className="p-6 pt-2 flex flex-col gap-4">
              <p className="text-[11px] text-yellow-100/70 italic">▸ Palettes save locally to your browser. They persist across sessions but stay on this device.</p>

              {/* Save current palette */}
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-black/30 rounded border-2 border-yellow-500/40 p-3">
                <input ref={saveNameInputRef} type="text" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this palette..." title="Type a name for the current palette and press Enter or click Save" className="flex-1 px-3 py-2 rounded bg-black/60 text-yellow-100 border-2 border-yellow-400 focus:outline-none text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && !savedBusy) saveCurrentPalette(); }} disabled={savedBusy} />
                <button onClick={saveCurrentPalette} disabled={savedBusy || !saveName.trim()} title="Save the current palette to your browser's local storage" className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-50 disabled:hover:scale-100 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 10px #ffff00' }}>
                  <Save size={16} />{savedBusy ? 'Saving...' : 'Save Current'}
                </button>
              </div>

              {savedError && <div className={`text-xs rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{savedError}</div>}

              {/* Filter input: only visible when there's at least one saved
                  palette to filter. Case-insensitive substring match on the
                  palette name. Not persisted. */}
              {savedPalettes.length > 0 && (() => {
                const trimmed = savedFilter.trim();
                return (
                  <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                    <input type="text" value={savedFilter} onChange={(e) => setSavedFilter(e.target.value)} placeholder="Filter by name..." title="Type to filter the list below by palette name. Case-insensitive. Cleared on page reload." className="flex-1 px-3 py-2 rounded bg-black/60 text-yellow-100 border-2 border-yellow-700/60 focus:border-yellow-400 focus:outline-none text-sm" />
                    {trimmed && (
                      <button onClick={() => setSavedFilter('')} title="Clear the filter and show all saved palettes" className="px-3 py-2 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-purple-800/60">
                        Clear
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* List of saved palettes */}
              {savedPalettes.length === 0 ? (
                <div className="text-center text-yellow-100/60 italic text-sm py-6 border-2 border-dashed border-yellow-700/40 rounded">No saved palettes yet. Save your current palette above to get started.</div>
              ) : (() => {
                const needle = savedFilter.trim().toLowerCase();
                const visible = needle ? savedPalettes.filter(p => (p.name || '').toLowerCase().includes(needle)) : savedPalettes;
                if (visible.length === 0) {
                  return <div className="text-center text-yellow-100/60 italic text-sm py-6 border-2 border-dashed border-yellow-700/40 rounded">No saved palettes match "{savedFilter.trim()}". {savedPalettes.length} hidden.</div>;
                }
                return (
                <div className="grid gap-2">
                  {visible.map(p => {
                    const isConfirming = confirmDeleteSlug === p.slug;
                    const isRenaming = renamingSlug === p.slug;
                    const dateStr = p.savedAt ? new Date(p.savedAt).toLocaleString() : '';
                    return (
                      <div key={p.slug} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-black/40 rounded border-2 border-yellow-700/40 p-2 hover:border-yellow-500/60 transition-colors">
                        {/* Thumbnail: mosaic of base colors */}
                        <div className="flex h-10 sm:h-12 rounded overflow-hidden border flex-shrink-0 sm:w-32" style={{ minWidth: '8rem', borderColor: t.vizDataBorder }}>
                          {p.baseColors.map((hex, i) => (
                            <div key={i} className="flex-1" style={{ background: hex }} title={hex.toUpperCase()} />
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <>
                              <input
                                type="text"
                                value={renameDraft}
                                onChange={e => setRenameDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') { e.preventDefault(); commitRename(p.slug); }
                                  else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                                }}
                                autoFocus
                                disabled={savedBusy}
                                maxLength={120}
                                title="Type a new name. Enter to save, Escape to cancel."
                                className="w-full px-2 py-1 rounded bg-purple-950/80 text-yellow-50 border-2 border-cyan-500/70 text-sm font-bold focus:outline-none focus:border-cyan-300 disabled:opacity-50"
                              />
                              {renameError ? (
                                <div className="text-pink-300 text-[10px] mt-1">{renameError}</div>
                              ) : (
                                <div className="text-yellow-100/50 text-[10px] mt-1">{p.baseColors.length} color{p.baseColors.length === 1 ? '' : 's'}{dateStr ? ` • ${dateStr}` : ''}</div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="text-yellow-100 font-bold text-sm truncate">{p.name}</div>
                              <div className="text-yellow-100/50 text-[10px]">{p.baseColors.length} color{p.baseColors.length === 1 ? '' : 's'}{dateStr ? ` • ${dateStr}` : ''}</div>
                            </>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {isRenaming ? (
                            <>
                              <button onClick={() => commitRename(p.slug)} disabled={savedBusy} title="Save the new name (Enter)" className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.4)' }}>
                                <Check size={14} />Save
                              </button>
                              <button onClick={cancelRename} disabled={savedBusy} title="Cancel rename (Escape)" className="px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs bg-purple-700/60 text-cyan-100 border-cyan-700/50 hover:bg-purple-700/80">
                                <X size={14} />Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => loadPalette(p.slug)} disabled={savedBusy} title={`Load "${p.name}" and replace the current palette`} className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.4)' }}>
                                <FolderOpen size={14} />Load
                              </button>
                              <button onClick={() => startRename(p.slug, p.name)} disabled={savedBusy} title={`Rename "${p.name}"`} className="px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs bg-yellow-600/70 text-yellow-50 border-yellow-300/60 hover:bg-yellow-500/70">
                                <Edit2 size={14} />Rename
                              </button>
                              <button onClick={() => requestDeletePalette(p.slug)} disabled={savedBusy} title={isConfirming ? 'Click again to confirm deletion' : `Delete "${p.name}" from saved palettes`} className={`px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs ${isConfirming ? 'bg-red-300 text-red-900 border-red-100 animate-pulse' : 'bg-pink-500 text-white border-pink-200 hover:bg-pink-400'}`}>
                                <Trash2 size={14} />{isConfirming ? 'Confirm?' : 'Delete'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })()}

              {/* Classic palette loader */}
              {(() => {
                const selectedClassic = CLASSIC_PALETTES.find(c => c.id === classicLoaderId) || CLASSIC_PALETTES[0];
                if (!selectedClassic) return null;
                return (
                  <div className="bg-black/30 rounded border-2 border-green-700/40 p-3 flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-green-100/80 font-bold uppercase tracking-wider whitespace-nowrap">Load classic:</span>
                      <select
                        value={classicLoaderId}
                        onChange={(e) => setClassicLoaderId(e.target.value)}
                        title="Pick a classic palette to preview below. Click Load to replace the current palette with the chosen classic's base colors."
                        className="flex-1 min-w-[180px] px-2 py-1.5 rounded bg-black/60 text-green-100 border-2 border-green-700/60 focus:border-green-400 focus:outline-none text-sm font-mono"
                      >
                        {CLASSIC_PALETTES.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => loadClassicPalette(selectedClassic)}
                        title={`Replace the current palette with ${selectedClassic.name}'s base colors. Destructive: wipes pins, hidden shades, ramp locks, side-by-side slots, harmony anchor, and per-ramp customizations.`}
                        className="px-3 py-1.5 rounded font-bold bg-green-400 text-purple-900 border-2 border-green-100 hover:bg-green-300 transition-all flex items-center gap-1 uppercase tracking-wider text-xs whitespace-nowrap"
                        style={{ boxShadow: '0 0 8px rgba(0, 255, 153, 0.4)' }}
                      >
                        <FolderOpen size={14} />Load
                      </button>
                    </div>
                    {/* Preview row: swatch mosaic + tip text. Updates
                        live as the dropdown selection changes so the
                        user sees what they're about to load before
                        committing. */}
                    <div className="flex items-center gap-2 bg-black/20 rounded border border-green-700/30 p-2">
                      <div className="flex h-8 rounded overflow-hidden border flex-shrink-0 w-24" style={{ borderColor: t.vizDataBorder }}>
                        {selectedClassic.baseColors.map((hex, i) => (
                          <div key={i} className="flex-1" style={{ background: hex }} title={hex.toUpperCase()} />
                        ))}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-green-100/60 text-[10px] mb-0.5">{selectedClassic.baseColors.length} base color{selectedClassic.baseColors.length === 1 ? '' : 's'}</div>
                        <div className="text-green-100/80 text-[11px] italic">{selectedClassic.tip}</div>
                      </div>
                    </div>
                    {/* "Inspired by" disclaimer. The classic palettes shipped
                        with this app are a curated subset of the originals'
                        base colors, not the full canonical sets. Loading one
                        gives you a starting point that the ramp generator
                        will then extend into full ramps. Worth being honest
                        about so users searching for the exact canonical
                        palette know they should look elsewhere. */}
                    <p className="text-[10px] text-green-100/60 italic">▸ Inspired by the original palette. The ramp generator builds from this base; not the canonical full palette.</p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* History panel. Lists every undoable action, newest first, with
            the current state highlighted. Click any entry to jump back
            (or forward) to that point. Session-only: a page reload starts
            fresh. Cap is HISTORY_DEPTH_CAP entries; oldest drops first.
            Keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Y) move sequentially
            through the same list regardless of whether the panel is open.
            Collapsed by default per user preference (matches Photoshop's
            History panel which sits in a sidebar drawer). */}
        <div className="rounded-lg mb-6 border-2 backdrop-blur-sm overflow-hidden" style={{ background: t.cardBgViz, borderColor: themedAccentBorder('#a855f7'), boxShadow: accentGlow('#a855f7', 0.25) }}>
          <button onClick={() => setHistoryOpen(o => !o)} title={historyOpen ? "Collapse the History panel" : "Expand the History panel (undo/redo)"} className={`w-full p-4 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
            <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest" style={{ color: sectionHeadColor('#a855f7'), textShadow: accentTextGlow('#a855f7') }}>
              <History size={22} />History
              <span className="text-xs font-normal opacity-70 normal-case tracking-normal">
                ({historyIndex + 1} of {historyEntries.length})
              </span>
            </h2>
            <span className="text-purple-200">{historyOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</span>
          </button>
          {historyOpen && (
            <div className="p-4 pt-0">
              <p className="text-[11px] text-purple-100/70 italic mb-3">
                ▸ Click any entry to jump there. Cmd/Ctrl+Z and Cmd/Ctrl+Y also work. Session-only: closing the tab clears history.
              </p>
              <div className="max-h-80 overflow-y-auto rounded border-2 border-purple-500/30 bg-black/20">
                {/* List rendered NEWEST FIRST (reverse-order traversal).
                    This matches Photoshop, which puts the most recent
                    action at the top. The current state's entry is
                    visually highlighted; entries above it in the list
                    (i.e. newer than the current cursor) are the "redo"
                    stack and are grayed out. Entries below the current
                    cursor are the "undo" stack and read at full strength. */}
                {historyEntries.slice().reverse().map((entry, revIdx) => {
                  const idx = historyEntries.length - 1 - revIdx;
                  const isCurrent = idx === historyIndex;
                  const isFuture = idx > historyIndex;  // redo-stack entry
                  return (
                    <button
                      key={`${idx}-${entry.timestamp}`}
                      onClick={() => jumpToHistoryIndex(idx)}
                      disabled={isCurrent}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 border-b border-purple-500/20 last:border-b-0 transition-colors ${
                        isCurrent
                          ? 'bg-purple-500/30 cursor-default'
                          : isFuture
                          ? 'opacity-50 hover:bg-purple-500/10'
                          : 'hover:bg-purple-500/10'
                      }`}
                      title={isCurrent ? 'Current state' : (isFuture ? 'Redo to this state' : 'Undo to this state')}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-yellow-300' : isFuture ? 'bg-purple-400/40' : 'bg-cyan-400/60'}`} />
                        <span className={`text-xs font-bold uppercase tracking-wider truncate ${isCurrent ? 'text-yellow-100' : 'text-purple-100'}`}>
                          {entry.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-purple-200/60 italic flex-shrink-0">
                        {formatHistoryAge(entry.timestamp)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3 text-[10px] text-purple-100/60 italic">
                <span>{canUndo ? 'Cmd/Ctrl+Z to undo' : 'Nothing to undo'}</span>
                <span>{canRedo ? 'Cmd/Ctrl+Y to redo' : 'Nothing to redo'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Export & Tools — collapsible card matching section card pattern */}
        <div className={`rounded-lg mb-3 border-2 backdrop-blur-sm overflow-hidden${activeTourTarget === 'export-panel' ? ' tour-highlight' : ''}`} data-tour-id="export-panel" style={{ background: t.cardBgViz, borderColor: themedAccentBorder('#00ffff'), boxShadow: accentGlow('#00ffff', 0.3) }}>
          <button onClick={() => setExportOpen(o => !o)} title={exportOpen ? 'Collapse Export & Tools' : 'Expand Export & Tools'} className={`w-full p-4 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
            <h2 className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest" style={{ color: sectionHeadColor('#00ffff'), textShadow: accentTextGlow('#00ffff') }}><Download size={22} />Export &amp; Tools</h2>
            <span style={{ color: sectionHeadColor('#00ffff') }}>{exportOpen ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</span>
          </button>
          {exportOpen && (
            <div className="px-6 pb-6 space-y-4">
              {/* Download / Copy / WCAG / Hardware Lock */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-3 flex-wrap items-center">
                  <button onClick={exportPalette} title="Download the active palette as a Pixel Art .txt file" className="px-4 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Download .txt</button>
                  <button onClick={copyPaletteToClipboard} title="Copy the active palette to the clipboard as plain text" className="px-4 py-1.5 rounded font-bold bg-pink-400 text-purple-900 border-2 border-pink-100 hover:bg-pink-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #ff00ff' }}><Copy size={14} />Copy</button>
                  <button
                    onClick={toggleCompareMode}
                    title={compareMode ? 'Exit WCAG Check' : 'Enter WCAG Check: click any two ramp swatches to see their WCAG contrast ratio'}
                    className={`px-4 py-1.5 rounded font-bold border-2 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs ${compareMode ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-200 border-yellow-500/50 hover:bg-purple-800/60'}`}
                    style={compareMode ? { boxShadow: '0 0 12px #ffff00' } : {}}
                  >
                    <Contrast size={14} />{compareMode ? 'Checking (click to exit)' : 'WCAG Check'}
                  </button>
                  {!hardwareLock && (
                    <button
                      onClick={() => setHwPickerOpen(o => !o)}
                      title={hwPickerOpen ? 'Close hardware palette picker' : 'Snap all shades to a hardware color palette'}
                      className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-2 ${hwPickerOpen ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-yellow-700/40'}`}
                      style={hwPickerOpen ? { boxShadow: '0 0 12px rgba(255, 255, 0, 0.6)' } : {}}
                    >
                      <Cpu size={14} />Hardware Lock
                    </button>
                  )}
                  {exportFeedback && <span className="px-3 py-1 rounded bg-cyan-500 text-purple-900 text-xs font-bold border-2 border-cyan-200 uppercase tracking-wider">{exportFeedback}</span>}
                </div>

                {hardwareLock && (
                  <div
                    className="rounded-lg border-2 p-3 flex flex-col gap-2"
                    style={{ background: t.cardBgViz, borderColor: themedAccentBorder('#ffff00'), boxShadow: accentGlow('#ffff00', 0.3) }}
                  >
                    <div className="flex items-center gap-2">
                      <Cpu size={14} style={{ color: sectionHeadColor('#ffff00') }} />
                      <span className="text-xs font-bold uppercase tracking-widest" style={{ color: sectionHeadColor('#ffff00'), textShadow: accentTextGlow('#ffff00') }}>
                        Hardware Lock
                      </span>
                    </div>
                    <div className="flex gap-3 flex-wrap items-center">
                      <span className="text-xs font-bold text-yellow-200 uppercase tracking-wider">Locked:</span>
                      <span className="px-3 py-1.5 rounded font-bold border-2 text-xs uppercase tracking-wider bg-yellow-300 text-purple-900 border-yellow-100" style={{ boxShadow: '0 0 12px rgba(255, 255, 0, 0.6)' }}>
                        {HARDWARE_PALETTES.find(hw => hw.id === hardwareLock)?.name}
                      </span>
                      <button onClick={bakeHardwareLock} title="Bake the current locked output into permanent pins." className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-cyan-500 text-purple-900 border-cyan-100 hover:bg-cyan-400" style={{ boxShadow: '0 0 10px rgba(0, 255, 255, 0.6)' }}>Bake into pins</button>
                      <button onClick={() => toggleHardwareLock(hardwareLock)} title="Unlock and return to free generation" className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-pink-500 text-white border-pink-200 hover:bg-pink-400">Unlock</button>
                    </div>
                  </div>
                )}

                {!hardwareLock && hwPickerOpen && (
                  <div className="flex gap-2 flex-wrap">
                    {HARDWARE_PALETTES.map(hw => (
                      <button
                        key={hw.id}
                        onClick={() => { toggleHardwareLock(hw.id); setHwPickerOpen(false); }}
                        title={`${hw.description}. While locked, all generated shades snap to ${hw.name}.`}
                        className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider hover:scale-105 bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-yellow-700/40"
                      >
                        {hw.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-white/10" />
              {/* GPL row */}
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-xs font-bold text-yellow-200 uppercase tracking-wider">.gpl style:</span>
                <button onClick={() => setGplStyle('punchy')} title="Export the .gpl using high-contrast Punchy ramps" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${gplStyle === 'punchy' ? 'bg-pink-300 text-purple-900 border-pink-100' : 'bg-purple-900/60 text-pink-200 border-pink-700/50 hover:bg-purple-800/60'}`} style={gplStyle === 'punchy' ? { boxShadow: '0 0 10px #ff00ff' } : {}}>Punchy</button>
                <button onClick={() => setGplStyle('balanced')} title="Export the .gpl using mid-contrast Balanced ramps" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${gplStyle === 'balanced' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={gplStyle === 'balanced' ? { boxShadow: '0 0 10px #00ffff' } : {}}>Balanced</button>
                <button onClick={() => setGplStyle('muted')} title="Export the .gpl using low-contrast Muted ramps" className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${gplStyle === 'muted' ? 'bg-purple-300 text-purple-900 border-purple-100' : 'bg-purple-900/60 text-purple-200 border-purple-700/50 hover:bg-purple-800/60'}`} style={gplStyle === 'muted' ? { boxShadow: '0 0 10px #a855f7' } : {}}>Muted</button>
                <button onClick={exportPaletteGpl} title="GIMP Palette format. Compatible with Piskel, Aseprite, GIMP, Krita, Inkscape, and other pixel art tools." className="px-4 py-1.5 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #ffff00' }}><Download size={14} />.gpl (Piskel/Aseprite/GIMP)</button>
                <button onClick={() => gplFileInputRef.current?.click()} title="Import a .gpl palette file from Piskel, Aseprite, GIMP, Krita, or any GIMP-compatible tool. Replaces the current palette." className="px-4 py-1.5 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #ffff00' }}><Upload size={14} />Import .gpl</button>
                <input ref={gplFileInputRef} type="file" accept=".gpl,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGplFile(f); e.target.value = ''; }} className="hidden" />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-lg overflow-hidden" style={{ background: t.tipPanelBg, border: `2px solid ${t.tipPanelBorder}` }}>
          <button onClick={() => setTipsOpen(o => !o)} title={tipsOpen ? 'Collapse Tips' : 'Expand Tips'} className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}>
            <span className={`text-xs font-bold uppercase tracking-widest ${t.tipPanelStrong}`}>Tips</span>
            <span className={t.tipPanelText}>{tipsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
          </button>
          {tipsOpen && <div className={`px-4 pb-4 text-xs ${t.tipPanelText}`}>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ TIP:</strong> Click any swatch to copy its hex code.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ DICE:</strong> Rolls a random color (Single Color) or a random description (AI Assist). Free, no API call. Click again to re-roll.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ SURPRISE ME:</strong> The AI invents a subject AND generates its palette in one shot. Uses one API call.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ IMPORT:</strong> Drop a Piskel C file to add custom preview sprites.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ COPY:</strong> Click the cyan icon on custom sprites to copy their source code.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ EDIT:</strong> Click the slider icon on any ramp to adjust its base color with HSV sliders or a color picker.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ PIN:</strong> Click the pushpin on any shade (except the base) to lock that shade to a custom hex. The base shade is always your chosen base color, so pinning it would do nothing. Pins are per-style: a pin on a Balanced swatch only affects the Balanced ramp. Click a pinned pin again to unpin.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HIDE SHADE:</strong> Right-click any swatch to hide that shade across all 3 styles for that base. Hidden shades are excluded from .gpl / .txt exports and the visualization. Use the Restore button on the ramp card to bring them back. The last visible shade in a ramp cannot be hidden.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ CONTRAST:</strong> Hover any ramp swatch to see WCAG AA contrast ratios against its neighbors. Click the WCAG Check button to enter pick-two mode: click an anchor, then any other ramp swatch to see the ratio, AA tier, and a live foreground/background preview.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HARMONIZE:</strong> Rotates every unlocked non-anchor ramp to a color-theory position (complement, analogous, triadic, etc.) relative to the anchor ramp. Anchor is the ramp set in the Derive From selector. Lock any ramp to hold its hue in place during the rotation.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ LOCK RAMP:</strong> Click the lock icon on any ramp card to freeze it. Generate, Shuffle, and Harmonize all skip locked ramps. Pins and hidden shades are unaffected. Useful for protecting a finished ramp while iterating on the rest of the palette.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ SIDE-BY-SIDE:</strong> Compare two palettes (the working palette or any saved palette) in mosaic, lightness bar, and chromatic plot views. Useful for comparing a candidate palette against an established one. Distinct from WCAG Check in the export bar, which checks two individual swatches for WCAG contrast.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HARMONY:</strong> With multiple ramps, use the "Derive From" selector at the top of the Harmony Colors section to choose which ramp drives the harmony palette.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ SAVE:</strong> Name and save palettes locally. They persist across browser sessions on this device. The Saved Palettes section also has a compact loader for the classic "inspired by" presets (DB16, PICO-8, Game Boy, etc).</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ LOCK:</strong> Click a hardware button (NES, Game Boy, CGA 16, EGA 64, C64) to enter a persistent lock mode. Every generated shade and harmony color snaps to the nearest hardware-legal hex. Click the active button again or "Unlock" to return to free generation. Non-destructive: your base colors and pins are preserved.</p>
          <p className="mb-1"><strong className={t.tipPanelStrong}>▸ HISTORY:</strong> The History section above the export bar lists your recent actions. Click any entry to jump to that state, or use Cmd/Ctrl+Z and Cmd/Ctrl+Y for sequential undo/redo. Last 20 actions are remembered per browser session; a page reload starts fresh.</p>
          <p><strong className={t.tipPanelStrong}>▸ .GPL:</strong> Standard GIMP palette format, importable into Piskel, Aseprite, GIMP, Krita, and most pixel art tools.</p>
          </div>}
        </div>
        </div>{/* end CVD filter wrapper */}

        {/* Update notification. Fixed bottom-right, outside CVD wrapper. */}
        {updateInfo && (
          <div className="fixed bottom-4 right-4 z-50 rounded-lg p-4 border-2 w-80" style={{ background: 'rgba(26,10,46,0.97)', borderColor: themedAccentBorder('#00ffff'), boxShadow: '0 0 24px rgba(0,255,255,0.4)' }}>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-1 flex items-center gap-2" style={{ color: sectionHeadColor('#00ffff'), textShadow: accentTextGlow('#00ffff') }}>
              Update Available
            </h3>
            <p className="text-xs text-cyan-100/80 mb-3">
              Version {updateInfo.version} is{updateInfo.isPortable ? ' available.' : ' ready.'}{' '}
              {updateInfo.isPortable
                ? 'Portable builds don’t auto-update — grab the new .exe from the Releases page.'
                : updateReady ? 'Downloaded and ready to install.' : updateDownloading ? 'Downloading...' : 'Download and install now?'}
            </p>
            <div className="flex gap-2 flex-wrap">
              {updateInfo.isPortable && (
                <button
                  onClick={() => { window.electronAPI?.openReleasesPage?.(); setUpdateInfo(null); }}
                  className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all"
                  style={{ boxShadow: '0 0 8px #00ffff' }}
                >
                  Open Releases
                </button>
              )}
              {!updateInfo.isPortable && !updateReady && !updateDownloading && (
                <button
                  onClick={() => { setUpdateDownloading(true); window.electronAPI?.downloadUpdate?.(); }}
                  className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all"
                  style={{ boxShadow: '0 0 8px #00ffff' }}
                >
                  Update Now
                </button>
              )}
              {!updateInfo.isPortable && updateReady && (
                <button
                  onClick={() => window.electronAPI?.installUpdate?.()}
                  className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all"
                  style={{ boxShadow: '0 0 8px #00ffff' }}
                >
                  Restart to Install
                </button>
              )}
              {(updateInfo.isPortable || (!updateReady && !updateDownloading)) && (
                <>
                  <button
                    onClick={() => setUpdateInfo(null)}
                    className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-purple-900/60 text-cyan-200 border-2 border-cyan-700/50 hover:bg-purple-800/60 transition-all"
                  >
                    Later
                  </button>
                  <button
                    onClick={() => { window.electronAPI?.skipUpdate?.(updateInfo.version); setUpdateInfo(null); }}
                    className="px-3 py-1.5 rounded font-bold text-xs uppercase tracking-wider bg-purple-900/60 text-pink-200 border-2 border-pink-700/50 hover:bg-purple-800/60 transition-all"
                  >
                    Skip This Version
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* WCAG Check floating panel. Sits OUTSIDE the CVD filter wrapper
            so its color swatches and ratio numbers stay legible regardless
            of which colorblind simulation is active. Fixed to the top-right
            so it doesn't cover ramp content while the user is picking. */}
        {compareMode && (
          <div className="fixed top-4 right-4 z-40 rounded-lg p-4 border-2 max-w-sm w-80" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ffff00'), boxShadow: '0 0 20px rgba(255, 255, 0, 0.5)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2" style={{ color: sectionHeadColor('#ffff00'), textShadow: accentTextGlow('#ffff00') }}>
                <Contrast size={16} />WCAG Contrast
              </h3>
              <button onClick={toggleCompareMode} title="Exit WCAG Check" className="w-6 h-6 bg-pink-500 text-white rounded-full border-2 border-pink-200 hover:bg-pink-400 hover:scale-110 transition-all flex items-center justify-center text-sm font-bold" style={{ boxShadow: '0 0 8px rgba(255, 0, 110, 0.6)' }}>×</button>
            </div>
            {!compareAnchor && (
              <p className="text-xs text-cyan-100/80">Click any ramp swatch to set it as the anchor color.</p>
            )}
            {compareAnchor && !compareResult && (
              <div className="space-y-2">
                <p className="text-xs text-cyan-100/80">Anchor set. Click another swatch to compute the contrast ratio.</p>
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded border-2 border-yellow-300" style={{ background: compareAnchor.hex, boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }} />
                  <div className="text-xs text-cyan-100 font-mono">{compareAnchor.hex.toUpperCase()}</div>
                </div>
              </div>
            )}
            {compareAnchor && compareResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 justify-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded border-2 border-yellow-300" style={{ background: compareResult.aHex, boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }} />
                    <div className="text-[10px] text-cyan-100 font-mono">{compareResult.aHex.toUpperCase()}</div>
                  </div>
                  <span className="text-cyan-200 text-lg font-bold">vs</span>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded border-2 border-cyan-300" style={{ background: compareResult.bHex, boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }} />
                    <div className="text-[10px] text-cyan-100 font-mono">{compareResult.bHex.toUpperCase()}</div>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: compareResult.tier === 'AA' ? '#86efac' : compareResult.tier === 'AA Large' ? '#fde047' : '#fca5a5' }}>{compareResult.ratio.toFixed(2)}:1</div>
                  <div className="text-xs font-bold uppercase tracking-wider mt-1" style={{ color: compareResult.tier === 'AA' ? '#86efac' : compareResult.tier === 'AA Large' ? '#fde047' : '#fca5a5' }}>
                    {compareResult.tier === 'AA' && 'Passes AA (4.5:1 normal text)'}
                    {compareResult.tier === 'AA Large' && 'Passes AA Large only (3:1 large text / UI)'}
                    {compareResult.tier === 'fail' && 'Fails AA (below 3:1)'}
                  </div>
                </div>
                {/* Live preview: B-on-A and A-on-B text samples so the user
                    can eyeball whether the ratio is acceptable for their
                    actual use case. WCAG ratios are perceptually imperfect;
                    seeing the swatch as foreground/background often clarifies
                    what passing actually looks like. */}
                <div className="space-y-1">
                  <div className="rounded text-center py-2 text-sm font-bold" style={{ background: compareResult.aHex, color: compareResult.bHex }}>Sample text Sample text</div>
                  <div className="rounded text-center py-2 text-sm font-bold" style={{ background: compareResult.bHex, color: compareResult.aHex }}>Sample text Sample text</div>
                </div>
                <p className="text-[10px] text-cyan-100/60 text-center">Click anchor again to unlock. Click another swatch to compare against the anchor.</p>
              </div>
            )}
          </div>
        )}

        {/* GPL import modal. Shown when gplImport state is set (after a
            successful or failed parse). Sits OUTSIDE the CVD filter
            wrapper so its colors aren't subject to colorblind simulation.
            Fixed-position overlay covers the whole viewport. Modal
            content is centered. The error case shows just a close button;
            the success case shows two action buttons (all / subset) and
            a cancel. */}
        {gplImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setGplImport(null)}>
            <div onClick={(e) => e.stopPropagation()} className="rounded-lg p-6 border-2 max-w-md w-full" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ffff00'), boxShadow: t.glowStrong > 0.5 ? '0 0 30px rgba(255, 255, 0, 0.5)' : accentGlow('#ffff00', 0.4) }}>
              <h2 className="text-xl font-bold mb-2 uppercase tracking-widest" style={{ color: sectionHeadColor('#ffff00'), textShadow: accentTextGlow('#ffff00') }}>Import .GPL</h2>
              {gplImport.error ? (
                <>
                  <p className="text-sm mb-4 text-cyan-100/80">{gplImport.error}</p>
                  <div className="flex justify-end">
                    <button onClick={() => setGplImport(null)} title="Close this dialog" className={`px-4 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}>Close</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm mb-1 text-cyan-100/80">Loaded <span className="font-bold text-yellow-200">{gplImport.name}</span> with <span className="font-bold text-yellow-200">{gplImport.colors.length}</span> color{gplImport.colors.length === 1 ? '' : 's'}.</p>
                  <p className="text-xs italic mb-4 text-cyan-100/60">This will replace your current palette. How should the imported colors be used?</p>
                  {/* Color preview strip */}
                  <div className="flex w-full rounded overflow-hidden border-2 mb-4" style={{ height: '24px', borderColor: t.vizDataBorder }}>
                    {gplImport.colors.slice(0, 32).map((hex, i) => (
                      <div key={i} className="flex-1" style={{ background: hex }} title={hex.toUpperCase()} />
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => applyGplImport('all')} title="Use every imported color as a base (capped at 16)" className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-2" style={{ boxShadow: '0 0 10px rgba(255, 255, 0, 0.4)' }}>
                      <Palette size={14} />
                      Use all as bases{gplImport.colors.length > 16 ? ` (first 16 of ${gplImport.colors.length})` : ` (${gplImport.colors.length} ramps)`}
                    </button>
                    <button onClick={() => applyGplImport('subset')} title="Let the app cluster the imported colors and pick representative bases automatically" className="px-4 py-2 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-200 hover:bg-cyan-300 transition-all uppercase tracking-wider text-xs flex items-center justify-center gap-2" style={{ boxShadow: '0 0 10px rgba(0, 255, 255, 0.4)' }}>
                      <Sparkles size={14} />
                      Auto-pick representatives
                    </button>
                    <button onClick={() => setGplImport(null)} title="Cancel import without changing the current palette" className={`px-4 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {showAISettings && <AISettingsPanel onClose={handleAISettingsClose} />}
      <TourPanel
        open={tourOpen}
        onClose={() => { handleTourMarkSeen(); setTourOpen(false); }}
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
}