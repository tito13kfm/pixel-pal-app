// Regression: installUpdate had no error handling, unlike its sibling
// downloadUpdate (which catches, nulls pendingUpdate, and fires
// updateErrorCallbacks). A rejected install() left the "ready to install"
// UI state stuck forever with no error feedback (useUpdater.ts's
// onUpdateError callback resets updateDownloading/updateInfo, but it never
// fired).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(false) }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn().mockResolvedValue('1.0.0') }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));

const install = vi.fn().mockRejectedValue(new Error('signature mismatch'));
const check = vi.fn().mockResolvedValue({ version: '2.0.0', install, download: vi.fn().mockResolvedValue(undefined) });
vi.mock('@tauri-apps/plugin-updater', () => ({ check: (...args: unknown[]) => check(...args) }));

const storeGet = vi.fn().mockResolvedValue(undefined);
const storeSet = vi.fn().mockResolvedValue(undefined);
const storeSave = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn().mockResolvedValue({ get: storeGet, set: storeSet, save: storeSave }),
}));

describe('installUpdate error handling', () => {
  beforeEach(() => {
    vi.resetModules();
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('fires onUpdateError and does not relaunch when install() rejects', async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    const { initTauriBridge } = await import('../../src/lib/tauri-bridge');

    initTauriBridge();
    // Let checkForUpdates' async chain (invoke -> check -> store) settle and
    // set pendingUpdate before we call installUpdate.
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);
    await new Promise(process.nextTick);

    const onError = vi.fn();
    const bridge = (window as unknown as { electronAPI: any }).electronAPI;
    bridge.onUpdateError(onError);

    await bridge.installUpdate();

    expect(install).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('signature mismatch');
    expect(relaunch).not.toHaveBeenCalled();
  });
});
