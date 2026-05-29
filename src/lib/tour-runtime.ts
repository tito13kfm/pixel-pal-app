import { computePosition, offset, flip, shift, arrow } from '@floating-ui/dom'
import type { Placement } from '@floating-ui/dom'

export interface CutoutRect { x: number; y: number; width: number; height: number }

/** Viewport-space rounded-rect for the spotlight hole, padded around the target. */
export function cutoutRectFrom(target: DOMRect, padding: number): CutoutRect {
  const x = Math.max(0, target.left - padding)
  const y = Math.max(0, target.top - padding)
  return {
    x,
    y,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  }
}

export interface PopoverPlacementResult {
  x: number
  y: number
  placement: Placement
  /** The popover edge the arrow sits on (opposite the side facing the target). */
  arrowSide: 'top' | 'bottom' | 'left' | 'right'
  arrowX: number | null
  arrowY: number | null
}

/** Wraps floating-ui computePosition with the tour's middleware stack. */
export async function positionPopover(
  targetEl: HTMLElement,
  popoverEl: HTMLElement,
  arrowEl: HTMLElement,
  preferred: 'top' | 'bottom' | 'left' | 'right' | 'auto',
): Promise<PopoverPlacementResult> {
  const placement: Placement = preferred === 'auto' ? 'bottom' : preferred
  // strategy:'fixed' returns viewport-relative coords. The popover is
  // position:fixed in CSS, so the default 'absolute' strategy (document-relative)
  // placed it at the target's document offset — e.g. y≈1868 for a target deep in
  // a scrolling page — rendering it far below the viewport. Must match the CSS.
  const { x, y, placement: finalPlacement, middlewareData } = await computePosition(
    targetEl,
    popoverEl,
    {
      strategy: 'fixed',
      placement,
      middleware: [offset(12), flip(), shift({ padding: 8 }), arrow({ element: arrowEl })],
    },
  )
  // Clamp into the viewport. flip()/shift() handle the common cases, but a target
  // taller than the viewport (e.g. ramp-area) leaves no fitting side, so the
  // popover overflows the bottom edge and its Next/Done button falls off-screen.
  // Clamp y (and x) so the popover box is always fully visible; the arrow may
  // then point slightly off the target edge, which is acceptable.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const pw = popoverEl.offsetWidth
  const ph = popoverEl.offsetHeight
  const clampedX = vw ? Math.min(Math.max(x, 8), Math.max(8, vw - pw - 8)) : x
  const clampedY = vh ? Math.min(Math.max(y, 8), Math.max(8, vh - ph - 8)) : y

  // The arrow sits on the popover edge OPPOSITE the side facing the target.
  // floating-ui's final placement names the side facing the target (e.g.
  // 'bottom' = popover below target, so the arrow is on the popover's TOP edge).
  const side = finalPlacement.split('-')[0] as 'top' | 'bottom' | 'left' | 'right'
  const arrowSide = ({ top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const)[side]

  return {
    x: clampedX,
    y: clampedY,
    placement: finalPlacement,
    arrowSide,
    arrowX: middlewareData.arrow?.x ?? null,
    arrowY: middlewareData.arrow?.y ?? null,
  }
}
