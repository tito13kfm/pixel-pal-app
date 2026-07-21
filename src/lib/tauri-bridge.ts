import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { openUrl } from '@tauri-apps/plugin-opener'
import { load } from '@tauri-apps/plugin-store'
import { relaunch } from '@tauri-apps/plugin-process'

export type UpdateInfo = { version: string; isPortable?: boolean; releaseUrl?: string }
type UpdateCallback = (info: UpdateInfo) => void

const RELEASES_PAGE = 'https://github.com/tito13kfm/pixel-pal-app/releases'
const LATEST_RELEASE_API =
  'https://api.github.com/repos/tito13kfm/pixel-pal-app/releases/latest'
// Portable update-check cache TTL. The unauthenticated GitHub API allows
// 60 requests/hour per IP. Single users won't bump that, but a power user
// who restarts the app frequently (or anyone behind shared NAT) can. Cache
// the result for an hour so the API gets hit at most once per session-ish.
const PORTABLE_CHECK_TTL_MS = 60 * 60 * 1000
type PortableCheckCache = { checkedAt: number; tagName: string; htmlUrl: string }

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

async function fetchLatestRelease(
  store: Awaited<ReturnType<typeof load>>
): Promise<{ tagName: string; htmlUrl: string } | null> {
  const cached = await store.get<PortableCheckCache>('portableCheckCache')
  if (cached && Date.now() - cached.checkedAt < PORTABLE_CHECK_TTL_MS) {
    return { tagName: cached.tagName, htmlUrl: cached.htmlUrl }
  }
  const res = await fetch(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) {
    // Network or rate-limit failure: fall back to stale cache if we have one
    // so the user still sees a (possibly outdated) prompt rather than a silent
    // miss. If no cache, give up; checkForUpdatesPortable handles the null.
    if (cached) return { tagName: cached.tagName, htmlUrl: cached.htmlUrl }
    throw new Error(`GitHub API ${res.status}`)
  }
  const data = (await res.json()) as { tag_name?: string; html_url?: string }
  if (!data.tag_name) return null
  const fresh: PortableCheckCache = {
    checkedAt: Date.now(),
    tagName: data.tag_name,
    htmlUrl: data.html_url ?? RELEASES_PAGE,
  }
  await store.set('portableCheckCache', fresh)
  await store.save()
  return { tagName: fresh.tagName, htmlUrl: fresh.htmlUrl }
}

async function checkForUpdatesPortable(): Promise<void> {
  const current = await getVersion()
  const store = await load('settings.json')
  const latestRelease = await fetchLatestRelease(store)
  if (!latestRelease) return
  const latest = latestRelease.tagName.replace(/^v/, '')
  if (!isNewerVersion(latest, current)) return
  const skipped = await store.get<string>('skippedVersion')
  if (skipped === latest) return
  portableLatestUrl = latestRelease.htmlUrl
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
      try {
        await pendingUpdate.install()
        await relaunch()
      } catch (e) {
        console.error('[tauri-bridge] install failed:', e)
        pendingUpdate = null
        const msg = e instanceof Error ? e.message : String(e)
        updateErrorCallbacks.forEach(cb => cb(msg))
      }
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
