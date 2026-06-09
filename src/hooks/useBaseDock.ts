import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  DEFAULT_DOCK_POS,
  resolveAnchor,
  clampToViewport,
  nearestCornerOffset,
  parsePoint,
  type Point,
} from '../lib/base-dock';

const POS_KEY = 'ui:baseDockPos';
const COLLAPSED_KEY = 'ui:baseDockCollapsed';
const FALLBACK_SIZE = { w: 50, h: 200 };

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight };
}

// Read the live dock size from its DOM node, falling back to an estimate
// (jsdom and the first render before layout return zeros).
function sizeOf(ref: React.RefObject<HTMLElement>) {
  const r = ref.current?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) return { w: r.width, h: r.height };
  return FALLBACK_SIZE;
}

export function useBaseDock(ref: React.RefObject<HTMLElement>) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  const [pos, setPos] = useState<Point>(() => {
    const saved = parsePoint(localStorage.getItem(POS_KEY));
    return saved ?? resolveAnchor(DEFAULT_DOCK_POS, viewport(), FALLBACK_SIZE);
  });

  useEffect(() => { localStorage.setItem(POS_KEY, JSON.stringify(pos)); }, [pos]);
  useEffect(() => { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  // Re-clamp into the viewport on resize so the dock can never be stranded.
  useEffect(() => {
    const onResize = () => setPos(p => clampToViewport(p, viewport(), sizeOf(ref)));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ref]);

  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const next = clampToViewport(
      { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy },
      viewport(),
      sizeOf(ref),
    );
    setPos(next);
  }, [ref]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
    if (import.meta.env.DEV) {
      const candidate = nearestCornerOffset(pos, viewport(), sizeOf(ref));
      // eslint-disable-next-line no-console
      console.log('[base-dock] DEFAULT_DOCK_POS candidate:', JSON.stringify(candidate));
    }
  }, [pos, ref]);

  return { pos, collapsed, setCollapsed, dragHandlers: { onPointerDown, onPointerMove, onPointerUp } };
}
