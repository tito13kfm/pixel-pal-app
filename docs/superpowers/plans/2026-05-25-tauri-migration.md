# Tauri v2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Electron 42 shell with Tauri v2, shrinking installers from ~130MB to 5-20MB while preserving all existing desktop features through the `window.electronAPI` bridge.

**Architecture:** Keep `window.electronAPI` interface identical so no renderer component code changes. New `src/lib/tauri-bridge.ts` implements that interface using `@tauri-apps/api` `invoke()` and `listen()`. Rust side provides two custom commands (`ai_config_get`, `ai_config_set`) plus four official Tauri plugins (updater, opener, window-state, store). Phase 0 is a go/no-go WebView compatibility gate before any native code is written.

**Tech Stack:** Tauri v2, Rust (stable), `keyring` crate (OS keychain), `@tauri-apps/api@^2`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-window-state`, `@tauri-apps/plugin-store`, `@tauri-apps/plugin-log`, `@tauri-apps/plugin-process`

---

## File Map

**Create:**
- `src-tauri/Cargo.toml` — Rust dependencies
- `src-tauri/build.rs` — Tauri build script (required)
- `src-tauri/src/main.rs` — desktop entry point
- `src-tauri/src/lib.rs` — app builder, plugin registration, command registration
- `src-tauri/src/commands/mod.rs` — module declarations
- `src-tauri/src/commands/ai_config.rs` — OS keychain read/write via `keyring` crate
- `src-tauri/tauri.conf.json` — app config, window defaults, updater pubkey
- `src-tauri/capabilities/default.json` — plugin permission grants
- `src/lib/tauri-bridge.ts` — implements `window.electronAPI` using Tauri APIs

**Modify:**
- `src/main.tsx` — call `initTauriBridge()` before React mounts
- `package.json` — remove Electron deps/scripts, add Tauri deps/scripts
- `.github/workflows/release.yml` — use tauri-action, add Rust, add Linux apt deps, add signing secrets
- `.github/workflows/ci.yml` — add Rust toolchain, add Linux apt deps, remove Electron compile

**Delete:**
- `electron/main.ts`
- `electron/preload.ts`
- `tsconfig.electron.json`

---

## Task 0: Verify Rust Toolchain

**Files:** none

- [ ] **Step 1: Check if Rust is installed**

```powershell
rustc --version
cargo --version
```

Expected: version lines like `rustc 1.77.0` and `cargo 1.77.0`. If not found, install:

```powershell
# Windows — download and run from https://rustup.rs
# Or via winget:
winget install Rustlang.Rustup
# Then restart terminal and verify again
rustc --version
```

- [ ] **Step 2: Ensure stable toolchain is default**

```powershell
rustup default stable
rustup update stable
```

Expected: `stable` in the output, no errors.

---

## Task 1: Phase 0 — WebView Compatibility Gate

**Purpose:** Load existing `dist/` in Tauri's WebView with zero native code. If the app renders and works, proceed. If not, fix CSS/CSP issues first.

**Files:**
- Create: `src-tauri/` (via `tauri init`)

- [ ] **Step 1: Install Tauri CLI**

```powershell
npm install -D @tauri-apps/cli@^2
```

Expected: resolves without error, `@tauri-apps/cli` appears in `devDependencies`.

- [ ] **Step 2: Build the Vite frontend**

```powershell
npm run build
```

Expected: `dist/` populated, no TypeScript or Vite errors.

- [ ] **Step 3: Scaffold Tauri**

```powershell
npx tauri init
```

Answer the prompts:
- App name: `PIXEL.PAL`
- Window title: `PIXEL.PAL`
- Web assets relative to `tauri.conf.json`: `../dist`
- Dev server URL: `http://localhost:5173`
- Frontend dev command: `npm run dev`
- Frontend build command: `npm run build`

Expected: `src-tauri/` created with `Cargo.toml`, `tauri.conf.json`, `src/main.rs`, `src/lib.rs`, `capabilities/`.

- [ ] **Step 4: Disable CSP in the generated tauri.conf.json**

Open `src-tauri/tauri.conf.json`. Find the `"app"` section and set CSP to null so external API calls are not blocked:

