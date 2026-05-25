import { invoke } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { openUrl } from '@tauri-apps/plugin-opener'
import { load } from '@tauri-apps/plugin-store'
import { relaunch } from '@tauri-apps/plugin-process'
import type { AIConfig } from './palette'

type UpdateCallback = (info: { version: string }) => void

const updateAvailableCallbacks: UpdateCallback[] = []
const updateReadyCallbacks: UpdateCallback[] = []
let pendingUpdate: Update | null = null

async function checkForUpdates(): Promise<void> {
  try {
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

    downloadUpdate: async (): Promise<void> => {
      if (!pendingUpdate) return
      const version = pendingUpdate.version
      await pendingUpdate.download()
      updateReadyCallbacks.forEach(cb => cb({ version }))
    },

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
