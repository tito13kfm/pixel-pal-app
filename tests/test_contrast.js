// WCAG 2.1 AA contrast lint for theme tokens.
//
// Hand-mirrors a subset of `THEME_TOKENS` from `src/lib/theme.ts`. KEEP IN
// SYNC: when you add or change a theme bg/text token that's listed in PAIRS,
// update the THEMES + TAILWIND maps below. CI runs this with `node` from
// the repo root, no test framework. Failures exit 1; success exits 0.
//
// Targets:
//   - Normal text: 4.5:1
//   - UI components / large text / icons: 3.0:1
//
// What this catches:
//   - Theme bg darkened past where existing text-color token still passes
//   - New theme added that forgets a token used in PAIRS
//   - Tailwind class swap that drops a token below target
//
// What this does NOT catch:
//   - Hardcoded `className="text-zinc-700"` literals not routed through a
//     token (those are bypass cases). Audit those manually before adding
//     a new className with a literal text color.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -------- Tailwind palette (subset actually referenced in PAIRS / tokens)

const TAILWIND = {
  'text-white': '#ffffff',
  'text-black': '#000000',
  'text-zinc-50': '#fafafa',
  'text-zinc-100': '#f4f4f5',
  'text-zinc-200': '#e4e4e7',
  'text-zinc-700': '#3f3f46',
  'text-zinc-800': '#27272a',
  'text-zinc-900': '#18181b',
  'text-cyan-100': '#cffafe',
  'text-cyan-200': '#a5f3fc',
  'text-cyan-300': '#67e8f9',
  'text-pink-100': '#fce7f3',
  'text-pink-200': '#fbcfe8',
  'text-pink-300': '#f9a8d4',
  'text-yellow-100': '#fef9c3',
  'text-yellow-200': '#fef08a',
  'text-yellow-900': '#713f12',
  'text-green-100': '#dcfce7',
  'text-purple-200': '#e9d5ff',
  'text-purple-300': '#d8b4fe',
  'text-purple-900': '#581c87',
  'text-green-300': '#86efac',
  'text-green-900': '#14532d',
};

// -------- Theme token mirror (KEEP IN SYNC with src/lib/theme.ts THEME_TOKENS)
//
// Only the tokens consumed by PAIRS below need to be mirrored. Add more if
// you extend PAIRS. Values are either:
//   - hex string like '#ffffff'
//   - rgba object: { rgba: [r, g, b, a] } that composites over `parent` in PAIRS
//   - gradient object: { gradient: ['#hex1', '#hex2'] } — we take the worst-case
//     end-stop for compositing parents
//   - Tailwind class name like 'text-zinc-100' (uses TAILWIND lookup)
//   - Tailwind bg class with alpha like 'bg-zinc-800/30' parsed via parseTwBg()

const THEMES = {
  dark: {
    pageBg: { gradient: ['#1a0033', '#ff006e'] }, // simplified to two stops
    panelBg: { rgba: [0, 0, 0, 0.4] },            // over pageBg
    controlPanelBg: { rgba: [88, 28, 135, 0.4] }, // bg-purple-900/40 over pageBg
    panelTextInactive: 'text-cyan-200',
    // cardBgCyan/Pink/Yellow/Green/Viz are all rgba-over-pageBg gradients in
    // Dark; approximated as flat hex end-stops (same simplification pageBg
    // itself uses above) since Dark always passes these checks by a wide
    // margin: precision here matters far less than for Neutral/Light.
    cardBgCyan: { gradient: ['#110021', '#2a004d'] },
    themedAccentCyanLabel: '#00ffff', // themedAccent('#00ffff') when glowStrong > 0.5
    alertWarnText: 'text-yellow-200',
    alertWarnBg: { rgba: [113, 63, 18, 0.2] }, // bg-yellow-900/20 over pageBg
  },
  neutral: {
    pageBg: { gradient: ['#707070', '#7e7e7e'] },
    panelBg: { rgba: [0, 0, 0, 0.4] },
    controlPanelBg: { rgba: [39, 39, 42, 0.3] }, // bg-zinc-800/30
    panelTextInactive: 'text-zinc-100',
    // cardBgCyan/Pink/Yellow/Green/Viz are identical flat gray gradients in
    // Neutral (theme.ts THEME_TOKENS.neutral): accent identity comes from
    // card border color only, not fill.
    cardBgCyan: { gradient: ['#707070', '#7e7e7e'] },
    themedAccentCyanLabel: '#cffafe', // ACCENT_MAP['#00ffff'].neutralText (App.tsx)
    alertWarnText: 'text-yellow-900',
    alertWarnBg: { rgba: [254, 249, 195, 0.7] }, // bg-yellow-100/70 over pageBg
  },
  light: {
    pageBg: { gradient: ['#fafafa', '#f5f5f5'] },
    panelBg: '#ffffff',
    controlPanelBg: '#fafafa', // bg-zinc-50
    panelTextInactive: 'text-zinc-700',
    // cardBgCyan/Pink/Yellow/Green/Viz are identical flat near-white
    // gradients in Light (theme.ts THEME_TOKENS.light).
    cardBgCyan: { gradient: ['#f5f5f5', '#e0e0e0'] },
    themedAccentCyanLabel: '#155e75', // ACCENT_MAP['#00ffff'].light (App.tsx)
    alertWarnText: 'text-yellow-900',
    alertWarnBg: '#fefce8', // bg-yellow-50, solid
  },
};

