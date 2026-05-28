import { useState, useEffect } from 'react'

const DISMISS_KEY = 'webKeyWarningDismissed'

export function WebKeyWarning() {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
  }, [])

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div className="bg-amber-950/50 border border-amber-600/40 rounded p-3 mb-3 text-xs text-amber-200 font-mono leading-relaxed">
      <div className="flex justify-between items-start mb-1">
        <span className="font-bold text-amber-300">⚠ KEY STORAGE NOTICE</span>
        <button
          onClick={handleDismiss}
          className="text-amber-400/70 hover:text-amber-300 leading-none ml-2"
          aria-label="Dismiss warning"
        >
          ✕
        </button>
      </div>
      <p>
        Your API key is stored in this browser's localStorage. Anyone with
        access to this browser profile can read it. For maximum safety
        (OS keychain storage), use the desktop app.
      </p>
    </div>
  )
}
