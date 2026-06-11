// Visualization PNG export. Two responsibilities:
//   1. computeVizData: derive the lightness-sorted strip and the mosaic rows
//      from a style's ramps. Extracted verbatim from renderSlotViz so the
//      on-screen view and the exported PNG are computed from one source.
//   2. drawLightnessStripPng / drawMosaicPng: render flat color blocks to an
//      off-screen canvas and resolve a PNG Blob. (Added in a later task.)
import { hexToHsl } from './color';
import { dedupeHexes } from './hex-utils';
import {
  adjacencyDeltaE, normalizeDeltaE, heatColor, ditherMatrix,
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

// Lightness axis (#51): map each color to its HSL lightness (0..100). Both the
// on-screen Lightness Distribution and drawLightnessStripPng below consume THIS
// one function, so the screen view and the exported PNG place every swatch by
// the same L on the same 0→100 axis, gaps in tonal coverage show as blank space
// in both. Keeping a single L source is the mirror guarantee: there is no
// second `hexToHsl().l` read that could drift from this one. Input order is
// preserved (callers pass sortedByL, so the lightest marker draws last = on top
// where markers overlap).
export interface LightnessMarker { hex: string; l: number; }
export function lightnessMarkers(hexes: string[]): LightnessMarker[] {
  return hexes.map((hex) => ({ hex, l: hexToHsl(hex).l }));
}

// Interior reference gridlines on the 0→100 L axis (0 and 100 are the borders).
export const LIGHTNESS_GRIDLINES = [25, 50, 75];
const LIGHTNESS_TRACK_BG = '#15151f';   // neutral dark track so gaps read as empty
const LIGHTNESS_MARKER_W = 10;          // px marker width in the PNG

// Markers placed by lightness on a 0→100 axis (NOT equal-width blocks): position
// encodes L, so missing tonal ranges appear as blank track. Mirrors the on-screen
// view (App.tsx Lightness subsection), same lightnessMarkers source, same axis,
// same gridlines.
// Precondition: `sortedHexes` is non-empty (callers guard first); an empty
// array yields a blank track rather than an error.
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
  // Track background.
  ctx.fillStyle = LIGHTNESS_TRACK_BG;
  ctx.fillRect(0, 0, width, height);
  // Reference gridlines at 25/50/75%.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (const p of LIGHTNESS_GRIDLINES) {
    ctx.fillRect(Math.round((p / 100) * width), 0, 1, height);
  }
  // One marker per color, centered at x = L%. Truthful position (no clamping):
  // edge markers clip naturally at the canvas bounds.
  const w = LIGHTNESS_MARKER_W;
  for (const { hex, l } of lightnessMarkers(sortedHexes)) {
    const cx = (l / 100) * width;
    const x = Math.round(cx - w / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 1, 0, w + 2, height);   // thin dark outline for contrast
    ctx.fillStyle = hex;
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
// as-is (caller passes ramp-grouped order, never lightness-sorted; a sorted
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

// --- Palette strip ---------------------------------------------------------

export interface PaletteStripLayout {
  width: number;
  height: number;
  cellSize: number;
  maxCells: number;
}

/** Pure geometry for the palette strip: rows = ramps, cells = visible shades. */
export function paletteStripLayout(rows: string[][], cellSize: number): PaletteStripLayout {
  const maxCells = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return { width: maxCells * cellSize, height: rows.length * cellSize, cellSize, maxCells };
}

// PNG PALETTE STRIP: an import-grade swatch sheet (drag onto a canvas, then
// eyedrop). INTENTIONALLY DIVERGES from the .gpl/.pal/.ase palette files in
// two ways, and that divergence is by design, do NOT "align" it:
//   1. No dedup: a color repeated across ramps appears once per cell (a strip
//      is positional; the palette files dedup because they expect unique entries).
//   2. No harmony colors: the strip shows only the ramps, not the appended
//      complementary/analogous/etc. swatches the palette files include.
// Cells are flat-filled at integer pixel coords at full opacity so an
// eyedropper reads exactly the source hex (no anti-aliasing, no alpha).
export function drawPaletteStripPng(rows: string[][], cellSize = 32): Promise<Blob> {
  const { width, height } = paletteStripLayout(rows, cellSize);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      ctx.fillStyle = rows[row][col];
      ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
    }
  }
  return canvasToPngBlob(canvas);
}

// --- Cross-ramp dither grid (#46) ------------------------------------------