// scrimOnCardCyan: the bg-black/60 scrim wrapper used throughout the panels
// (VizComparePanel, HarmonyPanel, RampsPanel, SavedPalettesPanel,
// HistoryPanel) to darken caption text sitting on a cardBgCyan-family
// gradient enough to clear the 4.5:1 normal-text bar. Composited here as
// rgba over cardBgCyan per theme. Must be /60, not /40: on Light's
// near-white card (#f5f5f5/#e0e0e0), a /40 black overlay only reaches
// ~mid-gray (composite ~#87-93), which fails 4.5:1 against the forced
// light-cyan text the override restores for any bg-black/* ancestor. /60
// reaches ~#5a-62, which clears it comfortably in all three themes.
for (const themeName of Object.keys(THEMES)) {
  THEMES[themeName].scrimOnCardCyan = { rgba: [0, 0, 0, 0.6] };
}

// -------- Pairs to verify
//
// [textKey, bgKey, parentKey-or-null-if-bg-is-solid, targetRatio, label]
// textKey + bgKey resolve through THEMES[<theme>][key], or use a literal
// Tailwind class if the value starts with 'text-' / hex.
//
// Each pair is tested across all three themes. A pair without theme-specific
// values (e.g. literal hex on both sides) still gets tested 3x — same result
// each time, just a sanity check.

const PAIRS = [
  ['panelTextInactive', 'panelBg', 'pageBg', 3.0, 'panel inactive button (theme switcher + CVD selector)'],
  ['panelTextInactive', 'controlPanelBg', 'pageBg', 4.5, 'ramp export label on control panel'],
  // Issue #10: short bold/uppercase card labels (Style Tuning, Locked:,
  // Slot A/B, chevrons, ...) routed through themedAccent() directly on a
  // cardBgCyan-family gradient. Large-text/UI-component treatment: 3:1.
  ['themedAccentCyanLabel', 'cardBgCyan', null, 3.0, 'themedAccent() card label directly on card gradient'],
  // Issue #10: paragraph-style captions (VizComparePanel descriptions,
  // HarmonyPanel intro, SavedPalettesPanel hints, ...) wrapped in the
  // bg-black/40 scrim over a cardBgCyan-family gradient. Normal-text: 4.5:1.
  ['text-cyan-100', 'scrimOnCardCyan', 'cardBgCyan', 4.5, 'caption text on bg-black/40 scrim over card gradient'],
  // Issue #10: hardware-lock warning banner (RampsPanel, VizComparePanel
  // oversized-image warning) routed through the existing alertWarn* tokens.
  // Parent is cardBgCyan (not pageBg): both real call sites nest this banner
  // inside a cardBgCyan-family SectionCard, not directly on the raw page bg.
  // Using pageBg's brightest Dark gradient stop (the hot-pink bottom) as
  // parent would test a compositing scenario that never actually occurs.
  ['alertWarnText', 'alertWarnBg', 'cardBgCyan', 4.5, 'hardware-lock / oversized-image warning banner'],
];

