// WCAG 2.1 AA contrast lint for theme tokens.
//
// Hand-mirrors a subset of `themeTokens` from `src/App.tsx`. KEEP IN SYNC:
// when you add or change a theme bg/text token that's listed in PAIRS,
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
  'text-purple-200': '#e9d5ff',
  'text-purple-300': '#d8b4fe',
  'text-purple-900': '#581c87',
  'text-green-300': '#86efac',
  'text-green-900': '#14532d',
};

// -------- Theme token mirror (KEEP IN SYNC with src/App.tsx themeTokens)
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
  },
  neutral: {
    pageBg: { gradient: ['#707070', '#7e7e7e'] },
    panelBg: { rgba: [0, 0, 0, 0.4] },
    controlPanelBg: { rgba: [39, 39, 42, 0.3] }, // bg-zinc-800/30
    panelTextInactive: 'text-zinc-100',
  },
  light: {
    pageBg: { gradient: ['#fafafa', '#f5f5f5'] },
    panelBg: '#ffffff',
    controlPanelBg: '#fafafa', // bg-zinc-50
    panelTextInactive: 'text-zinc-700',
  },
};

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

// -------- Drift detection: re-read App.tsx and verify each mirrored token
// still appears literally in the source. This catches the case where someone
// renames a token in App.tsx but forgets to update this file.

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
];

for (const [, literal] of MIRRORED_LITERALS) {
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