// N×N grid where cell [i][j] is a 50/50 ordered-dither blend of base color i
// against base color j, previews the perceived in-between hue of two ramps
// (e.g. red×blue reads as purple) without spending a palette slot. The diagonal
// is the solid base. Optional header strip shows the solid base swatches (same
// layout as drawAdjacencyMatrix). Honors the active dither pattern by taking the
// MIDPOINT slice of that pattern's threshold matrix (ditherMatrix): a block
// takes color B when its matrix value is in the upper half, A otherwise, the
// same 50% split the blend preview shows at its center.
export function drawCrossRampDither(
  ctx: CanvasRenderingContext2D,
  bases: string[],
  opts: { cell: number; pattern: DitherPattern; header?: number; sub?: number },
): void {
  const n = bases.length;
  const cell = opts.cell;
  const header = opts.header ?? 0;
  const sub = opts.sub ?? Math.max(2, Math.round(cell / 6));
  const matrix = ditherMatrix(opts.pattern);
  const mN = matrix.length;
  const half = (mN * mN) / 2; // midpoint threshold → 50/50 blend
  ctx.imageSmoothingEnabled = false;

  if (header > 0) {
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, header, header);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = bases[i];
      ctx.fillRect(header + i * cell, 0, cell, header); // top strip
      ctx.fillRect(0, header + i * cell, header, cell); // left strip
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = header + j * cell;
      const y = header + i * cell;
      if (i === j) {
        ctx.fillStyle = bases[i]; // solid base on the diagonal
        ctx.fillRect(x, y, cell, cell);
        continue;
      }
      // Tile sub-blocks across the cell; each block takes color A (bases[i]) or
      // B (bases[j]) per the matrix-midpoint 50/50 rule. Integer edges so blocks
      // tile [0,cell) exactly with no gap/overflow.
      const steps = Math.max(1, Math.round(cell / sub));
      for (let by = 0; by < steps; by++) {
        const y0 = Math.round((by * cell) / steps);
        const y1 = Math.round(((by + 1) * cell) / steps);
        for (let bx = 0; bx < steps; bx++) {
          const x0 = Math.round((bx * cell) / steps);
          const x1 = Math.round(((bx + 1) * cell) / steps);
          ctx.fillStyle = matrix[by % mN][bx % mN] >= half ? bases[j] : bases[i];
          ctx.fillRect(x + x0, y + y0, x1 - x0, y1 - y0);
        }
      }
    }
  }
}

// --- Dither-blend preview --------------------------------------------------

const DITHER_ROW_H = 40;    // px row height
const DITHER_SOLID_W = 44;  // px solid shade cell width
const DITHER_BLEND_W = 28;  // px blend cell width
const DITHER_SUB = 8;       // checker/bayer subdivisions per blend cell

// Per ramp row: solid shade · dither blend(shadeᵢ, shadeᵢ₊₁) · solid shade …
// Blend cells render the pattern at a visible-pixel scale (DITHER_SUB blocks),
// NOT a shrunk-to-solid midpoint; the texture is the point of the feature.
export function drawDitherBlend(
  ctx: CanvasRenderingContext2D,
  rows: string[][],
  opts: { pattern: DitherPattern; rowH?: number; solidW?: number; blendW?: number; sub?: number },
): void {
  const rowH = opts.rowH ?? DITHER_ROW_H;
  const solidW = opts.solidW ?? DITHER_SOLID_W;
  const blendW = opts.blendW ?? DITHER_BLEND_W;
  const sub = opts.sub ?? DITHER_SUB;
  ctx.imageSmoothingEnabled = false;

  rows.forEach((row, r) => {
    const y = r * rowH;
    let x = 0;
    for (let i = 0; i < row.length; i++) {
      ctx.fillStyle = row[i];
      ctx.fillRect(x, y, solidW, rowH);
      x += solidW;
      if (i < row.length - 1) {
        const a = row[i];
        const b = row[i + 1];
        // Integer edge boundaries so sub-blocks tile [0,blendW) × [0,rowH)
        // exactly, no gap and no overflow into the neighbouring solid cell
        // (same approach as blockEdges above; avoids round/ceil overdraw).
        // Ordered-dither gradient between shade A (left) and shade B (right).
        // Sweep an A→B threshold across the blend cell and tile the pattern's
        // threshold matrix in BOTH axes. Matrix size sets the tonal levels:
        //   2×2 → 4, 4×4 Bayer → 16, 8×8 Bayer → 64 (smoother ramps).
        // Bayer at the midpoint reduces to the classic checkerboard. Non-Bayer
        // matrices (clustered dot, scanline, cross-hatch) ride the SAME sweep,
        // only the cell ordering differs (see DITHER_PATTERNS in
        // viz-interaction.ts). Tiling in both axes (not keyed to the column
        // index) is what keeps it from collapsing into vertical bands, the #43
        // bug. cols/rows ~= pixel resolution.
        const matrix = ditherMatrix(opts.pattern);
        const mN = matrix.length;        // 2, 4 or 8
        const levels = mN * mN;          // 4, 16 or 64
        const cols = Math.max(8, Math.round(blendW));
        const rows = Math.max(8, Math.round(rowH));
        for (let cx = 0; cx < cols; cx++) {
          const bx0 = Math.round((cx * blendW) / cols);
          const bx1 = Math.round(((cx + 1) * blendW) / cols);
          const threshold = ((cx + 0.5) / cols) * levels; // 0..levels across width
          for (let cy = 0; cy < rows; cy++) {
            const by0 = Math.round((cy * rowH) / rows);
            const by1 = Math.round(((cy + 1) * rowH) / rows);
            ctx.fillStyle = matrix[cy % mN][cx % mN] < threshold ? b : a;
            ctx.fillRect(x + bx0, y + by0, bx1 - bx0, by1 - by0);
          }
        }
        x += blendW;
      }
    }
  });
}

// Off-screen render of the dither preview → PNG Blob. Width tracks the longest
// ramp; shorter rows draw left-aligned. Precondition: callers guard rows.length > 0.
export function drawDitherBlendPng(
  rows: string[][],
  opts: { pattern: DitherPattern },
): Promise<Blob> {
  const solidW = 48;
  const blendW = 30;
  const rowH = 48;
  const sub = 8;
  const maxCells = rows.reduce((m, row) => Math.max(m, row.length), 0);
  const width = Math.max(1, maxCells * solidW + Math.max(0, maxCells - 1) * blendW);
  const height = Math.max(1, rows.length * rowH);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas 2D context unavailable'));
  drawDitherBlend(ctx, rows, { pattern: opts.pattern, rowH, solidW, blendW, sub });
  return canvasToPngBlob(canvas);
}
