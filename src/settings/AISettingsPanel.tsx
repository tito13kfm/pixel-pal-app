import { useState } from 'react'
import {
  PROVIDER_PRESETS,
  getCachedAIConfig,
  saveAIConfigAsync,
} from '../lib/ai'
import type { AIConfig } from '../lib/palette'

interface Props {
  onClose: () => void
}

export function AISettingsPanel({ onClose }: Props) {
  const saved = getCachedAIConfig()
  const [provider, setProvider] = useState(saved?.provider ?? 'openai')
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? PROVIDER_PRESETS.openai.baseUrl)
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '')
  const [model, setModel] = useState(saved?.model ?? PROVIDER_PRESETS.openai.modelExample)
  const [showInstructions, setShowInstructions] = useState(false)
  const [saved_, setSaved_] = useState(false)

  const preset = PROVIDER_PRESETS[provider] ?? PROVIDER_PRESETS.custom

  function handleProviderChange(p: string) {
    setProvider(p)
    const pre = PROVIDER_PRESETS[p]
    if (pre) {
      setBaseUrl(pre.baseUrl)
      setModel(pre.modelExample)
    }
    setShowInstructions(false)
  }

  async function handleSave() {
    const cfg: AIConfig = { provider, baseUrl, apiKey, model }
    await saveAIConfigAsync(cfg)
    setSaved_(true)
    setTimeout(() => setSaved_(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-cyan-500/30 rounded-lg p-6 w-full max-w-md text-zinc-100"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-cyan-400 font-mono font-bold text-sm tracking-widest">▸ AI SETTINGS ▸</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">✕</button>
        </div>

        {/* Provider selector */}
        <label className="block text-xs text-zinc-400 mb-1 font-mono">PROVIDER</label>
        <select
          value={provider}
          onChange={e => handleProviderChange(e.target.value)}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono mb-3 text-zinc-100"
        >
          {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
            <option key={key} value={key}>{p.label}</option>
          ))}
        </select>

        {/* Base URL */}
        <label className="block text-xs text-zinc-400 mb-1 font-mono">BASE URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://api.example.com/v1"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono mb-3 text-zinc-100"
        />

        {/* API Key */}
        <label className="block text-xs text-zinc-400 mb-1 font-mono">API KEY</label>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={preset.apiKeyExample}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono mb-3 text-zinc-100"
        />

        {/* Model */}
        <label className="block text-xs text-zinc-400 mb-1 font-mono">MODEL</label>
        <input
          type="text"
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder={preset.modelExample || 'model-name'}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm font-mono mb-4 text-zinc-100"
        />

        {/* Instructions toggle */}
        {preset.hint && (
          <button
            onClick={() => setShowInstructions(v => !v)}
            className="text-xs text-cyan-500/70 hover:text-cyan-400 font-mono mb-3 block"
          >
            {showInstructions ? '▾' : '▸'} How do I set this up?
          </button>
        )}
        {showInstructions && preset.hint && (
          <p className="text-xs text-zinc-400 font-mono mb-4 bg-zinc-800 rounded p-3 leading-relaxed">
            {preset.hint.split(/(https?:\/\/[^\s.]+(?:\.[^\s.]+)*(?:\/[^\s]*)?(?=[\s.]|$))/g).map((part, i) =>
              part.match(/^https?:\/\//) ? (
                <a key={i} href={part} onClick={e => { e.preventDefault(); window.electronAPI?.openExternal(part) }}
                  className="text-cyan-400 underline hover:text-cyan-300 cursor-pointer">{part}</a>
              ) : part
            )}
          </p>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-sm rounded py-2 transition-colors"
        >
          {saved_ ? '✓ SAVED' : 'SAVE'}
        </button>
      </div>
    </div>
  )
}
