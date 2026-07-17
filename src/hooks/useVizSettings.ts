import { useState } from 'react';

/**
 * Visualization-settings state extracted from App.tsx.
 *
 * Owns view-level UI state controlling how palettes are visualized, none of
 * which is part of a palette's identity. (The former `vizStyle` global was
 * retired in #69: style is now a per-ramp property resolved via
 * paletteDefaultStyle + rampStyleOverrides, so every view renders rampsActive
 * and there is no global style selector to persist.)
 *
 *   - matrixColorSet: adjacency-matrix color source ('unique' | 'bases').
 *     Ephemeral, not persisted.
 *
 *   - matrixView: adjacency-matrix layout ('pair' | 'heatmap'). Ephemeral.
 *
 *   - ditherPattern: dither-blend preview pattern id (see DITHER_PATTERNS in
 *     viz-interaction.ts: 'bayer2'|'bayer4'|'bayer8'|'clustered'|'lines'|
 *     'crosshatch'). Ephemeral.
 *
 *   - ditherZoom: dither-blend preview display magnification (1 | 2 | 4).
 *     Scales the on-screen canvas size only (not the export). Ephemeral.
 *
 *   - ditherCrossRamp: dither-blend preview mode. false = per-ramp consecutive
 *     blend (default); true = N×N cross-ramp grid (base_i × base_j). Ephemeral.
 *
 * `window.storage` is the artifact's async key-value shim (installed in
 * App.tsx). It's typed globally as an optional `Window.storage` member in
 * src/vite-env.d.ts, so call sites use `window.storage` directly behind the
 * existing `if (!window.storage)` guards.
 */
export function useVizSettings() {
  const [matrixColorSet, setMatrixColorSet] = useState('unique'); // 'unique' | 'bases'
  const [matrixView, setMatrixView] = useState('pair');           // 'pair' | 'heatmap'
  const [ditherPattern, setDitherPattern] = useState('bayer2');   // DITHER_PATTERNS id
  const [ditherZoom, setDitherZoom] = useState(1);                // 1 | 2 | 4 (display magnify)
  const [ditherCrossRamp, setDitherCrossRamp] = useState(false);  // false = per-ramp blend, true = cross-ramp grid

  return { matrixColorSet, setMatrixColorSet, matrixView, setMatrixView, ditherPattern, setDitherPattern, ditherZoom, setDitherZoom, ditherCrossRamp, setDitherCrossRamp };
}