```json
"app": {
  "windows": [
    {
      "title": "PIXEL.PAL",
      "width": 1280,
      "height": 900
    }
  ],
  "security": {
    "csp": null
  }
}
```

- [ ] **Step 5: Run Phase 0 smoke test**

```powershell
npx tauri dev
```

Expected: Tauri window opens showing the PIXEL.PAL app. The native features (AI config, updater) will not work yet — the app falls back gracefully to localStorage which is correct.

**Check for:**
- CSS renders correctly (colors, layout, Tailwind classes)
- No JS errors in the console (open DevTools: right-click → Inspect)
- Fonts render correctly
- No CSP violation errors in console
- `base: './'` asset paths load correctly (images, if any)

**Gate:** If any of the above fail, fix them before proceeding to Task 2. If all pass, continue.

- [ ] **Step 6: Commit Phase 0 scaffold**

```powershell
git add src-tauri/ package.json package-lock.json
git commit -m "feat: phase 0 tauri scaffold + webview gate passed"
```

---

## Task 2: Full Rust Project Scaffold

Replace the `tauri init` placeholder `main.rs`/`lib.rs` with the real implementation structure and add all required Rust dependencies.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/build.rs`
- Modify: `src-tauri/src/main.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Replace Cargo.toml with full dependencies**

`src-tauri/Cargo.toml`:
```toml
[package]
name = "pixel-pal-app"
version = "0.5.0"
edition = "2021"

[lib]
name = "pixel_pal_app_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-updater = "2"
tauri-plugin-opener = "2"
tauri-plugin-window-state = "2"
tauri-plugin-store = "2"
tauri-plugin-log = "2"
tauri-plugin-process = "2"
keyring = { version = "3", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
```

- [ ] **Step 2: Create build.rs**

`src-tauri/build.rs`:
```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 3: Replace main.rs**

`src-tauri/src/main.rs`:
```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pixel_pal_app_lib::run();
}
```

- [ ] **Step 4: Replace lib.rs with full plugin registration**

`src-tauri/src/lib.rs`:
```rust
mod commands;

use tauri_plugin_log::{Target, TargetKind};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                ])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::ai_config::ai_config_get,
            commands::ai_config::ai_config_set,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Create commands/mod.rs**

`src-tauri/src/commands/mod.rs`:
```rust
pub mod ai_config;
```

- [ ] **Step 6: Verify Rust compiles**

```powershell
cd src-tauri && cargo check && cd ..
```

Expected: `Checking pixel-pal-app v0.5.0` with no errors. Warnings about unused code are fine at this stage — `ai_config` module is referenced but not written yet, so this step will fail until Task 3 is complete. Run this step again after Task 3.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/
git commit -m "feat: full rust scaffold with plugin registration"
```

---

## Task 3: AI Config Rust Command

Implements OS keychain read/write via the `keyring` crate. Returns `{ encrypted: true }` when keychain works, `{ encrypted: false }` when it fails (Linux without libsecret), allowing the TypeScript side to fall back to localStorage via existing logic in `ai.ts`.

**Files:**
- Create: `src-tauri/src/commands/ai_config.rs`

- [ ] **Step 1: Write the failing test first**

`src-tauri/src/commands/ai_config.rs` — write tests before implementation:
```rust
use serde::{Deserialize, Serialize};
use tauri::command;

const SERVICE: &str = "pixel-pal-app";
const USERNAME: &str = "ai-config";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AIConfig {
    pub provider: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    pub model: String,
}

#[derive(Serialize)]
pub struct AIConfigResult {
    pub config: Option<AIConfig>,
    pub encrypted: bool,
}

#[derive(Serialize)]
pub struct SetResult {
    pub encrypted: bool,
}

#[command]
pub fn ai_config_get() -> AIConfigResult {
    todo!()
}

