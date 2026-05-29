import { ONBOARDING_TOUR, TASK_GUIDES } from '../lib/tours'

interface TourLauncherProps {
  open: boolean
  onClose: () => void
  onStartGuide: (id: string) => void
}

export function TourPanel({ open, onClose, onStartGuide }: TourLauncherProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center"
         style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           style={{ width: 340, background: '#1e1b4b', border: '2px solid #7c3aed',
                    borderRadius: 10, padding: 16, boxShadow: '0 0 30px rgba(124,58,237,0.5)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-sm tracking-widest uppercase" style={{ color: '#c4b5fd' }}>Guides</span>
          <button onClick={onClose} title="Close guides" style={{ color: '#7c3aed', fontSize: 18 }}>✕</button>
        </div>
        <button onClick={() => onStartGuide('onboarding')}
                className="w-full text-left rounded px-3 py-2 text-sm font-medium mb-3"
                style={{ background: '#312e81', color: '#c4b5fd' }}>
          ▶ Quick tour ({ONBOARDING_TOUR.steps.length} steps)
        </button>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#6d28d9' }}>Show me how to...</div>
        <div className="grid grid-cols-2 gap-1.5">
          {TASK_GUIDES.map(g => (
            <button key={g.id} onClick={() => onStartGuide(g.id)}
                    className="text-left rounded px-2 py-1.5 text-xs"
                    style={{ color: '#a78bfa', background: '#241f52' }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
