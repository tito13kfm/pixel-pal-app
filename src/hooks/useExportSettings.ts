import { useState, useEffect, useRef } from 'react';

/**
 * Export-settings state extracted from App.tsx.
 *
 * Owns the palette-export and copy-feedback UI state. None of these are part
 * of a palette's identity (they're export / view preferences, not palette
 * content), so none are saved with the palette payload.
 *
 * THREE PERSISTED settings (each with a load-on-mount effect and a
 * mount-guarded persist-on-change effect, mirroring the other settings hooks):
 *
 *   - gplStyle: contrast style ('punchy' | 'balanced' | 'muted') for the
 *     full-palette .gpl Download button in the bottom export bar. Persisted
 *     under the 'ui:gplStyle' storage key.
 *
 *   - exportFormat: which export format the bottom export bar uses
 *     ('gpl' | 'pal' | 'ase' | 'png-strip' | 'txt'). Persisted under
 *     'ui:exportFormat'.
 *
 *   - rampExportStyle: per-ramp export style. Independent of vizStyle (which
 *     controls the Visualization panel near the bottom of the page) and of
 *     gplStyle (which controls the full-palette .gpl Download button). Used by
 *     the per-ramp Copy and Download buttons on every ramp card. Initialized
 *     to match the default vizStyle so a brand-new session has both at
 *     'punchy'; from then on they diverge as the user chooses. Persisted under
 *     'ui:rampExportStyle' as a session-level default. Not part of the saved
 *     palette payload, and NOT part of undo history (matches vizStyle /
 *     gplStyle treatment as UI / export preferences rather than palette
 *     content, none of these are in the undo snapshot). See "Per-ramp export
 *     style is independent" in ARCHITECTURE.
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
  const [gplStyle, setGplStyle] = useState('punchy');
  const [exportFormat, setExportFormat] = useState('gpl'); // gpl | pal | ase | png-strip | txt
  const [rampExportStyle, setRampExportStyle] = useState('punchy');

  const [copiedHex, setCopiedHex] = useState(null);
  const [exportFeedback, setExportFeedback] = useState('');
  const [lastSavedPath, setLastSavedPath] = useState(null); // desktop: path of last export, for Reveal
  const [sessionRampGplFolder, setSessionRampGplFolder] = useState<string | null>(null);

  // gplStyle: persisted at ui:gplStyle. Valid values punchy/balanced/muted.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:gplStyle');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['punchy', 'balanced', 'muted'].includes(parsed)) {
            setGplStyle(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);
  const gplStyleMountRef = useRef(false);
  useEffect(() => {
    if (!gplStyleMountRef.current) { gplStyleMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    // Capture the narrowed reference: TS doesn't carry `window.storage`
    // narrowing across the nested async IIFE (it's a mutable optional prop).
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:gplStyle', JSON.stringify(gplStyle)); } catch {}
    })();
  }, [gplStyle]);

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
    // Capture the narrowed reference (see gplStyle-persist effect above).
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:exportFormat', JSON.stringify(exportFormat)); } catch {}
    })();
  }, [exportFormat]);

  // rampExportStyle: persisted at ui:rampExportStyle. Valid values
  // punchy/balanced/muted. Not part of the saved palette payload (it is
  // a pure UI preference for the per-ramp Copy and Download buttons),
  // but persists as a session-level default like the others.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:rampExportStyle');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['punchy', 'balanced', 'muted'].includes(parsed)) {
            setRampExportStyle(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);
  const rampExportStyleMountRef = useRef(false);
  useEffect(() => {
    if (!rampExportStyleMountRef.current) { rampExportStyleMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    // Capture the narrowed reference (see gplStyle-persist effect above).
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:rampExportStyle', JSON.stringify(rampExportStyle)); } catch {}
    })();
  }, [rampExportStyle]);

  return {
    gplStyle, setGplStyle, exportFormat, setExportFormat, rampExportStyle, setRampExportStyle,
    copiedHex, setCopiedHex, exportFeedback, setExportFeedback,
    lastSavedPath, setLastSavedPath, sessionRampGplFolder, setSessionRampGplFolder,
  };
}
