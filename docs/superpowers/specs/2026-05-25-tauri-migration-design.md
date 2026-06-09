# Tauri Migration Design

**Date:** 2026-05-25
**Branch:** `feat/tauri-migration`
**Scope:** Desktop only. Replace Electron 42 with Tauri v2. Mobile (Capacitor) deferred.

---

## Goal

Swap the Electron shell for Tauri v2 to dramatically reduce installer size while preserving all existing desktop features. Renderer (Vite + React) is unchanged. The `window.electronAPI` interface is preserved exactly so no renderer component code is touched.

**Expected size reduction:**
- Windows: ~130MB → 5-10MB (WebView2 pre-installed on Win10+)
- macOS: ~130MB → 10-20MB
- Linux AppImage: ~130MB → ~5MB (WebKitGTK required on host; see Linux Requirements)

---

## Architecture

### What changes

```
electron/           → deleted
dist-electron/      → deleted (build artifact)
src-tauri/          → new Tauri v2 app shell
  src/
    main.rs
    commands/
      ai_config.rs
      updater.rs
      shell.rs
  tauri.conf.json
  Cargo.toml
src/lib/tauri-bridge.ts   → new: assigns window.electronAPI at startup
```

### What does not change

- `src/` entirely (App.tsx, ai.ts, settings/, lib/, etc.)
- `src/types/electron-api.d.ts` - same TypeScript interface
- `vite.config.ts`, Tailwind, PostCSS
- `tests/` unit tests and JS test infrastructure
- `tests/e2e/` spec files (runner changes, specs stay)

### Bridge pattern

`src/lib/tauri-bridge.ts` wraps both `invoke()` (call-response) and `listen()` (push events) from `@tauri-apps/api` and constructs an object matching the `window.electronAPI` shape. Assigned to `window.electronAPI` in `src/main.tsx` before React mounts. This is the only wiring point.

```
Renderer component
  → window.electronAPI.getAIConfig()       (unchanged call site)
    → tauri-bridge.ts
      → invoke('ai_config_get')            (new Tauri command)
        → src-tauri/src/commands/ai_config.rs
          → keyring crate → OS keychain

Renderer component
  → window.electronAPI.onUpdateAvailable(cb)   (unchanged call site)
    → tauri-bridge.ts
      → listen('update://available', cb)        (Tauri push event)
```

`onUpdateAvailable` and `onUpdateReady` use Tauri's event system (`listen()`), not `invoke()`. The bridge handles both patterns transparently.

---

## Phase 0: WebView Compatibility Check

Before migrating any native code, install Tauri CLI and scaffold a minimal `src-tauri/` that loads the existing `dist/` folder with no native commands wired. Run `npm run build` then `tauri dev` (or `tauri build`) on each platform.

**Check for:**
- CSS rendering differences (Edge WebView2 / WKWebView vs Chromium)
- JS console errors
- Font rendering
- CSP violations - Tauri v2 has stricter default CSP than Electron. Tailwind's inline styles and any dynamic style injection in App.tsx may trigger violations
- `base: './'` path behavior - Tauri v2 serves via `tauri://localhost` custom protocol (not `file://`). Relative asset paths should work but must be verified

**Gate:** If app renders and functions correctly with zero code changes, proceed to Phase 1. If issues found, fix them before migrating the native layer.

Phase 0 costs one day maximum and prevents weeks of rework on an incompatible base.

---

## Native Capabilities Mapping

| Capability | Electron | Tauri v2 |
|---|---|---|
| OS keychain (API keys) | `safeStorage` + `electron-store` | Rust `keyring` crate, custom command |
| Auto-updater | `electron-updater` | `tauri-plugin-updater` (official) |
| Open URL in browser | `shell.openExternal` | `tauri-plugin-opener` (official) |
| Window bounds persistence | `electron-store` | `tauri-plugin-window-state` (official) |
| Skipped version persistence | `electron-store` | `tauri-plugin-store` (official) |
| Logging (updater telemetry) | `electron-log` | `tauri-plugin-log` (official) |

### Tauri v2 Capabilities Config

Every plugin requires explicit permission grants in `src-tauri/capabilities/default.json`. This is not automatic - each plugin's permissions must be declared before the webview can call its commands. This is a required setup step for every plugin in the table above, not a footnote. The capabilities file is part of the Rust build and compile-errors if misconfigured.

