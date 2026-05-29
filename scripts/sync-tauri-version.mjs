#!/usr/bin/env node
// Sync src-tauri/Cargo.toml, src-tauri/tauri.conf.json, and the
// pixel-pal-app entry in src-tauri/Cargo.lock to match the version in
// package.json.
//
// Invoked automatically by `npm version` via the "version" script hook
// (after npm bumps package.json, before it tags). The hook also `git add`s
// the modified files so they land in the same release commit.
//
// Idempotent: running with everything already in sync is a no-op.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const version = pkg.version
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version)) {
  console.error(`[sync-tauri-version] package.json version "${version}" looks malformed`)
  process.exit(1)
}

const updates = [
  {
    path: 'src-tauri/Cargo.toml',
    // Only touch the package-table version line. Other "version = ..."
    // entries (dependency lines) live under [dependencies] and are not at
    // the start of the file. We anchor on the [package] table header.
    transform: (src) =>
      src.replace(
        /(\[package\][\s\S]*?\n\s*version\s*=\s*")[^"]+(")/,
        `$1${version}$2`,
      ),
  },
  {
    path: 'src-tauri/tauri.conf.json',
    transform: (src) =>
      src.replace(
        /("version"\s*:\s*")[^"]+(")/,
        `$1${version}$2`,
      ),
  },
  {
    path: 'src-tauri/Cargo.lock',
    // Only the local pixel-pal-app package entry. Format:
    //   [[package]]
    //   name = "pixel-pal-app"
    //   version = "x.y.z"
    transform: (src) =>
      src.replace(
        /(\[\[package\]\]\s*\nname = "pixel-pal-app"\s*\nversion = ")[^"]+(")/,
        `$1${version}$2`,
      ),
  },
]

let changed = 0
for (const u of updates) {
  const full = join(repoRoot, u.path)
  const before = readFileSync(full, 'utf8')
  const after = u.transform(before)
  if (after === before) {
    console.log(`[sync-tauri-version] ${u.path}: already at ${version}`)
    continue
  }
  writeFileSync(full, after)
  changed++
  console.log(`[sync-tauri-version] ${u.path}: updated -> ${version}`)
}

if (changed === 0) {
  console.log('[sync-tauri-version] nothing to update')
}
