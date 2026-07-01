// Pure export/formatting functions extracted from App.tsx (SP2 phase c).
//
// These functions build text/binary payloads for palette exports (txt, gpl,
// pal, ase, per-ramp text/gpl) and dedupe palette entries. No state, no
// side effects beyond returning data or calling saveFile (the async
// exportXxx wrappers live in the useExport hook, not here).
import { dedupeHexes } from './hex-utils';
import { buildGpl } from './palette-export';
import { hexToRgb } from './color';

export interface HarmonySet {
  complementary: string;
  analogous1: string; analogous2: string;
  triadic1: string; triadic2: string;
  splitComp1: string; splitComp2: string;
  tetradic1: string; tetradic2: string; tetradic3: string;
  square1: string; square2: string; square3: string;
}

type RampStyle = 'punchy' | 'balanced' | 'muted';

export function buildPaletteText(params: {
  baseColors: string[];
  aiColorNames: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  harmony: HarmonySet;
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
}): string {
  const { baseColors, aiColorNames, rampsPunchy, rampsBalanced, rampsMuted, harmony, resolveBaseForRamp, labelsForRamp, filterHidden } = params;
  const lines = ['# PIXEL.PAL Palette Export', `# Generated ${new Date().toLocaleString()}`, ''];

  baseColors.forEach((_, i) => {
    const name = aiColorNames[i] || `Color ${i + 1}`;
    const punchy = rampsPunchy[i];
    const balanced = rampsBalanced[i];
    const muted = rampsMuted[i];
    const effectiveBase = resolveBaseForRamp(baseColors[i], i);
    const labelsP = labelsForRamp(punchy, effectiveBase);
    const labelsB = labelsForRamp(balanced, effectiveBase);
    const labelsM = labelsForRamp(muted, effectiveBase);
    const fP = filterHidden(punchy, labelsP, i);
    const fB = filterHidden(balanced, labelsB, i);
    const fM = filterHidden(muted, labelsM, i);
    lines.push(`## ${name}`);
    lines.push('### Punchy');
    fP.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fP.labels[k]}`));
    lines.push('### Balanced');
    fB.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fB.labels[k]}`));
    lines.push('### Muted');
    fM.hexes.forEach((hex, k) => lines.push(`${hex.toUpperCase()}  ${fM.labels[k]}`));
    lines.push('');
  });
  lines.push('## Harmony Colors');
  lines.push(`${harmony.complementary.toUpperCase()}  complementary`);
  lines.push(`${harmony.analogous1.toUpperCase()}  analogous 1`);
  lines.push(`${harmony.analogous2.toUpperCase()}  analogous 2`);
  lines.push(`${harmony.triadic1.toUpperCase()}  triadic 1`);
  lines.push(`${harmony.triadic2.toUpperCase()}  triadic 2`);
  lines.push(`${harmony.splitComp1.toUpperCase()}  split-complementary 1`);
  lines.push(`${harmony.splitComp2.toUpperCase()}  split-complementary 2`);
  lines.push(`${harmony.tetradic1.toUpperCase()}  tetradic 1`);
  lines.push(`${harmony.tetradic2.toUpperCase()}  tetradic 2`);
  lines.push(`${harmony.tetradic3.toUpperCase()}  tetradic 3`);
  lines.push(`${harmony.square1.toUpperCase()}  square 1`);
  lines.push(`${harmony.square2.toUpperCase()}  square 2`);
  lines.push(`${harmony.square3.toUpperCase()}  square 3`);
  lines.push('');
  lines.push('## Unique Colors');
  const allStyleHexes = [
    ...rampsPunchy.flat(),
    ...rampsBalanced.flat(),
    ...rampsMuted.flat(),
    harmony.complementary,
    harmony.analogous1, harmony.analogous2,
    harmony.triadic1, harmony.triadic2,
    harmony.splitComp1, harmony.splitComp2,
    harmony.tetradic1, harmony.tetradic2, harmony.tetradic3,
    harmony.square1, harmony.square2, harmony.square3,
  ];
  const uniqueColors = dedupeHexes(allStyleHexes);
  uniqueColors.forEach(hex => lines.push(hex.toUpperCase()));
  lines.push(`# ${uniqueColors.length} unique colors`);
  return lines.join('\n');
}

