// Visualization PNG export. Two responsibilities:
//   1. computeVizData: derive the lightness-sorted strip and the mosaic rows
//      from a style's ramps. Extracted verbatim from renderSlotViz so the
//      on-screen view and the exported PNG are computed from one source.
//   2. drawLightnessStripPng / drawMosaicPng: render flat color blocks to an
//      off-screen canvas and resolve a PNG Blob. (Added in a later task.)
import { hexToHsl } from './color';
import { dedupeHexes } from './hex-utils';
import {
  adjacencyDeltaE, normalizeDeltaE, heatColor, ditherPixelIsB,
  type MatrixView, type DitherPattern,
} from './viz-interaction';

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
// Precondition: `sortedHexes` is non-empty (callers guard first); an empty
// array yields a blank strip rather than an error.
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
// Precondition: `rows` and each inner row are non-empty (computeVizData filters
// empty rows). The Math.max below is a canvas-spec safety net for rows.length===0.
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

// --- Adjacency matrix ------------------------------------------------------

const MATRIX_NA = '#3a3a3a';        // cell fill when a hex fails to parse
const MATRIX_DIAG = '#111111';      // diagonal (identity) fill in heatmap mode

// Draw an N×N adjacency grid onto a provided context. Axes use `colors` order
// as-is (caller passes ramp-grouped order — never lightness-sorted; a sorted
// heatmap degenerates into the same corner gradient for every palette).
// `header` (px) reserves a top + left strip of the actual color swatches.
export function drawAdjacencyMatrix(
  ctx: CanvasRenderingContext2D,
  colors: string[],
  opts: { cell: number; view: MatrixView; header?: number },
): void {
  const n = colors.length;
  const cell = opts.cell;
  const header = opts.header ?? 0;
  ctx.imageSmoothingEnabled = false;

  if (header > 0) {
    ctx.fillStyle = MATRIX_DIAG; // neutral fill for the top-left header corner
    ctx.fillRect(0, 0, header, header);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[i];
      ctx.fillRect(header + i * cell, 0, cell, header); // top strip
      ctx.fillRect(0, header + i * cell, header, cell); // left strip
    }
  }

  // ΔE is computed twice in heatmap mode (a max pass, then the fill pass);
  // acceptable for the bounded grid sizes here, and avoids an N² cache alloc.
  let maxDE = 0;
  if (opts.view === 'heatmap') {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = adjacencyDeltaE(colors[i], colors[j]);
        if (d !== null && d > maxDE) maxDE = d;
      }
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = header + j * cell;
      const y = header + i * cell;
      if (opts.view === 'heatmap') {
        if (i === j) {
          ctx.fillStyle = MATRIX_DIAG;
          ctx.fillRect(x, y, cell, cell);
          continue;
        }
        const d = adjacencyDeltaE(colors[i], colors[j]);
        ctx.fillStyle = d === null ? MATRIX_NA : heatColor(normalizeDeltaE(d, maxDE));
        ctx.fillRect(x, y, cell, cell);
      } else {
        // Pair split: row color (colors[i]) fills the cell; column color
        // (colors[j]) overlays the lower-right triangle. Diagonal = solid.
        ctx.fillStyle = colors[i];
        ctx.fillRect(x, y, cell, cell);
        if (i === j) continue;
        ctx.fillStyle = colors[j];
        ctx.beginPath();
        ctx.moveTo(x + cell, y);
        ctx.lineTo(x + cell, y + cell);
        ctx.lineTo(x, y + cell);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

// Off-screen render of the matrix → PNG Blob. Cell size scales down with N so
// large palettes stay bounded. Precondition: callers guard colors.length > 0.
export function drawAdjacencyMatrixPng(
  colors: string[],
  opts: { view: MatrixView },
): Promise<Blob> {
  const n = colors.length;
  const cell = n > 0 ? Math.max(8, Math.floor(640 / n)) : 8;
  const header = Math.max(8, Math.round(cell * 0.6));
  const size = Math.max(1, header + n * cell);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  drawAdjacencyMatrix(ctx, colors, { cell, view: opts.view, header });
  return canvasToPngBlob(canvas);
}
