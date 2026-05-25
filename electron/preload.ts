import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAIConfig: () => ipcRenderer.invoke('ai-config:get'),
  setAIConfig: (config: unknown) => ipcRenderer.invoke('ai-config:set', config),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onUpdateAvailable: (cb: (info: { version: string }) => void) => {
    ipcRenderer.on('update:available', (_e, info) => cb(info))
  },
  onUpdateReady: (cb: (info: { version: string }) => void) => {
    ipcRenderer.on('update:ready', (_e, info) => cb(info))
  },
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  skipUpdate: (version: string) => ipcRenderer.invoke('update:skip', version),
})

