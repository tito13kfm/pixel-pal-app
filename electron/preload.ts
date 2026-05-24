import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  getAIConfig: () => ipcRenderer.invoke('ai-config:get'),
  setAIConfig: (config: unknown) => ipcRenderer.invoke('ai-config:set', config),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
})

