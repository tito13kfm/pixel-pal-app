import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { openUrl } from '@tauri-apps/plugin-opener'
import { load } from '@tauri-apps/plugin-store'
import { relaunch } from '@tauri-apps/plugin-process'
import type { AIConfig } from './palette'

export type UpdateInfo = { version: string; isPortable?: boolean; releaseUrl?: string }
type UpdateCallback = (info: UpdateInfo) => void

const RELEASES_PAGE = 'https://github.com/tito13kfm/pixel-pal-app/releases'
const LATEST_RELEASE_API =
  'https://api.github.com/repos/tito13kfm/pixel-pal-app/releases/latest'

const updateAvailableCallbacks: UpdateCallback[] = []
const updateReadyCallbacks: UpdateCallback[] = []
const updateErrorCallbacks: ((error: string) => void)[] = []
let pendingUpdate: Update | null = null
let portableLatestUrl: string | null = null

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

async function checkForUpdatesPortable(): Promise<void> {
  const current = await getVersion()
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const data = (await res.json()) as { tag_name?: string; html_url?: string }
  if (!data.tag_name) return
  const latest = data.tag_name.replace(/^v/, '')
  if (!isNewerVersion(latest, current)) return
  const store = await load('settings.json')
  const skipped = await store.get<string>('skippedVersion')
  if (skipped === latest) return
  portableLatestUrl = data.html_url ?? RELEASES_PAGE
  updateAvailableCallbacks.forEach(cb =>
    cb({ version: latest, isPortable: true, releaseUrl: portableLatestUrl ?? RELEASES_PAGE })
  )
}

async function checkForUpdates(): Promise<void> {
  try {
    const portable = await invoke<boolean>('runtime_is_portable').catch(() => false)
    if (portable) {
      await checkForUpdatesPortable()
      return
    }
    const update = await check()
    if (!update) return
    const store = await load('settings.json')
    const skipped = await store.get<string>('skippedVersion')
    if (skipped === update.version) return
    pendingUpdate = update
    updateAvailableCallbacks.forEach(cb => cb({ version: update.version }))
  } catch (e) {
    console.error('[tauri-bridge] update check failed:', e)
  }
}

export function initTauriBridge(): void {
  const bridge = {
    getAIConfig: () =>
      invoke<{ config: AIConfig | null; encrypted: boolean }>('ai_config_get'),

    setAIConfig: (config: AIConfig) =>
      invoke<{ encrypted: boolean }>('ai_config_set', { config }),

    openExternal: (url: string): Promise<void> => {
      if (url.startsWith('https://') || url.startsWith('http://'))
        return openUrl(url)
      return Promise.resolve()
    },

    onUpdateAvailable: (cb: UpdateCallback): void => {
      updateAvailableCallbacks.push(cb)
    },

    onUpdateReady: (cb: UpdateCallback): void => {
      updateReadyCallbacks.push(cb)
    },

    onUpdateError: (cb: (error: string) => void): void => {
      updateErrorCallbacks.push(cb)
    },

    downloadUpdate: async (): Promise<void> => {
      if (!pendingUpdate) return
      const version = pendingUpdate.version
      try {
        await pendingUpdate.download()
        updateReadyCallbacks.forEach(cb => cb({ version }))
      } catch (e) {
        console.error('[tauri-bridge] download failed:', e)
        pendingUpdate = null
        const msg = e instanceof Error ? e.message : String(e)
        updateErrorCallbacks.forEach(cb => cb(msg))
      }
    },

    openReleasesPage: (): Promise<void> => openUrl(portableLatestUrl ?? RELEASES_PAGE),

    installUpdate: async (): Promise<void> => {
      if (!pendingUpdate) return
      await pendingUpdate.install()
      await relaunch()
    },

    skipUpdate: async (version: string): Promise<void> => {
      const store = await load('settings.json')
      await store.set('skippedVersion', version)
      await store.save()
      pendingUpdate = null
    },
  }

  ;(window as unknown as { electronAPI: typeof bridge }).electronAPI = bridge
  checkForUpdates()
}
