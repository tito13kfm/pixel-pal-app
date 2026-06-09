import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  DEFAULT_DOCK_POS,
  resolveAnchor,
  clampToViewport,
  nearestCornerOffset,
  parseDock,
  type DockDefault,
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
  // Position is stored as a corner anchor + pixel offset, NOT absolute x/y.
  // Resolving it against the live viewport each render keeps the dock the same
  // distance from its corner at any window size, so resizing never drifts it.
  const [dock, setDock] = useState<DockDefault>(
    () => parseDock(localStorage.getItem(POS_KEY)) ?? DEFAULT_DOCK_POS,
  );
  const [vp, setVp] = useState(viewport);

  useEffect(() => { localStorage.setItem(POS_KEY, JSON.stringify(dock)); }, [dock]);
  useEffect(() => { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  useEffect(() => {
    const onResize = () => setVp(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Pixel position for rendering, re-derived from the corner anchor each render.
  const display = resolveAnchor(dock, vp, sizeOf(ref));

  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    drag.current = { dx: e.clientX - display.x, dy: e.clientY - display.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const size = sizeOf(ref);
    const v = viewport();
    const pixel = clampToViewport(
      { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy },
      v,
      size,
    );
    // Re-anchor to the nearest corner so the stored position stays viewport-relative.
    setDock(nearestCornerOffset(pixel, v, size));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[base-dock] DEFAULT_DOCK_POS candidate:', JSON.stringify(dock));
    }
  };

  // A touch cancel / OS gesture takeover ends a drag without firing pointerup.
  // Clear the in-flight drag so a later hover can't keep repositioning the dock.
  const onPointerCancel = (e: React.PointerEvent) => {
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
  };

  // Dev-only live readout of the corner anchor + offset, so the default can be
  // calibrated by dragging and reading the dock face (no devtools needed). The
  // stored `dock` IS the anchor+offset. Null in prod (dead-code-eliminated).
  const devCandidate = import.meta.env.DEV ? dock : null;

  return { pos: display, collapsed, setCollapsed, devCandidate, dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
