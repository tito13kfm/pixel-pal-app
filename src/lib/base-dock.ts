// Pure position + persistence helpers for the base-color dock (#80).
// Framework-free so they are unit-testable without the React harness.

export type DockHEdge = 'left' | 'right';
export type DockVEdge = 'top' | 'bottom';
// Dock position relative to the card column: a horizontal card edge + signed
// pixel offset, plus a viewport vertical edge + offset. Anchoring horizontally
// to the cards (not the viewport) keeps the dock glued to the content as the
// window resizes, instead of drifting across the grey gutter.
export interface CardAnchor { hEdge: DockHEdge; dx: number; vEdge: DockVEdge; dy: number; }
export interface Point { x: number; y: number; }
export interface Size { w: number; h: number; }
export interface Viewport { w: number; h: number; }
// Horizontal span (viewport coords) of the card column the dock anchors to.
export interface HSpan { left: number; right: number; }

// Default: 12px to the right of the card column, near the top (aligned with the
// top card). Card-relative, so it lands consistently at any window size.
export const DEFAULT_DOCK_POS: CardAnchor = { hEdge: 'right', dx: 16, vEdge: 'top', dy: 144 };

export function clampToViewport(p: Point, vp: Viewport, size: Size): Point {
  const maxX = Math.max(0, vp.w - size.w);
  const maxY = Math.max(0, vp.h - size.h);
  return {
    x: Math.min(Math.max(0, p.x), maxX),
    y: Math.min(Math.max(0, p.y), maxY),
  };
}

// Resolve a card-relative anchor to a pixel position: horizontal from the chosen
// card edge, vertical from the chosen viewport edge, clamped on-screen.
export function resolveCardAnchor(a: CardAnchor, card: HSpan, vp: Viewport, size: Size): Point {
  const baseX = a.hEdge === 'right' ? card.right : card.left;
  const x = baseX + a.dx;
  const y = a.vEdge === 'bottom' ? vp.h - size.h - a.dy : a.dy;
  return clampToViewport({ x, y }, vp, size);
}

// Convert a pixel position to a card-relative anchor: nearest card edge
// horizontally (signed offset), nearest viewport edge vertically. Powers the
// dev calibration readout and is re-applied on every drag so resize tracks the
// cards.
export function cardAnchorFromPixel(p: Point, card: HSpan, vp: Viewport, size: Size): CardAnchor {
  const hEdge: DockHEdge = Math.abs(p.x - card.right) <= Math.abs(p.x - card.left) ? 'right' : 'left';
  const dx = Math.round(p.x - (hEdge === 'right' ? card.right : card.left));
  const fromTop = p.y;
  const fromBottom = vp.h - size.h - p.y;
  const vEdge: DockVEdge = fromBottom < fromTop ? 'bottom' : 'top';
  const dy = Math.max(0, Math.round(vEdge === 'bottom' ? fromBottom : fromTop));
  return { hEdge, dx, vEdge, dy };
}


// Column count for the expanded swatch grid. Keeps the dock a tall ~2:1
// (height:width) rectangle as the palette grows, instead of one long column:
// with rows = ceil(n/cols), aiming for rows ≈ 2*cols gives cols ≈ sqrt(n/2).
export function gridColumns(n: number): number {
  return Math.max(1, Math.round(Math.sqrt(n / 2)));
}


// Parse a stored card anchor, rejecting anything malformed so a bad localStorage
// value falls back to the default instead of stranding the dock.
export function parseCardAnchor(raw: string | null): CardAnchor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && (v.hEdge === 'left' || v.hEdge === 'right')
          && (v.vEdge === 'top' || v.vEdge === 'bottom')
          && Number.isFinite(v.dx) && Number.isFinite(v.dy)) {
      return { hEdge: v.hEdge, dx: v.dx, vEdge: v.vEdge, dy: v.dy };
    }
  } catch { /* ignore malformed */ }
  return null;
}
