import { useEffect, useRef } from 'react'
import { ONBOARDING_TOUR, TASK_GUIDES, TourAppState } from '../lib/tours'
import type { TourGuide, TourStep } from '../lib/tours'

interface TourPanelProps {
  open: boolean
  onClose: () => void
  appState: TourAppState
  tourGuideId: string | null
  tourStep: number
  onSetGuide: (id: string | null) => void
  onSetStep: (step: number) => void
  onMarkSeen: () => void
}

const ALL_GUIDES: TourGuide[] = [ONBOARDING_TOUR, ...TASK_GUIDES]

export function TourPanel({
  open,
  onClose,
  appState,
  tourGuideId,
  tourStep,
  onSetGuide,
  onSetStep,
  onMarkSeen,
}: TourPanelProps) {
  // Stores the detector's return value at the moment a step is entered.
  // Auto-advance only fires on false→true transition (edge-triggered).
  const detectorBaselineRef = useRef<boolean | null>(null)

  // Reset baseline when step changes
  useEffect(() => {
    if (!tourGuideId) return
    const guide = ALL_GUIDES.find(g => g.id === tourGuideId)
    const step = guide?.steps[tourStep]
    detectorBaselineRef.current = step?.detector ? step.detector(appState) : null
    // appState intentionally omitted: baseline captures state at step-entry only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourGuideId, tourStep])

  // Auto-advance on false→true detector transition.
  // Setting detectorBaselineRef.current = true on first detection prevents
  // subsequent re-renders from canceling and re-setting the timer.
  useEffect(() => {
    if (!open || !tourGuideId) return
    const guide = ALL_GUIDES.find(g => g.id === tourGuideId)
    if (!guide) return
    const step: TourStep | undefined = guide.steps[tourStep]
    if (!step?.detector) return
    if (detectorBaselineRef.current === null) return

    const current = step.detector(appState)
    if (detectorBaselineRef.current === false && current === true) {
      detectorBaselineRef.current = true // edge-trigger: block re-entry on next renders
      const isLast = tourStep === guide.steps.length - 1
      setTimeout(() => {
        if (isLast) {
          if (tourGuideId === 'onboarding') onMarkSeen()
          onClose()
        } else {
          onSetStep(tourStep + 1)
        }
      }, 400)
    }
  }, [appState, open, tourGuideId, tourStep, onMarkSeen, onClose, onSetStep])

  if (!open) return null

  const currentGuide = tourGuideId ? ALL_GUIDES.find(g => g.id === tourGuideId) ?? null : null
  const currentStep: TourStep | null = currentGuide?.steps[tourStep] ?? null
  const isOnboarding = tourGuideId === 'onboarding'
  const isLastStep = currentGuide ? tourStep === currentGuide.steps.length - 1 : false

  const advance = () => {
    if (!currentGuide) return
    if (isLastStep) {
      if (isOnboarding) onMarkSeen()
      onClose()
    } else {
      onSetStep(tourStep + 1)
    }
  }

  const back = () => {
    if (tourStep > 0) onSetStep(tourStep - 1)
  }

  return (
    <div
      className="fixed left-0 top-0 h-full z-40 flex flex-col shadow-2xl"
      style={{ width: 260, background: '#1e1b4b', borderRight: '2px solid #7c3aed' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #4c1d95' }}>
        <span className="font-bold text-sm tracking-widest uppercase" style={{ color: '#c4b5fd' }}>
          Guides
        </span>
        <button
          onClick={onClose}
          title="Close guides"
          className="text-lg leading-none transition-colors"
          style={{ color: '#7c3aed' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={e => (e.currentTarget.style.color = '#7c3aed')}
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Guide-select mode */}
        {!tourGuideId && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { onSetGuide('onboarding'); onSetStep(0) }}
              className="text-left rounded px-3 py-2 text-sm font-medium transition-colors"
              style={{ background: '#312e81', color: '#c4b5fd' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#3730a3')}
              onMouseLeave={e => (e.currentTarget.style.background = '#312e81')}
            >
              ▶ Quick tour (4 steps)
            </button>
            <div
              className="text-xs uppercase tracking-widest mt-3 mb-1"
              style={{ color: '#6d28d9' }}
            >
              Show me how to...
            </div>
            {TASK_GUIDES.map(guide => (
              <button
                key={guide.id}
                onClick={() => { onSetGuide(guide.id); onSetStep(0) }}
                className="text-left rounded px-3 py-1.5 text-sm transition-colors"
                style={{ color: '#a78bfa' }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#fff'
                  e.currentTarget.style.background = '#312e81'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#a78bfa'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {guide.label}
              </button>
            ))}
          </div>
        )}

        {/* Tour or task-guide mode */}
        {tourGuideId && currentGuide && currentStep && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => onSetGuide(null)}
              className="text-xs text-left transition-colors"
              style={{ color: '#6d28d9' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6d28d9')}
            >
              ← All guides
            </button>
            <h3 className="font-semibold text-sm" style={{ color: '#e9d5ff' }}>
              {currentStep.title}
            </h3>
            <p className="text-sm leading-relaxed" style={{ color: '#c4b5fd' }}>
              {currentStep.body}
            </p>
            {currentStep.hint && (
              <p className="text-xs italic" style={{ color: '#7c3aed' }}>
                {currentStep.hint}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer (tour/task-guide mode only) */}
      {tourGuideId && currentGuide && (
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid #4c1d95' }}
        >
          <span className="text-xs" style={{ color: '#6d28d9' }}>
            {tourStep + 1} / {currentGuide.steps.length}
          </span>
          <div className="flex gap-2 items-center">
            {tourStep > 0 && (
              <button
                onClick={back}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{ color: '#7c3aed' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                onMouseLeave={e => (e.currentTarget.style.color = '#7c3aed')}
              >
                ← Back
              </button>
            )}
            <button
              onClick={advance}
              className="text-xs px-3 py-1 rounded font-medium transition-colors"
              style={{ background: '#7c3aed', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#6d28d9')}
              onMouseLeave={e => (e.currentTarget.style.background = '#7c3aed')}
            >
              {isLastStep ? (isOnboarding ? 'Done' : 'Finish') : 'Next →'}
            </button>
            {isOnboarding && !isLastStep && (
              <button
                onClick={() => { onMarkSeen(); onClose() }}
                className="text-xs px-2 py-1 transition-colors"
                style={{ color: '#6d28d9' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6d28d9')}
              >
                Skip
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