// -------- WCAG ratio math

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`bad hex: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  const c = rgb.map(v => Math.round(Math.max(0, Math.min(255, v))));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function relLuminance([r, g, b]) {
  const chan = c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(hex1, hex2) {
  const L1 = relLuminance(hexToRgb(hex1));
  const L2 = relLuminance(hexToRgb(hex2));
  const lo = Math.min(L1, L2);
  const hi = Math.max(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function compositeRgba(rgba, parentHex) {
  const [r, g, b, a] = rgba;
  const [pr, pg, pb] = hexToRgb(parentHex);
  return [a * r + (1 - a) * pr, a * g + (1 - a) * pg, a * b + (1 - a) * pb];
}

function worstStop(gradient) {
  // Worst-case for contrast: pick the gradient end-stop that, after the
  // upcoming rgba composite, will produce the bg closest to mid-grey (where
  // both light and dark text get squeezed). For this codebase the gradients
  // are tight enough that either end-stop is fine — we report the lower-
  // contrast (worst) ratio across both stops at the caller.
  return gradient;
}

function resolveBg(token, theme, parentToken) {
  // Returns one or two hex strings; we test against all returned and use the
  // worst-case ratio.
  if (typeof token === 'string') {
    if (token.startsWith('#')) return [token];
    if (TAILWIND[token]) return [TAILWIND[token]];
    throw new Error(`unrecognized bg token string: ${token}`);
  }
  if (token.gradient) {
    return token.gradient;
  }
  if (token.rgba) {
    const parent = THEMES[theme][parentToken];
    if (!parent) throw new Error(`rgba bg needs parent, got ${parentToken}`);
    const parentStops = resolveBg(parent, theme, null);
    return parentStops.map(p => rgbToHex(compositeRgba(token.rgba, p)));
  }
  throw new Error(`unrecognized bg token shape: ${JSON.stringify(token)}`);
}

function resolveText(token) {
  if (typeof token !== 'string') throw new Error(`text token must be string`);
  if (token.startsWith('#')) return token;
  if (TAILWIND[token]) return TAILWIND[token];
  throw new Error(`unrecognized text token: ${token}`);
}

// -------- Run

const failures = [];

for (const themeName of Object.keys(THEMES)) {
  const theme = THEMES[themeName];
  for (const [textKey, bgKey, parentKey, target, label] of PAIRS) {
    const textTokenVal = theme[textKey] !== undefined ? theme[textKey] : textKey;
    const bgTokenVal = theme[bgKey] !== undefined ? theme[bgKey] : bgKey;
    const textHex = resolveText(textTokenVal);
    const bgHexes = resolveBg(bgTokenVal, themeName, parentKey);
    let worst = Infinity;
    let worstBg = bgHexes[0];
    for (const bg of bgHexes) {
      const r = contrast(textHex, bg);
      if (r < worst) {
        worst = r;
        worstBg = bg;
      }
    }
    if (worst < target) {
      failures.push({
        theme: themeName,
        label,
        textHex,
        bgHex: worstBg,
        ratio: worst,
        target,
      });
    }
  }
}

// -------- Drift detection: re-read src/lib/theme.ts and verify each
// mirrored token still appears literally in the source. This catches the
// case where someone renames a token in theme.ts but forgets to update this
// file. (Token definitions moved out of src/App.tsx into src/lib/theme.ts
// during the SP2 phase c logic extraction; this check must follow them.)

const themePath = path.join(__dirname, '..', 'src', 'lib', 'theme.ts');
const themeSrc = fs.readFileSync(themePath, 'utf8');
const appPath = path.join(__dirname, '..', 'src', 'App.tsx');
const appSrc = fs.readFileSync(appPath, 'utf8');
const driftErrors = [];

const MIRRORED_LITERALS = [
  // text values that must appear inside a theme block
  ["dark", "panelTextInactive: 'text-cyan-200'"],
  ["neutral", "panelTextInactive: 'text-zinc-100'"],
  ["light", "panelTextInactive: 'text-zinc-700'"],
  // bg values
  ["dark", "panelBg: 'rgba(0, 0, 0, 0.4)'"],
  ["neutral", "panelBg: 'rgba(0, 0, 0, 0.4)'"],
  ["light", "panelBg: '#ffffff'"],
  ["dark", "controlPanelBg: 'bg-purple-900/40'"],
  ["neutral", "controlPanelBg: 'bg-zinc-800/30'"],
  ["light", "controlPanelBg: 'bg-zinc-50'"],
  // Issue #10: cardBgCyan is identical across cardBgCyan/Pink/Yellow/Green/Viz
  // per theme in Neutral and Light (Dark is approximated, see THEMES comment).
  ["neutral", "cardBgCyan: 'linear-gradient(135deg, #707070 0%, #7e7e7e 100%)'"],
  ["light", "cardBgCyan: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)'"],
  // Issue #10: alertWarnText/alertWarnBg per theme.
  ["dark", "alertWarnBg: 'bg-yellow-900/20'"],
  ["dark", "alertWarnText: 'text-yellow-200'"],
  ["neutral", "alertWarnBg: 'bg-yellow-100/70'"],
  ["neutral", "alertWarnText: 'text-yellow-900'"],
  ["light", "alertWarnBg: 'bg-yellow-50'"],
  ["light", "alertWarnText: 'text-yellow-900'"],
];

for (const [, literal] of MIRRORED_LITERALS) {
  if (!themeSrc.includes(literal)) {
    driftErrors.push(`MISSING in theme.ts: ${literal}`);
  }
}

// Issue #10: themedAccentCyanLabel mirrors App.tsx's ACCENT_MAP['#00ffff']
// entry (themedAccent() source of truth), not a theme.ts token, so it's
// checked against App.tsx separately since that's where it actually lives.
const MIRRORED_LITERALS_APP = [
  "'#00ffff': { neutralText: '#cffafe', neutralBorder: '#083344', light: '#155e75' }",
];

for (const literal of MIRRORED_LITERALS_APP) {
  if (!appSrc.includes(literal)) {
    driftErrors.push(`MISSING in App.tsx: ${literal}`);
  }
}

// -------- Report

let exitCode = 0;

if (driftErrors.length > 0) {
  console.error('Theme drift detected — test mirror is stale:');
  for (const e of driftErrors) console.error('  ' + e);
  exitCode = 1;
}

if (failures.length > 0) {
  console.error('WCAG contrast failures:');
  for (const f of failures) {
    console.error(
      `  ${f.theme}: ${f.label}\n` +
      `    text ${f.textHex} on bg ${f.bgHex}\n` +
      `    ratio ${f.ratio.toFixed(2)}:1, target ${f.target.toFixed(1)}:1`
    );
  }
  exitCode = 1;
}

if (exitCode === 0) {
  console.log(`contrast lint OK — ${Object.keys(THEMES).length} themes × ${PAIRS.length} pairs verified`);
}

process.exit(exitCode);
