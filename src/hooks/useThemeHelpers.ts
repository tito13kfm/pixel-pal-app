// Theme chrome helpers (#113): the resolved theme token bag plus the
// accent-glow / themed-accent functions, and the ThemeContext value memo.
//
// Extracted from App.tsx. Pure derivation from the current theme name; no
// state. The returned themeValue is what App.tsx feeds ThemeProvider, so
// panel components keep reading the exact same context shape.
import { useMemo } from 'react';
import { THEME_TOKENS } from '../lib/theme';
import type { ThemeName } from '../lib/theme';
import { hexToRgb } from '../lib/color';

export function useThemeHelpers(theme: ThemeName | string) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- THEME_TOKENS is pure static; deps=[theme] is correct
  const t = useMemo(() => THEME_TOKENS[theme as ThemeName] || THEME_TOKENS.dark, [theme]);

  // Helper for accent shadows. In dark mode we use the full neon glow; in
  // neutral/light we dial the intensity way down so accent borders read but
  // don't vibrate against the calmer background.
  const accentGlow = (hexAccent: string, baseAlpha = 0.4) => {
    const { r, g, b } = hexToRgb(hexAccent);
    const alpha = baseAlpha * t.glowStrong;
    if (alpha < 0.05) return 'none';
    return `0 0 25px rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // For section heading neon text-shadow. Takes a hex and optional pixel
  // size (default 8 to match the original section heading glow). Returns
  // 'none' on non-dark themes since glow-on-light is illegible.
  const accentTextGlow = (hexAccent: string, px = 8) => {
    if (t.glowStrong < 0.5) return 'none';
    return `0 0 ${px}px ${hexAccent}`;
  };

  // Section heading text color. In dark mode we use the neon accent directly
  // (e.g. cyan for ramps, pink for harmony). In neutral/light, neon text
  // against a light background is unreadable, so we shift to a much darker
  // variant of the same hue family. The mappings are tuned so each accent
  // stays distinguishable from its neighbors (cyan vs purple stay clearly
  // different) while remaining legible.
  //
  // IMPORTANT: When you change a mapping here, change it everywhere the
  // accent is used as chrome - section heading text, section heading
  // textShadow glow, style labels (Punchy/Balanced/Muted), accent borders
  // and glows. Use themedAccent() below as the single source of truth for
  // any chrome that needs the section accent.
  const ACCENT_MAP: Record<string, { neutralText: string; neutralBorder: string; light: string }> = {
    // Hex keys must be lowercase. Each value is { neutralText, neutralBorder, light }.
    // Neutral needs OPPOSITE values for text vs border:
    //   - Text on 18% gray card reads better as a light tint (cyan-100 etc.)
    //   - Borders against the 18% gray page read better as a dark tint
    //     (cyan-800 etc.) because the dark line crisply outlines the card
    //     edge against the medium-value page bg.
    // Light theme uses the same value for both text and border (dark tint
    // works against near-white cards).
    '#00ffff': { neutralText: '#cffafe', neutralBorder: '#083344', light: '#155e75' }, // cyan/teal
    '#67e8f9': { neutralText: '#cffafe', neutralBorder: '#083344', light: '#155e75' }, // cyan variant
    '#ff00ff': { neutralText: '#fce7f3', neutralBorder: '#4a044e', light: '#86198f' }, // pink/fuchsia
    '#ff006e': { neutralText: '#fce7f3', neutralBorder: '#4a044e', light: '#86198f' },
    '#ffff00': { neutralText: '#fef9c3', neutralBorder: '#422006', light: '#854d0e' }, // yellow
    '#00ff99': { neutralText: '#dcfce7', neutralBorder: '#052e16', light: '#166534' }, // green
    '#a855f7': { neutralText: '#f3e8ff', neutralBorder: '#3b0764', light: '#6b21a8' }, // purple
  };

  // themedAccent: single source of truth for any chrome that uses a section
  // accent color. Returns the canonical accent in dark mode, the LIGHT
  // tint variant in neutral mode (for text colors on gray cards), or the
  // dark tint in light mode. For BORDERS in neutral mode, use
  // themedAccentBorder() instead.
  const themedAccent = (hexAccent: string) => {
    if (t.glowStrong > 0.5) return hexAccent;
    const mapped = ACCENT_MAP[hexAccent.toLowerCase()];
    if (!mapped) return '#1a1a1a';
    if (theme === 'neutral') return mapped.neutralText;
    return mapped.light;
  };

  // themedAccentBorder: like themedAccent but returns dark tints for
  // Neutral mode where borders need to crisply outline cards against
  // the gray page bg. In Dark and Light, identical to themedAccent.
  const themedAccentBorder = (hexAccent: string) => {
    if (t.glowStrong > 0.5) return hexAccent;
    const mapped = ACCENT_MAP[hexAccent.toLowerCase()];
    if (!mapped) return '#1a1a1a';
    if (theme === 'neutral') return mapped.neutralBorder;
    return mapped.light;
  };

  // Backward compatibility: keep sectionHeadColor pointing at themedAccent
  // so callers don't have to change names. They do exactly the same thing.
  const sectionHeadColor = themedAccent;

  const themeValue = useMemo(() => ({
    t, themedAccent, themedAccentBorder, accentGlow, accentTextGlow, sectionHeadColor,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }), [t]);

  return { t, accentGlow, accentTextGlow, themedAccent, themedAccentBorder, sectionHeadColor, themeValue };
}
