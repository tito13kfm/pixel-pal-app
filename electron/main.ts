import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import Store from 'electron-store'
import pkg from 'electron-updater'
import log from 'electron-log'
const { autoUpdater } = pkg

autoUpdater.logger = log
log.transports.file.level = 'info'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface WindowBounds {
  width: number
  height: number
  x?: number
  y?: number
}

interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

function isValidConfig(obj: unknown): obj is AIConfig {
  if (!obj || typeof obj !== 'object') return false
  const c = obj as Record<string, unknown>
  return typeof c.baseUrl === 'string' && typeof c.apiKey === 'string' && typeof c.model === 'string'
}

const SAFE_STORE_KEY = 'aiConfigEncrypted'
let _memoryConfig: string | null = null

const store = new Store<{ windowBounds: WindowBounds; aiConfigEncrypted?: string }>()

function createWindow() {
  const bounds = store.get('windowBounds', { width: 1280, height: 900 })

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: !process.env.VITE_DEV_SERVER_URL,
    },
    backgroundColor: '#1a1a2e',
    title: 'PIXEL.PAL',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.on('close', () => {
    store.set('windowBounds', win.getBounds())
  })
}

ipcMain.handle('open-external', (_event, url: string) => {
  if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url)
  }
})

ipcMain.handle('ai-config:get', (): { config: AIConfig | null; encrypted: boolean } => {
  const encrypted = safeStorage.isEncryptionAvailable()
  if (!encrypted) {
    if (!_memoryConfig) return { config: null, encrypted: false }
    try {
      const parsed = JSON.parse(_memoryConfig)
      return { config: isValidConfig(parsed) ? parsed : null, encrypted: false }
    } catch {
      return { config: null, encrypted: false }
    }
  }
  const raw = store.get(SAFE_STORE_KEY)
  if (!raw) return { config: null, encrypted: true }
  try {
    const buf = Buffer.from(raw, 'base64')
    const json = safeStorage.decryptString(buf)
    const parsed = JSON.parse(json)
    return { config: isValidConfig(parsed) ? parsed : null, encrypted: true }
  } catch {
    store.delete(SAFE_STORE_KEY)
    return { config: null, encrypted: true }
  }
})

ipcMain.handle('ai-config:set', (_event, config: unknown): { encrypted: boolean } => {
  const encrypted = safeStorage.isEncryptionAvailable()
  if (!encrypted) {
    _memoryConfig = JSON.stringify(config)
    return { encrypted: false }
  }
  const json = JSON.stringify(config)
  const buf = safeStorage.encryptString(json)
  store.set(SAFE_STORE_KEY, buf.toString('base64'))
  return { encrypted: true }
})

autoUpdater.on('error', (err) => { log.error('updater error', err) })
autoUpdater.on('checking-for-update', () => { log.info('checking for update') })
autoUpdater.on('update-available', (info) => { log.info('update available', info) })
autoUpdater.on('update-not-available', (info) => { log.info('update not available', info) })
autoUpdater.on('download-progress', (p) => { log.info('download progress', p.percent) })
autoUpdater.on('update-downloaded', (info) => { log.info('update downloaded', info) })

app.whenReady().then(() => {
  createWindow()
  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => { log.error('checkForUpdatesAndNotify error', err) })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