### Keychain (AI config encryption)

Rust `keyring` crate provides OS keychain access: Windows Credential Manager, macOS Keychain, Linux libsecret.

**Linux fallback:** If libsecret is unavailable (headless, minimal distros), gracefully degrade to `tauri-plugin-store` (unencrypted, app data dir) and surface a one-time warning in the UI. This matches Electron's existing fallback behavior.

The Tauri keychain implementation is a custom command pair (`ai_config_get`, `ai_config_set`) rather than a drop-in plugin - no canonical `tauri-plugin-keychain` exists in Tauri v2's official plugin registry. The `keyring` crate is the standard approach.

### Auto-updater

`tauri-plugin-updater` handles check, download, install. Requires:
- Ed25519 keypair generated once via `tauri signer generate`
- Private key stored as `TAURI_SIGNING_PRIVATE_KEY` in GitHub Actions secrets
- Public key compiled into `tauri.conf.json`

Update manifest format is Tauri's `latest.json` (not `electron-updater`'s `latest.yml`). CI release job generates and publishes this alongside artifacts.

Existing in-app update UI (update available banner, download/install/skip buttons) is preserved. The `window.electronAPI` update methods map 1:1 to Tauri updater plugin calls.

---

## CI / Release Pipeline

### New secrets required (one-time setup before first release)

- `TAURI_SIGNING_PRIVATE_KEY` - Ed25519 private key from `tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - keypair passphrase
- Existing Windows/macOS code-signing certs carry over unchanged

### Runner changes

Ubuntu runner needs additional apt packages:

```yaml
- name: Install Linux dependencies
  if: matrix.os == 'ubuntu-latest'
  run: |
    sudo apt-get update
    sudo apt-get install -y libwebkit2gtk-4.1-dev librsvg2-dev patchelf libsecret-1-dev
```

Note: `libappindicator3-dev` omitted - no system tray in this app.

Windows and macOS runners: no extra dependencies.

### Build command change

```yaml
# Before
npm run build && npm run electron:compile && npx electron-builder --publish never

# After
npm run build && npx tauri build
```

### Artifacts

| Platform | Before | After |
|---|---|---|
| Windows | `.exe` (NSIS) | `.msi` or `.exe` (Tauri WiX/NSIS) |
| macOS | `.dmg` | `.dmg` |
| Linux | `.AppImage` | `.AppImage` |

Release job also publishes `latest.json` (Tauri update manifest) to GitHub Releases.

---

## Playwright / E2E Tests

Current e2e suite runs against Electron via `playwright test`. Tauri uses `tauri-driver` (WebDriver-based) for native app testing.

**Decision:** E2E suite is **temporarily skipped** on this branch during migration. The spec files in `tests/e2e/` are preserved unchanged. Wiring `tauri-driver` is a follow-up task after the migration lands. CI runs unit tests + `tsc --noEmit` as before.

---

## Linux System Requirements

Document in README and app store listings. Users on distros that do not meet these requirements will not receive support:

**Required:**
- WebKitGTK 4.1 (`libwebkit2gtk-4.1-0`)
- libsecret 1.x (`libsecret-1-0`) - required for OS keychain; without it, API keys stored unencrypted with a UI warning

**Tested distros:** Ubuntu 22.04+, Fedora 38+, Debian 12+

**Not supported:** Minimal/server distros without GTK runtime, distros with WebKitGTK < 4.1.

---

## macOS Notarization

Status of current Electron build's notarization is not confirmed. Tauri does not change the notarization requirement - Apple requires notarization for all distributed macOS apps. If the Electron build is already notarized, the same Apple Developer certs apply to Tauri. If not, notarization is an outstanding prerequisite for Mac distribution regardless of this migration.

**Action:** Confirm current notarization status before the Tauri release ships.

---

## Version

Merge targets v0.5.0. Bump `version` in `package.json` and `src-tauri/Cargo.toml` as part of the migration PR.

---

## Rollback

Branch `feat/tauri-migration` is isolated. `master` remains the canonical Electron app throughout. If the branch is abandoned, nothing on master is affected.

---

## Out of Scope

- Mobile (Capacitor for iOS/Android) - separate future project
- `tauri-driver` e2e wiring - follow-up after migration lands
- Linux `.deb`/`.rpm` packages - AppImage only for now, matching current Electron output
- Mac App Store / Windows Store distribution
