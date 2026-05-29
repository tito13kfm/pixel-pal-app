import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate } from '@floating-ui/dom'
import { ONBOARDING_TOUR, TASK_GUIDES, effectiveAdvance } from '../lib/tours'
import type { TourAppState, TourGuide, TourStep } from '../lib/tours'
import { cutoutRectFrom, positionPopover, type CutoutRect } from '../lib/tour-runtime'

const ALL_GUIDES: TourGuide[] = [ONBOARDING_TOUR, ...TASK_GUIDES]

interface TourOverlayProps {
  open: boolean
  guideId: string | null
  step: number
  appState: TourAppState
  runSetup: (setupId: string) => void
  onSetStep: (step: number) => void
  onExit: () => void
}

export function TourOverlay({
  open, guideId, step, appState, runSetup, onSetStep, onExit,
}: TourOverlayProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLDivElement>(null)
  const [cutout, setCutout] = useState<CutoutRect | null>(null)
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number; arrowSide: 'top' | 'bottom' | 'left' | 'right'; arrowX: number | null; arrowY: number | null } | null>(null)
  const [targetMissing, setTargetMissing] = useState(false)
  const [baselineSatisfied, setBaselineSatisfied] = useState(false)
  const detectorBaseline = useRef<boolean | null>(null)
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const guide: TourGuide | null = guideId ? ALL_GUIDES.find(g => g.id === guideId) ?? null : null
  const current: TourStep | null = guide?.steps[step] ?? null
  const isLast = guide ? step === guide.steps.length - 1 : false

  // Per-step sequence: reset baseline -> setup -> await target mount -> capture
  // baseline AFTER mount -> position -> arm autoUpdate (recompute cutout+popover together)
  useEffect(() => {
    if (!open || !current) return
    let raf = 0
    let cleanupAuto: (() => void) | undefined
    let cancelled = false

    // Reset baseline synchronously at EVERY step entry. Without this, clicking
    // Back into a step whose detector is already satisfied leaves a stale `false`
    // baseline and the auto-advance effect bounces the user forward again. The
    // auto-advance effect guards on `=== null` until the rAF captures the real
    // post-mount baseline.
    detectorBaseline.current = null
    setTargetMissing(false)
    setBaselineSatisfied(false)

    if (current.setup) runSetup(current.setup)

    // no target -> centered card (Welcome / all-set). Capture baseline immediately.
    if (!current.target) {
      detectorBaseline.current = current.detector ? current.detector(appState) : null
      setCutout(null)
      setPopoverPos(null)
      return
    }

    // await target mount + stable layout, capped so a missing/typo'd target
    // does not busy-loop forever; after ~2s degrade to a centered card + Next.
    let frames = 0
    const MAX_FRAMES = 120 // ~2s at 60fps
    const waitForTarget = () => {
      const el = document.querySelector(`[data-tour-id="${current.target}"]`) as HTMLElement | null
      const rect = el?.getBoundingClientRect()
      if (el && rect && rect.width > 0 && rect.height > 0) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        const baseline = current.detector ? current.detector(appState) : null
        detectorBaseline.current = baseline
        if (baseline === true) setBaselineSatisfied(true)
        const recompute = async () => {
          if (cancelled || !popoverRef.current || !arrowRef.current) return
          const r = el.getBoundingClientRect()
          setCutout(cutoutRectFrom(r, 6))
          const p = await positionPopover(el, popoverRef.current, arrowRef.current,
            current.placement ?? 'auto')
          if (!cancelled) setPopoverPos({ x: p.x, y: p.y, arrowSide: p.arrowSide, arrowX: p.arrowX, arrowY: p.arrowY })
        }
        void recompute()
        cleanupAuto = autoUpdate(el, popoverRef.current!, recompute)
      } else if (frames++ < MAX_FRAMES) {
        raf = requestAnimationFrame(waitForTarget)
      } else {
        detectorBaseline.current = current.detector ? current.detector(appState) : null
        setCutout(null)
        setPopoverPos(null)
        setTargetMissing(true)
      }
    }
    raf = requestAnimationFrame(waitForTarget)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      cleanupAuto?.()
      if (advanceTimer.current) { clearTimeout(advanceTimer.current); advanceTimer.current = null }
    }
    // appState intentionally NOT a dep: baseline captured at step entry only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, guideId, step])

  // Auto-advance on detector false->true edge (interactive steps)
  useEffect(() => {
    if (!open || !current) return
    if (effectiveAdvance(current) !== 'detector' || !current.detector) return
    if (detectorBaseline.current === null) return
    const now = current.detector(appState)
    if (detectorBaseline.current === false && now === true) {
      detectorBaseline.current = true
      const last = guide ? step === guide.steps.length - 1 : false
      advanceTimer.current = setTimeout(() => { last ? onExit() : onSetStep(step + 1) }, 400)
    }
  }, [appState, open, current, guide, step, onExit, onSetStep])

  // Esc exits
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onExit() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onExit])

  if (!open || !guide || !current) return null

  const advanceMode = effectiveAdvance(current)
  // Show Next for passive steps, no-target steps, and the target-absent fallback.
  const showNext = advanceMode === 'next' || !current.target || targetMissing || baselineSatisfied
  const W = typeof window !== 'undefined' ? window.innerWidth : 0
  const H = typeof window !== 'undefined' ? window.innerHeight : 0

  return createPortal(
    <>
      <svg className="tour-overlay-svg" width="100%" height="100%">
        {/* Even-odd: outer rect minus cutout hole. Dim painted region swallows clicks. */}
        <path
          className="tour-overlay-dim"
          fillRule="evenodd"
          style={{ pointerEvents: 'auto' }}
          d={cutout
            ? `M0 0 H${W} V${H} H0 Z M${cutout.x} ${cutout.y} h${cutout.width} v${cutout.height} h${-cutout.width} Z`
            : `M0 0 H${W} V${H} H0 Z`}
        />
        {cutout && (
          <rect className="tour-ring" x={cutout.x} y={cutout.y}
                width={cutout.width} height={cutout.height}
                style={{ pointerEvents: 'none' }} />
        )}
      </svg>

      <div
        ref={popoverRef}
        className="tour-popover"
        style={cutout && popoverPos
          ? { left: popoverPos.x, top: popoverPos.y }
          : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      >
        {/* Arrow is mounted unconditionally so arrowRef attaches before the first
            recompute. recompute() bails if arrowRef.current is null, and cutout is
            only set inside recompute — gating the arrow on `cutout` deadlocked the
            spotlight (no cutout ever formed, full-screen dim swallowed all clicks).
            Hidden when there is no cutout. */}
        <div ref={arrowRef} className="tour-arrow"
             style={{
               display: cutout ? undefined : 'none',
               // floating-ui gives the offset along ONE axis (arrowX for
               // top/bottom placements, arrowY for left/right). The other axis is
               // pinned to the popover edge facing the target (arrowSide) at -6px
               // (half the 12px box) so the arrow straddles the border and pokes
               // out, instead of landing inside the box over the title.
               left: popoverPos?.arrowX != null ? popoverPos.arrowX
                     : popoverPos?.arrowSide === 'left' ? -6 : undefined,
               top: popoverPos?.arrowY != null ? popoverPos.arrowY
                    : popoverPos?.arrowSide === 'top' ? -6 : undefined,
               right: popoverPos?.arrowSide === 'right' ? -6 : undefined,
               bottom: popoverPos?.arrowSide === 'bottom' ? -6 : undefined,
             }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <h3 style={{ color: '#e9d5ff', fontWeight: 600, fontSize: 14 }}>{current.title}</h3>
          <button onClick={onExit} title="Exit tour"
                  style={{ color: '#7c3aed', fontSize: 16, lineHeight: 1, marginLeft: 8 }}>✕</button>
        </div>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{current.body}</p>
        {current.hint && <p style={{ fontSize: 11, fontStyle: 'italic', color: '#7c3aed', marginTop: 4 }}>{current.hint}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 11, color: '#6d28d9' }}>{step + 1} / {guide.steps.length}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button onClick={() => onSetStep(step - 1)}
                      style={{ fontSize: 11, color: '#7c3aed' }}>← Back</button>
            )}
            {showNext && (
              <button onClick={() => isLast ? onExit() : onSetStep(step + 1)}
                      style={{ fontSize: 11, background: '#7c3aed', color: '#fff', padding: '3px 12px', borderRadius: 4 }}>
                {isLast ? 'Done' : 'Next →'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
