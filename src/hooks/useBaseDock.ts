import { useEffect, useRef, useState } from 'react';
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
function sizeOf(ref: React.RefObject<HTMLElement | null>) {
  const r = ref.current?.getBoundingClientRect();
  if (r && r.width > 0 && r.height > 0) return { w: r.width, h: r.height };
  return FALLBACK_SIZE;
}

export function useBaseDock(ref: React.RefObject<HTMLElement | null>) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  // `pos` is the user's INTENDED position (what they last dragged to), persisted
  // as-is. It is never mutated by a resize, so shrinking then growing the window
  // (or opening/closing devtools) returns the dock to where the user put it.
  const [pos, setPos] = useState<Point>(() => {
    const saved = parsePoint(localStorage.getItem(POS_KEY));
    return saved ?? resolveAnchor(DEFAULT_DOCK_POS, viewport(), FALLBACK_SIZE);
  });
  // Track the viewport so the DISPLAYED position re-derives on resize without
  // touching the intended `pos`.
  const [vp, setVp] = useState(viewport);

  useEffect(() => { localStorage.setItem(POS_KEY, JSON.stringify(pos)); }, [pos]);
  useEffect(() => { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  useEffect(() => {
    const onResize = () => setVp(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Clamp the intended position into the current viewport for DISPLAY only.
  // A smaller viewport tucks the dock in; a larger one restores it, because
  // `pos` itself is left untouched.
  const display = clampToViewport(pos, vp, sizeOf(ref));

  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    drag.current = { dx: e.clientX - display.x, dy: e.clientY - display.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos(clampToViewport(
      { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy },
      viewport(),
      sizeOf(ref),
    ));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
    if (import.meta.env.DEV) {
      const candidate = nearestCornerOffset(pos, viewport(), sizeOf(ref));
      // eslint-disable-next-line no-console
      console.log('[base-dock] DEFAULT_DOCK_POS candidate:', JSON.stringify(candidate));
    }
  };

  // A touch cancel / OS gesture takeover ends a drag without firing pointerup.
  // Clear the in-flight drag so a later hover can't keep repositioning the dock.
  const onPointerCancel = (e: React.PointerEvent) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
  };

  return { pos: display, collapsed, setCollapsed, dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
