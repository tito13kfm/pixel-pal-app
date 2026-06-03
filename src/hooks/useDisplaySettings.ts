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
 * App.tsx). There is no global type for it in this project, so we read it via
 * `(window as any).storage` to match the existing call-site pattern without
 * changing runtime behavior.
 */
export function useDisplaySettings() {
  const [crtEnabled, setCrtEnabled] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [cvdMode, setCvdMode] = useState('none');

  // Load theme preference once at mount. We use a try/catch and best-effort
  // semantics: if storage isn't available, just stay on 'dark'. The first
  // render uses 'dark' regardless; once this effect runs we update to the
  // saved value, which may cause a brief flash. Acceptable.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !(window as any).storage) return;
      try {
        const got = await (window as any).storage.get('ui:theme');
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
    if (typeof window === 'undefined' || !(window as any).storage) return;
    (async () => {
      try { await (window as any).storage.set('ui:theme', JSON.stringify(theme)); } catch {}
    })();
  }, [theme]);

  // Load saved CVD mode on mount. Same pattern as theme load.
  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined' || !(window as any).storage) return;
      try {
        const got = await (window as any).storage.get('ui:cvdMode');
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
    if (typeof window === 'undefined' || !(window as any).storage) return;
    (async () => {
      try { await (window as any).storage.set('ui:cvdMode', JSON.stringify(cvdMode)); } catch {}
    })();
  }, [cvdMode]);

  return { theme, setTheme, cvdMode, setCvdMode, crtEnabled, setCrtEnabled };
}