export function collectPaletteEntries(params: {
  style: RampStyle;
  baseColors: string[];
  aiColorNames: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  harmony: HarmonySet;
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
}): { hex: string; name: string }[] {
  const { style, baseColors, aiColorNames, rampsPunchy, rampsBalanced, rampsMuted, harmony, resolveBaseForRamp, labelsForRamp, filterHidden } = params;
  const entries: { hex: string; name: string }[] = [];
  const ramps = style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;
  baseColors.forEach((_, i) => {
    const name = aiColorNames[i] || `Color ${i + 1}`;
    const ramp = ramps[i];
    const effectiveBase = resolveBaseForRamp(baseColors[i], i);
    const labels = labelsForRamp(ramp, effectiveBase);
    const filtered = filterHidden(ramp, labels, i);
    filtered.hexes.forEach((hex, k) => entries.push({ hex, name: `${name} ${filtered.labels[k]}` }));
  });
  entries.push({ hex: harmony.complementary, name: 'harmony complementary' });
  entries.push({ hex: harmony.analogous1, name: 'harmony analogous 1' });
  entries.push({ hex: harmony.analogous2, name: 'harmony analogous 2' });
  entries.push({ hex: harmony.triadic1, name: 'harmony triadic 1' });
  entries.push({ hex: harmony.triadic2, name: 'harmony triadic 2' });
  entries.push({ hex: harmony.splitComp1, name: 'harmony split-comp 1' });
  entries.push({ hex: harmony.splitComp2, name: 'harmony split-comp 2' });
  entries.push({ hex: harmony.tetradic1, name: 'harmony tetradic 1' });
  entries.push({ hex: harmony.tetradic2, name: 'harmony tetradic 2' });
  entries.push({ hex: harmony.tetradic3, name: 'harmony tetradic 3' });
  entries.push({ hex: harmony.square1, name: 'harmony square 1' });
  entries.push({ hex: harmony.square2, name: 'harmony square 2' });
  entries.push({ hex: harmony.square3, name: 'harmony square 3' });

  const seenHex = new Set<string>();
  const unique: { hex: string; name: string }[] = [];
  for (const e of entries) {
    const key = (e.hex || '').toLowerCase();
    if (!key || seenHex.has(key)) continue;
    seenHex.add(key);
    unique.push(e);
  }
  return unique;
}

export function buildPaletteGpl(params: Parameters<typeof collectPaletteEntries>[0] & { rampSize: number }): string {
  const styleLabel = params.style === 'balanced' ? 'Balanced' : params.style === 'muted' ? 'Muted' : 'Punchy';
  return buildGpl(collectPaletteEntries(params), { paletteName: `PIXEL.PAL ${styleLabel}`, columns: params.rampSize });
}

export function selectRampsForStyle(style: RampStyle, rampsPunchy: string[][], rampsBalanced: string[][], rampsMuted: string[][]): string[][] {
  return style === 'balanced' ? rampsBalanced : style === 'muted' ? rampsMuted : rampsPunchy;
}

export function filteredRamp(params: {
  i: number;
  style: RampStyle;
  baseColors: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
}): { hexes: string[]; labels: string[] } {
  const { i, style, baseColors, rampsPunchy, rampsBalanced, rampsMuted, resolveBaseForRamp, labelsForRamp, filterHidden } = params;
  const ramps = selectRampsForStyle(style, rampsPunchy, rampsBalanced, rampsMuted);
  const ramp = ramps[i];
  const effectiveBase = resolveBaseForRamp(baseColors[i], i);
  const labels = labelsForRamp(ramp, effectiveBase);
  return filterHidden(ramp, labels, i);
}

export function buildSingleRampText(filtered: { hexes: string[] }): string {
  return dedupeHexes(filtered.hexes).join('\n') + '\n';
}

export function buildSingleRampGpl(params: {
  filtered: { hexes: string[]; labels: string[] };
  i: number;
  style: RampStyle;
  aiColorNames: string[];
}): string {
  const { filtered, i, style, aiColorNames } = params;
  const name = aiColorNames[i] || `Color ${i + 1}`;
  const seenHex = new Set<string>();
  const entries: { hex: string; label: string }[] = [];
  for (let k = 0; k < filtered.hexes.length; k++) {
    const key = (filtered.hexes[k] || '').toLowerCase();
    if (!key || seenHex.has(key)) continue;
    seenHex.add(key);
    entries.push({ hex: filtered.hexes[k], label: filtered.labels[k] });
  }
  const pad3 = (n: number) => String(n).padStart(3, ' ');
  const styleLabel = style === 'balanced' ? 'Balanced' : style === 'muted' ? 'Muted' : 'Punchy';
  const lines = [
    'GIMP Palette',
    `Name: PIXEL.PAL ${name} ${styleLabel}`,
    `Columns: ${entries.length}`,
    '#',
  ];
  entries.forEach(({ hex, label }) => {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${pad3(r)} ${pad3(g)} ${pad3(b)}\t${name} ${label}`);
  });
  return lines.join('\n') + '\n';
}

// Shared clipboard helper: Clipboard API first, textarea + execCommand
// fallback for older surfaces / non-secure contexts. Factors out the
// identical pattern that copyHex, copyPaletteToClipboard, and
// copyRampToClipboard all repeated inline before this extraction.
export async function copyTextToClipboard(text: string): Promise<boolean> {
  let success = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(text); success = true; } catch {}
  }
  if (!success) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      success = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {}
  }
  return success;
}
