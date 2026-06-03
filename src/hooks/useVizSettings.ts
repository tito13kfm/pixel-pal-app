import { useState, useEffect, useRef } from 'react';

/**
 * Visualization-settings state extracted from App.tsx.
 *
 * Owns four pieces of view-level UI state controlling how palettes are
 * visualized, none of which is part of a palette's identity:
 *
 *   - vizStyle: which contrast style ('punchy' | 'balanced' | 'muted') the
 *     visualization views (mosaic, strips, sprites, etc.) render. Persisted
 *     globally under the 'ui:vizStyle' storage key so the preference sticks
 *     across sessions. NOT saved per-palette — it's a viewing preference, not
 *     a property of the palette. This is the only viz setting with load/persist
 *     effects.
 *
 *   - matrixColorSet: adjacency-matrix color source ('unique' | 'bases').
 *     Ephemeral, not persisted.
 *
 *   - matrixView: adjacency-matrix layout ('pair' | 'heatmap'). Ephemeral.
 *
 *   - ditherPattern: dither-blend preview pattern ('checker' | 'bayer').
 *     Ephemeral.
 *
 * `window.storage` is the artifact's async key-value shim (installed in
 * App.tsx). It's typed globally as an optional `Window.storage` member in
 * src/vite-env.d.ts, so call sites use `window.storage` directly behind the
 * existing `if (!window.storage)` guards.
 */
export function useVizSettings() {
  const [vizStyle, setVizStyle] = useState('punchy');
  const [matrixColorSet, setMatrixColorSet] = useState('unique'); // 'unique' | 'bases'
  const [matrixView, setMatrixView] = useState('pair');           // 'pair' | 'heatmap'
  const [ditherPattern, setDitherPattern] = useState('checker');  // 'checker' | 'bayer'

  // vizStyle: persisted at ui:vizStyle. Valid values punchy/balanced/muted.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:vizStyle');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['punchy', 'balanced', 'muted'].includes(parsed)) {
            setVizStyle(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default.
      }
    })();
  }, []);

  // Persist vizStyle on change. Skip the initial mount render so we don't
  // immediately overwrite the value we just loaded.
  const vizStyleMountRef = useRef(false);
  useEffect(() => {
    if (!vizStyleMountRef.current) { vizStyleMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    // Capture the narrowed reference: TS doesn't carry `window.storage`
    // narrowing across the nested async IIFE (it's a mutable optional prop).
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:vizStyle', JSON.stringify(vizStyle)); } catch {}
    })();
  }, [vizStyle]);

  return { vizStyle, setVizStyle, matrixColorSet, setMatrixColorSet, matrixView, setMatrixView, ditherPattern, setDitherPattern };
}
