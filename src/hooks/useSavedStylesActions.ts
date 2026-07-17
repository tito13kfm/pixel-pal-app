// Named save/load of custom ramp styles (#69 capability 4).
//
// Mirrors useSavedPalettesActions at a much smaller scale: two numbers and a
// name instead of a whole palette. Storage namespace `styles:{slug}`, payload
// `{ name, savedAt, reach, chromaFalloff }`. Unlike useSavedPalettesActions
// (which is handed its state bag by App.tsx because that bag is a plain
// useState App.tsx owns), this hook owns its own `savedStyles` list, since
// there's no other consumer of that list to coordinate with.
//
// Loading a named style stamps a *copy* into rampStyleScalars[i] and flips
// that ramp's override to 'custom' (snapshot-copy semantics, like saved
// palettes): later edits to the ramp don't mutate the saved style, and vice
// versa.
import { useEffect, useState } from 'react';
import { slugify } from '../lib/palette';
import type { RampStyle, StyleScalars } from '../lib/style-presets';

export interface SavedStyleEntry {
  slug: string;
  name: string;
  savedAt: number;
  reach: number;
  chromaFalloff: number;
}

export const SAVED_STYLE_LIMIT = 100;

type StyleMapUpdater<V> = (prev: Record<number, V>) => Record<number, V>;

interface UseSavedStylesActionsParams {
  setRampStyleScalars: (updater: StyleMapUpdater<StyleScalars>) => void;
  setRampStyleOverrides: (updater: StyleMapUpdater<RampStyle>) => void;
  tagNextLabel: (label: string) => void;
}

export function useSavedStylesActions({
  setRampStyleScalars,
  setRampStyleOverrides,
  tagNextLabel,
}: UseSavedStylesActionsParams) {
  const [savedStyles, setSavedStyles] = useState<SavedStyleEntry[]>([]);
  const [error, setError] = useState('');

  const refreshSavedStyles = async () => {
    if (typeof window === 'undefined' || !window.storage) return;
    try {
      const listResult = await window.storage.list('styles:');
      if (!listResult || !listResult.keys) { setSavedStyles([]); return; }
      const entries: SavedStyleEntry[] = [];
      for (const key of listResult.keys) {
        try {
          const got = await window.storage.get(key);
          if (!got || !got.value) continue;
          const parsed = JSON.parse(got.value);
          const reach = Number(parsed?.reach);
          const chromaFalloff = Number(parsed?.chromaFalloff);
          if (!Number.isFinite(reach) || !Number.isFinite(chromaFalloff)) continue;
          entries.push({
            slug: key.replace(/^styles:/, ''),
            name: parsed.name || '(unnamed)',
            savedAt: parsed.savedAt || 0,
            reach: Math.max(0, Math.min(1, reach)),
            chromaFalloff: Math.max(0, Math.min(1, chromaFalloff)),
          });
        } catch (err) {
          console.warn('Failed to read style key', key, err);
        }
      }
      entries.sort((a, b) => b.savedAt - a.savedAt);
      setSavedStyles(entries);
    } catch (err) {
      console.error('refreshSavedStyles failed', err);
      setSavedStyles([]);
    }
  };

  useEffect(() => {
    refreshSavedStyles();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  const saveStyle = async (name: string, scalars: StyleScalars) => {
    setError('');
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter a name'); return; }
    if (typeof window === 'undefined' || !window.storage) {
      setError('Storage is not available in this environment');
      return;
    }
    if (savedStyles.length >= SAVED_STYLE_LIMIT && !savedStyles.some(s => s.name === trimmed)) {
      setError(`Limit of ${SAVED_STYLE_LIMIT} saved styles reached. Delete one first.`);
      return;
    }
    const slug = slugify(trimmed);
    if (!slug) { setError('Name must contain at least one letter or digit'); return; }
    const payload = {
      name: trimmed,
      savedAt: Date.now(),
      reach: scalars.reach,
      chromaFalloff: scalars.chromaFalloff,
    };
    try {
      const result = await window.storage.set(`styles:${slug}`, JSON.stringify(payload));
      if (!result) { setError('Save failed (storage returned null)'); return; }
      await refreshSavedStyles();
    } catch (err) {
      console.error('saveStyle failed', err);
      setError('Save failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
    }
  };

  const loadStyleOntoRamp = async (slug: string, i: number) => {
    setError('');
    if (typeof window === 'undefined' || !window.storage) {
      setError('Storage is not available in this environment');
      return;
    }
    try {
      const got = await window.storage.get(`styles:${slug}`);
      if (!got || !got.value) { setError('Style not found'); return; }
      const parsed = JSON.parse(got.value);
      const reach = Number(parsed?.reach);
      const chromaFalloff = Number(parsed?.chromaFalloff);
      if (!Number.isFinite(reach) || !Number.isFinite(chromaFalloff)) { setError('Style data is invalid'); return; }
      const scalars: StyleScalars = {
        reach: Math.max(0, Math.min(1, reach)),
        chromaFalloff: Math.max(0, Math.min(1, chromaFalloff)),
      };
      tagNextLabel('Load ramp style');
      setRampStyleScalars(prev => ({ ...prev, [i]: scalars }));
      setRampStyleOverrides(prev => ({ ...prev, [i]: 'custom' }));
    } catch (err) {
      console.error('loadStyleOntoRamp failed', err);
      setError('Load failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
    }
  };

  const deleteStyle = async (slug: string) => {
    setError('');
    if (typeof window === 'undefined' || !window.storage) {
      setError('Storage is not available in this environment');
      return;
    }
    try {
      await window.storage.delete(`styles:${slug}`);
      await refreshSavedStyles();
    } catch (err) {
      console.error('deleteStyle failed', err);
      setError('Delete failed: ' + (err instanceof Error && err.message ? err.message : 'unknown error'));
    }
  };

  return { savedStyles, error, refreshSavedStyles, saveStyle, loadStyleOntoRamp, deleteStyle };
}
