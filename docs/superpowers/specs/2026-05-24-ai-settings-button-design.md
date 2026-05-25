# AI Settings Button — Design Spec
Date: 2026-05-24

## Overview

Move AI settings gear button from tiny header to AI Assist tab action row. Add secure persistent storage for API key via safeStorage + IPC. Button pulses when unconfigured; collapses to icon-only once key is set.

---

## UI Changes

### Button removal
Remove current header gear button (App.tsx ~line 5347–5354). No replacement in header.

### New button — AI Assist action row
Location: end of action buttons row (after "Surprise Me"), same row, App.tsx ~line 5558–5566.

**Unconfigured state** (no API key stored):
```jsx
<button
  className="... gear-unconfigured pulsing-glow"
  onClick={() => setShowAISettings(true)}
>
  ⚙ AI Setup
</button>
```
- Shows icon + "AI Setup" text
- Purple pulse animation (same as brainstorm mockup: `pulse-glow 1.8s ease-in-out infinite`)

**Configured state** (API key present):
```jsx
<button
  className="... gear-solid icon-only"
  title="AI Settings"
  onClick={() => setShowAISettings(true)}
>
  ⚙
</button>
```
- Icon only, no text
- Solid purple, no animation
- `title` tooltip: "AI Settings"

### State variable
New boolean `aiConfigured` in App.tsx component state, derived from cached AI config on boot. Updates when settings panel closes.

---

## Storage Architecture

### Stack
- **electron-store** (already pinned at ^8.2.0): stores encrypted blob
- **Electron `safeStorage`**: OS-level encryption (Windows DPAPI)
- **IPC**: renderer ↔ main via `ipcRenderer.invoke` / `ipcMain.handle`
- **Preload**: `contextBridge.exposeInMainWorld('electronAPI', {...})`

### IPC channels

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `ai-config:get` | renderer → main | — | `AIConfig \| null` |
| `ai-config:set` | renderer → main | `AIConfig` | `void` |

### Main process (electron/main.ts)
On `ai-config:set`:
1. Serialize config to JSON string
2. `safeStorage.encryptString(json)` → Buffer → base64
3. `store.set('aiConfig', base64)`

On `ai-config:get`:
1. `store.get('aiConfig')` → base64 or undefined
2. If undefined: return `null`
3. `Buffer.from(base64, 'base64')` → `safeStorage.decryptString(buffer)` → JSON → parse → return

**safeStorage unavailable** (`safeStorage.isEncryptionAvailable() === false`):
- `ai-config:get` returns in-memory cached value (or `null` on fresh boot)
- `ai-config:set` stores in memory only, does NOT write to disk
- Returns `{ encrypted: false }` flag so renderer can show warning

### Migration (first run)
On `ai-config:get`, if store has no `aiConfig` key but localStorage had one:
- localStorage is renderer-side; migration must happen in renderer
- On first async load, if IPC returns `null`, check `localStorage.getItem('aiConfig')` (legacy key)
- If legacy exists: parse it, call `ai-config:set`, then remove legacy key
- One-time migration, silent

### Renderer cache pattern
Problem: `loadAIConfig()` in `palette.ts` is currently synchronous. IPC is async. Ripple through App.tsx would break too much.

Solution:
1. On app boot, `useEffect` calls `window.electronAPI.getAIConfig()` once
2. Stores result in React state: `const [aiConfig, setAiConfig] = useState<AIConfig | null>(null)`
3. Synchronous getter `getAIConfig()` in palette.ts replaced with React prop/context — OR keep as a module-level cache variable updated after the async load
4. When settings panel closes, re-fetch from IPC and update cache

Module-level cache approach (minimal ripple):
```ts
// src/lib/palette.ts
let _cachedConfig: AIConfig | null = null
export function getCachedAIConfig(): AIConfig | null { return _cachedConfig }
export function setCachedAIConfig(c: AIConfig | null): void { _cachedConfig = c }
export async function loadAIConfigAsync(): Promise<AIConfig | null> {
  const config = await window.electronAPI.getAIConfig()
  _cachedConfig = config
  return config
}
```

App.tsx calls `loadAIConfigAsync()` in a `useEffect` on mount. All existing callers of `loadAIConfig()` switch to `getCachedAIConfig()`.

---

## Preload (electron/preload.ts)

```ts
import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('electronAPI', {
  getAIConfig: () => ipcRenderer.invoke('ai-config:get'),
  setAIConfig: (config: unknown) => ipcRenderer.invoke('ai-config:set', config),
})
```

webPreferences: `sandbox: false` (required for ESM preload + ipcRenderer), `contextIsolation: true` (required for contextBridge security).

---

## Files Changed

| File | Change |
|---|---|
| `electron/main.ts` | Add `ipcMain.handle` for `ai-config:get` and `ai-config:set`; safeStorage encrypt/decrypt |
| `electron/preload.ts` | Add `getAIConfig`, `setAIConfig` channels (replace ping) |
| `src/lib/palette.ts` | Add `_cachedConfig`, `getCachedAIConfig`, `setCachedAIConfig`, `loadAIConfigAsync`; deprecate sync `loadAIConfig` |
| `src/App.tsx` | Remove header gear button; add new button to action row; add `aiConfigured` state; boot `useEffect`; migration logic |
| `src/settings/AISettingsPanel.tsx` | Use `setAIConfig` IPC on save instead of localStorage |

---

## Error Handling

- **safeStorage unavailable**: memory-only, show inline warning in AISettingsPanel ("Key stored in memory only — will be lost on restart")
- **Decrypt failure** (corrupt store entry): treat as `null`, clear the entry, prompt reconfiguration
- **IPC timeout**: not expected (local call); no special handling needed

---

## Out of Scope

- Web/browser fallback (Electron-only app, no web build target for settings)
- Multiple API key profiles
- Key rotation UI
