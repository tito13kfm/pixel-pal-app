// Persisted session-level UI preferences (#113): rampSize and moodPreset.
//
// Extracted from App.tsx. These are session-level defaults the app
// initializes with on cold open. rampSize is also restorable per-palette
// via the saved palette payload; loading a saved palette overrides
// whatever the persisted default was, which is the desired behavior. Undo
// also writes to rampSize and that write will persist; the user's
// "current state" wins. Each setting follows the same pattern as ui:theme
// and ui:cvdMode: a one-shot load effect on mount and a mountRef-guarded
// persist effect. Hardcoded defaults stay unchanged for first-time users
// (no storage hit means we keep the useState initial value). Skipped
// intentionally: hueShiftStrength is per-palette (saved in the payload,
// default 1.0 per palette); persisting it as a session pref would
// conflict with that role.
//
// moodPreset (#135) lives here too: a MOOD_PRESETS id or null. Session-
// level setting like hardwareLock (survives resetPaletteState on
// purpose), but unlike hardwareLock it is NOT in the undo snapshot and
// NOT in saved payloads: it never changes currently rendered output, it
// only biases FUTURE Surprise Me / Around This / Harmonize actions.
// Composes with Hardware Lock (mood shapes base-color inputs; the lock
// quantizes rendered shades).
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePaletteState } from './usePaletteState';
import { isValidRampSize } from '../lib/ramp-engine';
import { MOOD_PRESETS } from '../lib/constants';

type MoodPreset = (typeof MOOD_PRESETS)[number];

export function useSessionPrefs() {
  const { rampSize, setRampSize } = usePaletteState();

  // rampSize: persisted at ui:rampSize. Valid values 2..64.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:rampSize');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (isValidRampSize(parsed)) {
            setRampSize(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, []);
  const rampSizeMountRef = useRef(false);
  useEffect(() => {
    if (!rampSizeMountRef.current) { rampSizeMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:rampSize', JSON.stringify(rampSize)); } catch {}
    })();
  }, [rampSize]);

  // moodPreset: persisted at ui:moodPreset (#135). Session-level bias for
  // Surprise Me / Around This / Harmonize; same load-once + mountRef-guarded
  // persist shape as ui:rampSize. Valid values: a MOOD_PRESETS id or null.
  const [moodPreset, setMoodPreset] = useState<string | null>(null);
  const activeMood: MoodPreset | null = useMemo(() => {
    if (!moodPreset) return null;
    return MOOD_PRESETS.find(m => m.id === moodPreset) || null;
  }, [moodPreset]);

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:moodPreset');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && MOOD_PRESETS.some(m => m.id === parsed)) {
            setMoodPreset(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default (null).
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount load, same as ui:rampSize
  }, []);
  const moodPresetMountRef = useRef(false);
  useEffect(() => {
    if (!moodPresetMountRef.current) { moodPresetMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:moodPreset', JSON.stringify(moodPreset)); } catch {}
    })();
  }, [moodPreset]);

  return { moodPreset, setMoodPreset, activeMood };
}
