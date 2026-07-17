import { useState, useEffect, useRef } from 'react';

/**
 * Export-settings state extracted from App.tsx.
 *
 * Owns the palette-export and copy-feedback UI state. None of these are part
 * of a palette's identity (they're export / view preferences, not palette
 * content), so none are saved with the palette payload.
 *
 * ONE PERSISTED setting (with a load-on-mount effect and a mount-guarded
 * persist-on-change effect, mirroring the other settings hooks):
 *
 *   - exportFormat: which export format the bottom export bar uses
 *     ('gpl' | 'pal' | 'ase' | 'png-strip' | 'txt'). Persisted under
 *     'ui:exportFormat'.
 *
 * The former `gplStyle` and `rampExportStyle` globals were retired in #69:
 * style is now a per-ramp property, so every export (whole-palette and
 * per-ramp) renders each ramp at its own active style. There is no global
 * export-style selector to persist.
 *
 * FOUR EPHEMERAL settings (state only, no effects, not persisted):
 *
 *   - copiedHex: the last hex copied to the clipboard, for transient UI cues.
 *
 *   - exportFeedback: generic toast / status message shown in the export bar.
 *     Set by many call sites in App.tsx.
 *
 *   - lastSavedPath: desktop-only path of the last export, for the Reveal
 *     action.
 *
 *   - sessionRampGplFolder: per-ramp .gpl session folder. After the first
 *     dialog, this is set so subsequent per-ramp .gpl saves in the same
 *     session write silently to the same folder. Cleared on app reload OR on
 *     a failed silent write.
 *
 * `window.storage` is the artifact's async key-value shim (installed in
 * App.tsx). It's typed globally as an optional `Window.storage` member in
 * src/vite-env.d.ts, so call sites use `window.storage` directly behind the
 * existing `if (!window.storage)` guards.
 */
export function useExportSettings() {
  const [exportFormat, setExportFormat] = useState('gpl'); // gpl | pal | ase | png-strip | txt

  const [copiedHex, setCopiedHex] = useState(null);
  const [exportFeedback, setExportFeedback] = useState('');
  const [lastSavedPath, setLastSavedPath] = useState(null); // desktop: path of last export, for Reveal
  const [sessionRampGplFolder, setSessionRampGplFolder] = useState<string | null>(null);

  // exportFormat: persisted at ui:exportFormat. Valid values gpl/pal/ase/png-strip/txt.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:exportFormat');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['gpl', 'pal', 'ase', 'png-strip', 'txt'].includes(parsed)) {
            setExportFormat(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);
  const exportFormatMountRef = useRef(false);
  useEffect(() => {
    if (!exportFormatMountRef.current) { exportFormatMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    // Capture the narrowed reference: TS doesn't carry `window.storage`
    // narrowing across the nested async IIFE (it's a mutable optional prop).
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:exportFormat', JSON.stringify(exportFormat)); } catch {}
    })();
  }, [exportFormat]);

  return {
    exportFormat, setExportFormat,
    copiedHex, setCopiedHex, exportFeedback, setExportFeedback,
    lastSavedPath, setLastSavedPath, sessionRampGplFolder, setSessionRampGplFolder,
  };
}
