// src/lib/env.ts
//
// Build-time and runtime environment helpers.
//
// IS_WEB: build-time flag, true only when built with VITE_BUILD_TARGET=web.
//   Used to drive UI hiding, provider-list filtering, tree-shaking of
//   Tauri-only code paths. Set by vite.config.ts via `define`.
//
// isTauri(): runtime check. True when the app is loaded inside a Tauri
//   window (production Tauri build OR `tauri dev`). False in plain browser
//   (vite dev server, vite preview, GH Pages).

export const IS_WEB: boolean = import.meta.env.VITE_WEB === true

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
