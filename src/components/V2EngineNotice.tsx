import { useState, useEffect } from 'react'

const DISMISS_KEY = 'v2EngineNoticeDismissed'

/**
 * True when a loaded saved-palette payload predates the v2 engine and will be
 * auto-migrated (its look may change). The save path always writes
 * engineVersion: 2, so any payload lacking exactly 2 is a pre-v2 save.
 */
export function isPreV2Palette(parsed: { engineVersion?: unknown } | null | undefined): boolean {
  return !!parsed && (parsed as { engineVersion?: unknown }).engineVersion !== 2
}

export function V2EngineNotice({ show }: { show: boolean }) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (!show || dismissed) return null

  return (
    <div className="bg-cyan-950/50 border border-cyan-600/40 rounded p-3 mb-3 text-xs text-cyan-200 font-mono leading-relaxed">
      <div className="flex justify-between items-start mb-1">
        <span className="font-bold text-cyan-300">⚙ SHADING ENGINE UPDATED</span>
        <button
          onClick={handleDismiss}
          className="text-cyan-400/70 hover:text-cyan-300 leading-none ml-2"
          aria-label="Dismiss notice"
        >
          ✕
        </button>
      </div>
      <p>
        Palettes now use the updated shading engine; older saves may look
        slightly different.
      </p>
    </div>
  )
}
