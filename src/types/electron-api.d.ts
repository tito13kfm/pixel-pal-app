declare global {
  interface Window {
    electronAPI: {
      openExternal: (url: string) => Promise<void>
      onUpdateAvailable: (cb: (info: { version: string; isPortable?: boolean; releaseUrl?: string }) => void) => void
      onUpdateReady: (cb: (info: { version: string }) => void) => void
      onUpdateError: (cb: (error: string) => void) => void
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>
      skipUpdate: (version: string) => Promise<void>
      openReleasesPage: () => Promise<void>
    }
    __TAURI_INTERNALS__: unknown
  }
}

export {}
