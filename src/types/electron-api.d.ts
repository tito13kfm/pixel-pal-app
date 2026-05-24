declare global {
  interface Window {
    electronAPI: {
      getAIConfig: () => Promise<{ config: { provider: string; baseUrl: string; apiKey: string; model: string } | null; encrypted: boolean }>
      setAIConfig: (config: { provider: string; baseUrl: string; apiKey: string; model: string }) => Promise<{ encrypted: boolean }>
      openExternal: (url: string) => Promise<void>
    }
  }
}

export {}
