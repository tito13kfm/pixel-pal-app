import { quantizeToPalette } from './image-extract';

export interface RemapImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export interface RemapOptions {
  dither?: 'none' | 'floyd-steinberg';
}

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
// A unique-color cache (Map<packedRGB, dstHex>) is used for the no-dither path
// where packedRGB = (r<<16)|(g<<8)|b (integer key, see packKey below).
// Floyd-Steinberg cannot use the cache because each pixel's input is
// error-adjusted and effectively unique.
export const remapImageToPalette = (
  image: RemapImage,
  paletteColors: string[],
  options?: RemapOptions,
): RemapImage => {
  const opts: RemapOptions = options || {};
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
  const packKey = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;
  const toHex = (r: number, g: number, b: number) => {
    const hh = (n: number) => n.toString(16).padStart(2, '0');
    return '#' + hh(r) + hh(g) + hh(b);
  };
  const hexToTuple = (hex: string) => {
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
        const diffuse = (nx: number, ny: number, weight: number) => {
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
  const cache = new Map<number, string>();
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
export const computeRemapScaleOptions = (
  naturalW: number,
  naturalH: number,
  maxDim?: number,
): number[] => {
  const cap = (typeof maxDim === 'number' && maxDim > 0) ? maxDim : 8192;
  const all = [0.25, 0.5, 1, 2, 4, 8];
  const out: number[] = [];
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
export const estimateRemapCost = (
  w: number,
  h: number,
  paletteSize: number,
  dither: string,
): number => {
  const pixels = Math.max(0, w * h);
  if (paletteSize <= 0) return 0;
  if (dither === 'floyd-steinberg') {
    return pixels * paletteSize;
  }
  // no-dither
  const uniqueCap = Math.min(pixels, 65536);
  return uniqueCap * paletteSize + pixels;
};
