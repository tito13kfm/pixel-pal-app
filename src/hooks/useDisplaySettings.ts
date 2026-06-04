import { useState, useEffect, useRef } from 'react';

/**
 * Display-settings state extracted from App.tsx.
 *
 * Owns three pieces of view-level UI state, each unrelated to a palette's
 * identity:
 *
 *   - theme: UI theme. 'dark' is the original vaporwave look; 'neutral' uses
 *     18% gray (~#777777, the photography/Zone V middle-gray standard) for
 *     unbiased color perception when judging palettes; 'light' uses an
 *     off-white that's easier on the eyes than pure white. Persisted globally
 *     under the 'ui:theme' storage key so all palettes inherit the user's
 *     choice. NOT saved per-palette since theme is a viewing preference, not a
 *     property of the palette itself.
 *
 *   - cvdMode: Color Vision Deficiency simulation mode. Applies an SVG color
 *     matrix filter to the main content area to approximate what the palette
 *     looks like to users with protanopia, deuteranopia, or tritanopia. Purely
 *     visual: hex labels and underlying state are untouched. Persisted under
 *     'ui:cvdMode' so the accessibility preference sticks across sessions. Same
 *     rationale as theme persistence.
 *
 *   - crtEnabled: ephemeral CRT-scanline toggle. NOT persisted.
 *
 * `window.storage` is the artifact's async key-value shim (installed in
 * App.tsx). It's typed globally as an optional `Window.storage` member in
 * src/vite-env.d.ts, so call sites use `window.storage` directly behind the
 * existing `if (!window.storage)` guards.
 */
export function useDisplaySettings() {
  const [crtEnabled, setCrtEnabled] = useState(false);
  const [theme, setTheme] = useState('neutral');
  const [cvdMode, setCvdMode] = useState('none');

  // Load theme preference once at mount. We use a try/catch and best-effort
  // semantics: if storage isn't available, just stay on the 'neutral' default.
  // The first render uses 'neutral' regardless; once this effect runs we update
  // to the saved value, which may cause a brief flash. Acceptable.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:theme');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['dark', 'neutral', 'light'].includes(parsed)) {
            setTheme(parsed);
          }
        }
      } catch {
        // No saved theme or storage failed; keep default.
      }
    })();
  }, []);

  // Persist theme on change. Skip the initial mount render so we don't
  // immediately overwrite the value we just loaded.
  const themeMountRef = useRef(false);
  useEffect(() => {
    if (!themeMountRef.current) { themeMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    // Capture the narrowed reference: TS doesn't carry `window.storage`
    // narrowing across the nested async IIFE (it's a mutable optional prop).
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:theme', JSON.stringify(theme)); } catch {}
    })();
  }, [theme]);

  // Load saved CVD mode on mount. Same pattern as theme load.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !window.storage) return;
      try {
        const got = await window.storage.get('ui:cvdMode');
        if (got && got.value) {
          const parsed = JSON.parse(got.value);
          if (typeof parsed === 'string' && ['none', 'protan', 'deutan', 'tritan'].includes(parsed)) {
            setCvdMode(parsed);
          }
        }
      } catch {
        // No saved value or storage failed; keep default 'none'.
      }
    })();
  }, []);

  // Persist CVD mode on change. Skip initial mount to avoid overwriting load.
  const cvdMountRef = useRef(false);
  useEffect(() => {
    if (!cvdMountRef.current) { cvdMountRef.current = true; return; }
    if (typeof window === 'undefined' || !window.storage) return;
    // Capture the narrowed reference (see theme-persist effect above).
    const storage = window.storage;
    (async () => {
      try { await storage.set('ui:cvdMode', JSON.stringify(cvdMode)); } catch {}
    })();
  }, [cvdMode]);

  return { theme, setTheme, cvdMode, setCvdMode, crtEnabled, setCrtEnabled };
}
