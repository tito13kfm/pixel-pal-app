import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  DEFAULT_DOCK_POS,
  resolveCardAnchor,
  clampToViewport,
  cardAnchorFromPixel,
  parseCardAnchor,
  type CardAnchor,
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

// Horizontal span of the card column the dock anchors to. The dock is rendered
// as a child of the centered content container, so its parent's rect is that
// column (NOTE: keep the dock a child of that container in App.tsx). Falls back
// to the full viewport width when unmeasurable (jsdom / first paint).
function cardSpanOf(ref: React.RefObject<HTMLElement | null>) {
  const r = ref.current?.parentElement?.getBoundingClientRect();
  if (r && r.width > 0) return { left: r.left, right: r.right };
  return { left: 0, right: window.innerWidth };
}

export function useBaseDock(ref: React.RefObject<HTMLElement | null>) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  // Position is stored relative to the card column (a card edge + offset), NOT
  // absolute x/y or the viewport corner. Resolving it against the live card span
  // each render keeps the dock the same distance from the cards at any window
  // size, so resizing tracks the content instead of drifting into the gutter.
  const [dock, setDock] = useState<CardAnchor>(
    () => parseCardAnchor(localStorage.getItem(POS_KEY)) ?? DEFAULT_DOCK_POS,
  );
  const [vp, setVp] = useState(viewport);

  // `dock` is persisted on drag release (onPointerUp), not via an effect, so a
  // drag doesn't write to localStorage on every pointermove frame.
  useEffect(() => { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); }, [collapsed]);

  useEffect(() => {
    const onResize = () => setVp(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Pixel position for rendering, re-derived from the card anchor each render.
  const display = resolveCardAnchor(dock, cardSpanOf(ref), vp, sizeOf(ref));

  const drag = useRef<{ dx: number; dy: number } | null>(null);
  // True once the pointer actually moved during a drag, so the click the browser
  // synthesizes after a drag does not trigger the collapsed pill's expand handler.
  const didDrag = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    drag.current = { dx: e.clientX - display.x, dy: e.clientY - display.y };
    didDrag.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    didDrag.current = true;
    const size = sizeOf(ref);
    const v = viewport();
    const pixel = clampToViewport(
      { x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy },
      v,
      size,
    );
    // Re-anchor to the nearest card edge so the stored position tracks the cards.
    setDock(cardAnchorFromPixel(pixel, cardSpanOf(ref), v, size));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* unsupported */ }
    localStorage.setItem(POS_KEY, JSON.stringify(dock));
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

  // Dev-only live readout of the card anchor, so the default can be calibrated by
  // dragging and reading the dock face (no devtools needed). Null in prod.
  const devCandidate = import.meta.env.DEV ? dock : null;

  return { pos: display, collapsed, setCollapsed, devCandidate, didDrag, dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel } };
}
