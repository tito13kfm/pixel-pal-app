/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB?: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
