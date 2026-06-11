/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// Global type for the async key-value storage shim installed in src/App.tsx
// (and, on desktop, backed by the Tauri plugin-store). Optional because the
// shim is installed conditionally at runtime; every call site guards on
// `window.storage` before use. Method surface matches the shim exactly:
// get/set/delete/list (see the `window.storage` block in src/App.tsx).
//
// This file is an ambient script (no top-level import/export), so this bare
// `interface Window` merges into the global Window type. Do NOT add an
// `export {}` here, it would turn the file into a module and demote the
// ImportMetaEnv/ImportMeta augmentations above to module-local.
interface Window {
  storage?: {
    get: (key: string) => Promise<{ value: string } | null>
    set: (key: string, value: string) => Promise<unknown>
    delete: (key: string) => Promise<unknown>
    list: (prefix: string) => Promise<{ keys: string[] }>
  }
}
