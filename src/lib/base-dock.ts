// Pure position + persistence helpers for the base-color dock (#80).
// Framework-free so they are unit-testable without the React harness.

export type DockAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface DockDefault { anchor: DockAnchor; dx: number; dy: number; }
export interface Point { x: number; y: number; }
export interface Size { w: number; h: number; }
export interface Viewport { w: number; h: number; }

// Placeholder default; replaced with a dev-calibrated value in Task 6.
export const DEFAULT_DOCK_POS: DockDefault = { anchor: 'top-right', dx: 24, dy: 80 };

export function clampToViewport(p: Point, vp: Viewport, size: Size): Point {
  const maxX = Math.max(0, vp.w - size.w);
  const maxY = Math.max(0, vp.h - size.h);
  return {
    x: Math.min(Math.max(0, p.x), maxX),
    y: Math.min(Math.max(0, p.y), maxY),
  };
}

export function resolveAnchor(d: DockDefault, vp: Viewport, size: Size): Point {
  const x = d.anchor.includes('right') ? vp.w - size.w - d.dx : d.dx;
  const y = d.anchor.includes('bottom') ? vp.h - size.h - d.dy : d.dy;
  return clampToViewport({ x, y }, vp, size);
}

// Given a pixel position, report the nearest corner as an anchor + offset.
// Used by the dev-only calibration readout so a dragged position can be
// hardcoded as DEFAULT_DOCK_POS.
export function nearestCornerOffset(p: Point, vp: Viewport, size: Size): DockDefault {
  const fromLeft = p.x;
  const fromRight = vp.w - size.w - p.x;
  const fromTop = p.y;
  const fromBottom = vp.h - size.h - p.y;
  const horiz = fromRight < fromLeft ? 'right' : 'left';
  const vert = fromBottom < fromTop ? 'bottom' : 'top';
  const anchor = `${vert}-${horiz}` as DockAnchor;
  const dx = Math.max(0, Math.round(horiz === 'right' ? fromRight : fromLeft));
  const dy = Math.max(0, Math.round(vert === 'bottom' ? fromBottom : fromTop));
  return { anchor, dx, dy };
}

export function parsePoint(raw: string | null): Point | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.x === 'number' && typeof v.y === 'number') return { x: v.x, y: v.y };
  } catch { /* ignore malformed */ }
  return null;
}
