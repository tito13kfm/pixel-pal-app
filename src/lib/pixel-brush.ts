// src/lib/pixel-brush.ts

export type BrushOffset = { dx: number; dy: number };
export type BrushShape = 'circle' | 'square';
export type BrushSize = 1 | 2 | 4;

export function getStamp(shape: BrushShape, size: BrushSize): BrushOffset[] {
  if (shape === 'square') {
    const half = Math.floor(size / 2);
    const offsets: BrushOffset[] = [];
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        offsets.push({ dx, dy });
      }
    }
    return offsets;
  }
  // size 1: formula (0.5^2+0.5^2=0.5) > r2=0.25, would return empty; special-case it
  if (size === 1) return [{ dx: 0, dy: 0 }];
  // circle: pixel at (dx,dy) fills if center (dx+0.5, dy+0.5) within radius
  const r2 = (size / 2) ** 2;
  const half = Math.floor(size / 2);
  const offsets: BrushOffset[] = [];
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      if ((dx + 0.5) ** 2 + (dy + 0.5) ** 2 <= r2) {
        offsets.push({ dx, dy });
      }
    }
  }
  return offsets;
}

export function applyStamp(
  pixels: (number | null)[],
  cx: number,
  cy: number,
  stamp: BrushOffset[],
  value: number | null,
  canvasW: number,
  canvasH: number
): (number | null)[] {
  const next = pixels.slice();
  for (const { dx, dy } of stamp) {
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || x >= canvasW || y < 0 || y >= canvasH) continue;
    next[y * canvasW + x] = value;
  }
  return next;
}
