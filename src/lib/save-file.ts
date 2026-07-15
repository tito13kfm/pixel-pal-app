// src/lib/save-file.ts
//
// Polymorphic save-file helper. In a Tauri runtime, opens the native
// Save As dialog (plugin-dialog) and writes via plugin-fs. In a pure
// browser (e.g. `npm run dev` at localhost:5173), falls back to the
// HTML5 anchor-click download trick. Last-folder is remembered per
// file-type slot via plugin-store (Tauri only; browser has no
// concept of "last folder" since the OS picks the Downloads dir).

import { isTauri } from './env';

export type SaveData = { text: string } | { bytes: Uint8Array | Blob };
export type SaveFilter = { name: string; extensions: string[] };
export type FolderKey = 'txt' | 'gpl' | 'png' | 'pal' | 'ase' | 'json';

export interface SaveOptions {
  defaultName: string;
  filters: SaveFilter[];
  data: SaveData;
  folderKey: FolderKey;
  /** When set, skip the dialog and write directly to this folder using
   *  defaultName. Used by per-ramp .gpl after the first dialog. */
  silentToFolder?: string | null;
}

export interface SaveResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  folder?: string;
  error?: string;
}

function dirname(p: string): string {
  const lastSlash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return lastSlash >= 0 ? p.substring(0, lastSlash) : '';
}

function joinPath(folder: string, name: string): string {
  if (!folder) return name;
  const sep = folder.includes('\\') ? '\\' : '/';
  const trimmed = folder.endsWith(sep) ? folder.slice(0, -1) : folder;
  return `${trimmed}${sep}${name}`;
}

async function tauriSave(opts: SaveOptions): Promise<SaveResult> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const fs = await import('@tauri-apps/plugin-fs');
  const { load } = await import('@tauri-apps/plugin-store');

  const store = await load('settings.json');
  const storeKey = `lastFolder.${opts.folderKey}`;

  let targetPath: string | null = null;

  if (opts.silentToFolder) {
    targetPath = joinPath(opts.silentToFolder, opts.defaultName);
  } else {
    const lastFolder = (await store.get<string>(storeKey)) ?? null;
    const defaultPath = lastFolder
      ? joinPath(lastFolder, opts.defaultName)
      : opts.defaultName;
    const chosen = await save({ defaultPath, filters: opts.filters });
    if (!chosen) return { ok: false, canceled: true };
    targetPath = chosen;
  }

  try {
    if ('text' in opts.data) {
      await fs.writeTextFile(targetPath, opts.data.text);
    } else if (opts.data.bytes instanceof Blob) {
      const buf = await opts.data.bytes.arrayBuffer();
      await fs.writeFile(targetPath, new Uint8Array(buf));
    } else {
      await fs.writeFile(targetPath, opts.data.bytes);
    }
    const folder = dirname(targetPath);
    if (folder) {
      const prev = await store.get<string>(storeKey);
      if (prev !== folder) {
        await store.set(storeKey, folder);
        await store.save();
      }
    }
    return { ok: true, path: targetPath, folder };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function browserFallback(opts: SaveOptions): SaveResult {
  const isText = 'text' in opts.data;
  const blob = isText
    ? new Blob([(opts.data as { text: string }).text], { type: 'text/plain;charset=utf-8' })
    : ('bytes' in opts.data && opts.data.bytes instanceof Blob
        ? opts.data.bytes
        : new Blob([(opts.data as { bytes: Uint8Array }).bytes as BlobPart]));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a') as HTMLAnchorElement;
  a.href = url;
  a.download = opts.defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
  return { ok: true };
}

export async function saveFile(opts: SaveOptions): Promise<SaveResult> {
  if (isTauri()) {
    return tauriSave(opts);
  }
  return browserFallback(opts);
}
