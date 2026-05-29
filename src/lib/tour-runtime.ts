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
  const { x, y, placement: finalPlacement, middlewareData } = await computePosition(
    targetEl,
    popoverEl,
    {
      placement,
      middleware: [offset(12), flip(), shift({ padding: 8 }), arrow({ element: arrowEl })],
    },
  )
  return {
    x,
    y,
    placement: finalPlacement,
    arrowX: middlewareData.arrow?.x ?? null,
    arrowY: middlewareData.arrow?.y ?? null,
  }
}
