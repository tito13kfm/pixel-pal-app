import { useState, useEffect } from 'react';
import type { UpdateInfo } from '../lib/tauri-bridge';

/**
 * Desktop auto-updater state: the available/ready update info and the
 * downloading flag. Registers the electronAPI update listeners once on mount.
 * The download/install/skip/open-releases ACTIONS are inline JSX onClick
 * handlers in App.tsx (wiring layer) and drive these setters. No-ops on web
 * (window.electronAPI is undefined there).
 */
export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDownloading, setUpdateDownloading] = useState(false);

  useEffect(() => {
    window.electronAPI?.onUpdateAvailable?.((info) => setUpdateInfo(info));
    window.electronAPI?.onUpdateReady?.((info) => { setUpdateInfo(info); setUpdateReady(true); setUpdateDownloading(false); });
    window.electronAPI?.onUpdateError?.((err) => { console.error('Update failed:', err); setUpdateDownloading(false); setUpdateInfo(null); });
  }, []);

  return { updateInfo, setUpdateInfo, updateReady, setUpdateReady, updateDownloading, setUpdateDownloading };
}
