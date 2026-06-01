// Visualization PNG export. Two responsibilities:
//   1. computeVizData: derive the lightness-sorted strip and the mosaic rows
//      from a style's ramps. Extracted verbatim from renderSlotViz so the
//      on-screen view and the exported PNG are computed from one source.
//   2. drawLightnessStripPng / drawMosaicPng: render flat color blocks to an
//      off-screen canvas and resolve a PNG Blob. (Added in a later task.)
import { hexToHsl } from './color';
import { dedupeHexes } from './hex-utils';

export interface MosaicRow {
  hexes: string[];
  originalIdx: number;
}

export interface VizData {
  allColors: string[];
  sortedByL: string[];
  mosaicRamps: MosaicRow[];
}

// `ramps` is an array of ramps, each a list of hex strings (the shape
// buildRampsForSnapshot returns: shades.map(s => s.hex), post pin/hardware/hidden).
export function computeVizData(ramps: string[][]): VizData {
  const allColors = dedupeHexes(ramps.flat());
  const sortedByL = [...allColors].sort((a, b) => hexToHsl(a).l - hexToHsl(b).l);

  const seen = new Set<string>();
  const mosaicRamps: MosaicRow[] = ramps
    .map((ramp, originalIdx) => ({
      hexes: dedupeHexes(ramp).filter((hex) => {
        const key = hex.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      originalIdx,
    }))
    .filter(({ hexes }) => hexes.length > 0);

  return { allColors, sortedByL, mosaicRamps };
}

// --- PNG rendering ---------------------------------------------------------

const EXPORT_WIDTH = 1024;       // px, fixed output width for both views
const LIGHTNESS_HEIGHT = 96;     // px, single-row strip height
const MOSAIC_ROW_HEIGHT = 48;    // px, per-ramp row height

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG'));
    }, 'image/png');
  });
}

// Integer block boundaries that tile [0, width) exactly with no gaps:
// block i spans [round(i*width/n), round((i+1)*width/n)).
function blockEdges(width: number, n: number, i: number): { x: number; w: number } {
  const x0 = Math.round((i * width) / n);
  const x1 = Math.round(((i + 1) * width) / n);
  return { x: x0, w: x1 - x0 };
}

// One row of equal-width blocks across the full width.
export function drawLightnessStripPng(
  sortedHexes: string[],
  opts: { width?: number; height?: number } = {},
): Promise<Blob> {
  const width = opts.width ?? EXPORT_WIDTH;
  const height = opts.height ?? LIGHTNESS_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.imageSmoothingEnabled = false;
  const n = sortedHexes.length;
  for (let i = 0; i < n; i++) {
    const { x, w } = blockEdges(width, n, i);
    ctx.fillStyle = sortedHexes[i];
    ctx.fillRect(x, 0, w, height);
  }
  return canvasToPngBlob(canvas);
}

// One row per ramp. Each row fills the full width; block width = width/row.length.
// Faithful to the on-screen flex-1 mosaic: internal boundaries do NOT align
// across rows when rows have different counts.
export function drawMosaicPng(
  rows: string[][],
  opts: { width?: number; rowHeight?: number } = {},
): Promise<Blob> {
  const width = opts.width ?? EXPORT_WIDTH;
  const rowHeight = opts.rowHeight ?? MOSAIC_ROW_HEIGHT;
  const height = Math.max(rowHeight, rows.length * rowHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.imageSmoothingEnabled = false;
  rows.forEach((row, r) => {
    const y = r * rowHeight;
    const n = row.length;
    for (let i = 0; i < n; i++) {
      const { x, w } = blockEdges(width, n, i);
      ctx.fillStyle = row[i];
      ctx.fillRect(x, y, w, rowHeight);
    }
  });
  return canvasToPngBlob(canvas);
}