#[command]
pub fn ai_config_set(_config: AIConfig) -> SetResult {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_config_round_trips_json() {
        let config = AIConfig {
            provider: "openai".into(),
            base_url: "https://api.openai.com/v1".into(),
            api_key: "sk-test-key".into(),
            model: "gpt-4o".into(),
        };
        let json = serde_json::to_string(&config).unwrap();
        // Verify camelCase keys match what TypeScript sends
        assert!(json.contains("\"baseUrl\""), "baseUrl key must be camelCase");
        assert!(json.contains("\"apiKey\""), "apiKey key must be camelCase");
        let parsed: AIConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
```

- [ ] **Step 2: Run the test to confirm it compiles and passes**

```powershell
cd src-tauri && cargo test commands::ai_config::tests && cd ..
```

Expected: `test commands::ai_config::tests::ai_config_round_trips_json ... ok`

(The `todo!()` stubs won't panic in tests since only `ai_config_round_trips_json` is called, which doesn't invoke those functions.)

- [ ] **Step 3: Implement ai_config_get**

Replace `pub fn ai_config_get()` stub:
```rust
#[command]
pub fn ai_config_get() -> AIConfigResult {
    let entry = match keyring::Entry::new(SERVICE, USERNAME) {
        Ok(e) => e,
        Err(_) => return AIConfigResult { config: None, encrypted: false },
    };
    match entry.get_password() {
        Ok(json) => {
            let config = serde_json::from_str::<AIConfig>(&json).ok();
            AIConfigResult { config, encrypted: true }
        }
        Err(keyring::Error::NoEntry) => AIConfigResult { config: None, encrypted: true },
        Err(_) => AIConfigResult { config: None, encrypted: false },
    }
}
```

- [ ] **Step 4: Implement ai_config_set**

Replace `pub fn ai_config_set(_config: AIConfig)` stub:
```rust
#[command]
pub fn ai_config_set(config: AIConfig) -> SetResult {
    let entry = match keyring::Entry::new(SERVICE, USERNAME) {
        Ok(e) => e,
        Err(_) => return SetResult { encrypted: false },
    };
    let json = match serde_json::to_string(&config) {
        Ok(j) => j,
        Err(_) => return SetResult { encrypted: false },
    };
    match entry.set_password(&json) {
        Ok(_) => SetResult { encrypted: true },
        Err(_) => SetResult { encrypted: false },
    }
}
```

- [ ] **Step 5: Run tests again to confirm still pass**

```powershell
cd src-tauri && cargo test && cd ..
```

Expected: `test result: ok. 1 passed`

- [ ] **Step 6: Verify Rust compiles cleanly**

```powershell
cd src-tauri && cargo check && cd ..
```

Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/src/commands/
git commit -m "feat: ai_config rust commands with keyring crate"
```

---

## Task 4: Tauri Config & Capabilities

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Replace tauri.conf.json with full config**

`src-tauri/tauri.conf.json`:
```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "PIXEL.PAL",
  "version": "0.5.0",
  "identifier": "com.pixelpal.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "PIXEL.PAL",
        "width": 1280,
        "height": 900,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "publisher": "Tim Kurash"
  },
  "plugins": {
    "updater": {
      "pubkey": "PLACEHOLDER_REPLACE_IN_TASK_12",
      "endpoints": [
        "https://github.com/tito13kfm/pixel-pal-app/releases/latest/download/latest.json"
      ]
    }
  }
}
```

Note: `pubkey` is a placeholder replaced in Task 12 after keypair generation. The app builds fine in dev without a valid key.

- [ ] **Step 2: Write capabilities/default.json**

Check if `src-tauri/capabilities/default.json` was generated by `tauri init`. If so, replace its contents. If not, create it:

`src-tauri/capabilities/default.json`:
```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capabilities for PIXEL.PAL",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "opener:default",
    "updater:default",
    "window-state:default",
    "store:default",
    "log:default",
    "process:default"
  ]
}
```

- [ ] **Step 3: Verify Rust still compiles with new config**

```powershell
cd src-tauri && cargo check && cd ..
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri/tauri.conf.json src-tauri/capabilities/
git commit -m "feat: tauri config and capabilities"
```

---

## Task 5: Install JS Packages

**Files:**
- Modify: `package.json` (devDependencies and dependencies)

- [ ] **Step 1: Install Tauri JS packages**

```powershell
npm install @tauri-apps/api@^2 @tauri-apps/plugin-updater@^2 @tauri-apps/plugin-opener@^2 @tauri-apps/plugin-window-state@^2 @tauri-apps/plugin-store@^2 @tauri-apps/plugin-log@^2 @tauri-apps/plugin-process@^2
```

Expected: all packages resolve without error.

- [ ] **Step 2: Verify package.json has the new deps**

Check `package.json` dependencies section contains all seven `@tauri-apps/*` packages.

- [ ] **Step 3: Commit**

```powershell
git add package.json package-lock.json
git commit -m "feat: add tauri js packages"
```

---

## Task 6: Write tauri-bridge.ts

Implements the full `window.electronAPI` interface using Tauri APIs. This is the single wiring point — no renderer code changes.

**Files:**
- Create: `src/lib/tauri-bridge.ts`

- [ ] **Step 1: Write tauri-bridge.ts**

`src/lib/tauri-bridge.ts`:
```typescript
import { invoke } from '@tauri-apps/api/core'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { openUrl } from '@tauri-apps/plugin-opener'
import { load } from '@tauri-apps/plugin-store'
import { relaunch } from '@tauri-apps/plugin-process'

interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

type UpdateCallback = (info: { version: string }) => void

const updateAvailableCallbacks: UpdateCallback[] = []
const updateReadyCallbacks: UpdateCallback[] = []
let pendingUpdate: Update | null = null

async function checkForUpdates(): Promise<void> {
  try {
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
    getAIConfig: (): Promise<{ config: AIConfig | null; encrypted: boolean }> =>
      invoke('ai_config_get'),

    setAIConfig: (config: AIConfig): Promise<{ encrypted: boolean }> =>
      invoke('ai_config_set', { config }),

    openExternal: (url: string): Promise<void> => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        return openUrl(url)
      }
      return Promise.resolve()
    },

    onUpdateAvailable: (cb: UpdateCallback): void => {
      updateAvailableCallbacks.push(cb)
    },

    onUpdateReady: (cb: UpdateCallback): void => {
      updateReadyCallbacks.push(cb)
    },

    downloadUpdate: async (): Promise<void> => {
      if (!pendingUpdate) return
      await pendingUpdate.download()
      updateReadyCallbacks.forEach(cb => cb({ version: pendingUpdate!.version }))
    },

    installUpdate: async (): Promise<void> => {
      if (!pendingUpdate) return
      await pendingUpdate.install()
      await relaunch()
    },

    skipUpdate: async (version: string): Promise<void> => {
      const store = await load('settings.json')
      await store.set('skippedVersion', version)
      await store.save()
      pendingUpdate = null
    },
  }

  ;(window as Window & { electronAPI: typeof bridge }).electronAPI = bridge

  // Kick off update check on startup (replaces autoUpdater in Electron main)
  checkForUpdates()
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors. If you see errors about `@tauri-apps/*` types, verify the packages installed correctly in Task 5.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/tauri-bridge.ts
git commit -m "feat: tauri-bridge implements window.electronAPI"
```

---

## Task 7: Wire Bridge in main.tsx

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Add bridge initialization to main.tsx**

Replace the entire contents of `src/main.tsx`:
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initTauriBridge } from './lib/tauri-bridge'

// Initialize Tauri bridge before React mounts so window.electronAPI
// is available synchronously when App.tsx first renders
if (window.__TAURI_INTERNALS__) {
  initTauriBridge()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

The `window.__TAURI_INTERNALS__` guard ensures the bridge only runs inside Tauri (not in a plain browser or during CI Vite builds).

- [ ] **Step 2: Add __TAURI_INTERNALS__ to type declarations**

Open `src/types/electron-api.d.ts` and add below the existing declarations:
```typescript
declare global {
  interface Window {
    __TAURI_INTERNALS__: unknown
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add src/main.tsx src/types/electron-api.d.ts
git commit -m "feat: wire tauri bridge in main.tsx"
```

---

## Task 8: Update package.json Scripts and Remove Electron

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update scripts in package.json**

Replace the `"scripts"` section:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "tauri": "tauri",
  "tauri:dev": "tauri dev",
  "dist": "tauri build",
  "test:js": "cd tests && for %f in (test_*.js) do node %f",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 2: Remove Electron runtime dependencies**

```powershell
npm uninstall electron-log electron-store electron-updater
```

- [ ] **Step 3: Remove Electron dev dependencies**

```powershell
npm uninstall electron electron-builder cross-env wait-on concurrently
```

- [ ] **Step 4: Remove the electron-builder "build" field from package.json**

Open `package.json`. Delete the entire `"build"` top-level field (the one with `appId`, `productName`, `directories`, `win`, `mac`, `linux`, `nsis`, `publish`). This is the electron-builder config and is no longer needed.

- [ ] **Step 5: Verify package.json is valid JSON**

```powershell
node -e "require('./package.json'); console.log('valid')"
```

Expected: `valid`

- [ ] **Step 6: Verify Vite build still works**

```powershell
npm run build
```

Expected: dist/ built successfully, no TypeScript errors.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: remove electron deps, update scripts for tauri"
```

---

## Task 9: Delete Electron Files

**Files:**
- Delete: `electron/main.ts`
- Delete: `electron/preload.ts`
- Delete: `tsconfig.electron.json`

- [ ] **Step 1: Delete Electron source files**

```powershell
git rm electron/main.ts electron/preload.ts tsconfig.electron.json
```

- [ ] **Step 2: Verify TypeScript still compiles**

```powershell
npx tsc --noEmit
```

Expected: no errors. The main `tsconfig.json` only includes `"src"` so deleting `electron/` has no effect.

- [ ] **Step 3: Verify Vite build still works**

```powershell
npm run build
```

Expected: success.

- [ ] **Step 4: Commit**

```powershell
git commit -m "chore: delete electron source files"
```

---

## Task 10: Dev Smoke Test

Full manual verification that all features work in Tauri dev mode.

**Files:** none

- [ ] **Step 1: Start Tauri dev mode**

```powershell
npm run tauri:dev
```

Expected: Tauri window opens with PIXEL.PAL app. May take a few minutes on first run while Rust compiles.

- [ ] **Step 2: Verify AI config save and load**

1. Open AI Settings panel
2. Enter a test API key (any string)
3. Save it
4. Close and reopen the app (`npm run tauri:dev` again)
5. Open AI Settings — key should be present

Expected: key persists across restarts via OS keychain.

- [ ] **Step 3: Verify open-external links**

In the AI Settings panel, click any provider link (e.g. OpenAI docs link).

Expected: link opens in the system browser, not inside the Tauri window.

- [ ] **Step 4: Verify window size persists**

1. Resize the Tauri window
2. Close it
3. Reopen (`npm run tauri:dev`)

Expected: window reopens at the same size.

- [ ] **Step 5: Verify core palette features**

1. Enter a hex color → palette generates
2. Shuffle a ramp
3. Pin a shade
4. Export palette (plain text)

Expected: all work exactly as before.

- [ ] **Step 6: Check browser console for errors**

Open DevTools (right-click → Inspect → Console). Verify no errors or warnings related to the migration.

- [ ] **Step 7: Commit smoke test milestone**

```powershell
git commit --allow-empty -m "chore: smoke test passed - tauri dev fully functional"
```

---

## Task 11: Update CI Workflows

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Replace release.yml**

`.github/workflows/release.yml`:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            platform: win
          - os: macos-latest
            platform: mac
          - os: ubuntu-latest
            platform: linux

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install Linux dependencies
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev patchelf libsecret-1-dev

      - name: Install frontend dependencies
        run: npm ci

      - name: Build and release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: v__VERSION__
          releaseName: 'PIXEL.PAL v__VERSION__'
          releaseBody: ''
          releaseDraft: false
          prerelease: false
```

- [ ] **Step 2: Replace ci.yml**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install Linux dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev patchelf libsecret-1-dev

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npx tsc --noEmit

      - name: Build frontend
        run: npm run build

      - name: Cargo check
        run: cd src-tauri && cargo check
```

Note: `cargo check` on CI validates the Rust code compiles without doing a full `tauri build` (which takes 10+ minutes on first run).

- [ ] **Step 3: Commit**

```powershell
git add .github/workflows/
git commit -m "ci: update workflows for tauri v2"
```

---

## Task 12: Generate Ed25519 Keypair for Updater

One-time setup. The private key goes into GitHub Actions secrets. The public key goes into `tauri.conf.json`.

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Generate the keypair**

```powershell
npx tauri signer generate -w ~/.tauri/pixel-pal.key
```

Expected output includes:
```
Public key: <base64 string>
Private key saved to: ~/.tauri/pixel-pal.key
```

Copy both values. **Store the private key and passphrase securely** — if lost, users on old versions cannot update to new ones.

- [ ] **Step 2: Add public key to tauri.conf.json**

Open `src-tauri/tauri.conf.json`. Replace `"PLACEHOLDER_REPLACE_IN_TASK_12"` in the `plugins.updater.pubkey` field with the actual base64 public key from Step 1.

- [ ] **Step 3: Add GitHub Actions secrets**

Go to `https://github.com/tito13kfm/pixel-pal-app/settings/secrets/actions` and add:
- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/pixel-pal.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the passphrase entered during generation

- [ ] **Step 4: Commit tauri.conf.json with public key**

```powershell
git add src-tauri/tauri.conf.json
git commit -m "feat: add updater signing public key"
```

---

## Task 13: Version Bump

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update version to 0.5.0 in package.json**

In `package.json`, change `"version": "0.4.0"` to `"version": "0.5.0"`.

- [ ] **Step 2: Verify tauri.conf.json version**

`src-tauri/tauri.conf.json` already has `"version": "0.5.0"` from Task 4. Confirm it matches.

- [ ] **Step 3: Verify Cargo.toml version**

`src-tauri/Cargo.toml` already has `version = "0.5.0"` from Task 2. Confirm it matches.

- [ ] **Step 4: Commit**

```powershell
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump to v0.5.0"
```

---

## Task 14: Linux System Requirements Documentation

**Files:**
- Modify: `README.md` (create if absent)

- [ ] **Step 1: Add Linux requirements section to README**

Find or create `README.md` in the repo root. Add this section:

```markdown
## Linux System Requirements

PIXEL.PAL on Linux requires the following system libraries:

- **WebKitGTK 4.1** (`libwebkit2gtk-4.1-0`) — the browser engine
- **libsecret 1.x** (`libsecret-1-0`) — for encrypted API key storage

Install on Debian/Ubuntu:
```bash
sudo apt install libwebkit2gtk-4.1-0 libsecret-1-0
```

Install on Fedora:
```bash
sudo dnf install webkit2gtk4.1 libsecret
```

**Tested on:** Ubuntu 22.04+, Fedora 38+, Debian 12+

If your distro ships WebKitGTK < 4.1 or has no libsecret support, the app may not run. We do not provide support for unsupported configurations. If libsecret is absent, API keys will be stored unencrypted with an in-app warning.
```

- [ ] **Step 2: Commit**

```powershell
git add README.md
git commit -m "docs: linux system requirements for tauri"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Full TypeScript check**

```powershell
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Full Rust check**

```powershell
cd src-tauri && cargo test && cd ..
```

Expected: `test result: ok. 1 passed`

- [ ] **Step 3: Vite build**

```powershell
npm run build
```

Expected: `dist/` built, no errors.

- [ ] **Step 4: JS unit tests**

```powershell
foreach ($f in Get-ChildItem tests\test_*.js) { node $f }
```

Expected: all 34 unit tests pass unchanged.

- [ ] **Step 5: One final tauri dev run**

```powershell
npm run tauri:dev
```

Do a quick end-to-end check: load app, generate a palette, verify AI settings panel, confirm window state persists on restart.

- [ ] **Step 6: Confirm macOS notarization status**

Before merging or shipping a Mac release: verify whether the current Electron builds on `master` are notarized (check the `release.yml` on master for `apple-id`, `apple-id-password`, or `team-id` secrets in the Electron build step). If not notarized, that is a pre-existing gap — Tauri doesn't change the requirement. Note the status and address it before the first public Tauri Mac release.

- [ ] **Step 7: Push branch**

```powershell
git push -u origin feat/tauri-migration
```
