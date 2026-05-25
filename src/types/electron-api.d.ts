declare global {
  interface Window {
    electronAPI: {
      getAIConfig: () => Promise<{ config: { provider: string; baseUrl: string; apiKey: string; model: string } | null; encrypted: boolean }>
      setAIConfig: (config: { provider: string; baseUrl: string; apiKey: string; model: string }) => Promise<{ encrypted: boolean }>
      openExternal: (url: string) => Promise<void>
      onUpdateAvailable: (cb: (info: { version: string }) => void) => void
      onUpdateReady: (cb: (info: { version: string }) => void) => void
      onUpdateError: (cb: (error: string) => void) => void
      downloadUpdate: () => Promise<void>
      installUpdate: () => Promise<void>
      skipUpdate: (version: string) => Promise<void>
    }
    __TAURI_INTERNALS__: unknown
  }
}

export {}
