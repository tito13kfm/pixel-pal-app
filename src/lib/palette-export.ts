// src/lib/palette-export.ts
//
// Pure palette serializers. Each takes a pre-built, pre-deduped entry list
// and returns text or bytes — NO color/ramp logic lives here. The single
// source of those entries is App.tsx's collectPaletteEntries(), so .gpl /
// .pal / .ase cannot describe different color sets (mirror/round-trip rule).
import { hexToRgb } from './color';

export interface PaletteEntry {
  hex: string;
  name: string;
}

/** Keep first occurrence by lowercased hex; drop entries with empty hex.
 *  Matches the dedup that used to live inline in buildPaletteGpl. */
export function dedupeEntries(entries: PaletteEntry[]): PaletteEntry[] {
  const seen = new Set<string>();
  const out: PaletteEntry[] = [];
  for (const e of entries) {
    const key = (e.hex || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

const pad3 = (n: number): string => String(n).padStart(3, ' ');

/** Canonical GIMP palette (.gpl). Byte-identical to the legacy inline builder. */
export function buildGpl(
  entries: PaletteEntry[],
  opts: { paletteName: string; columns: number },
): string {
  const lines = ['GIMP Palette', `Name: ${opts.paletteName}`, `Columns: ${opts.columns}`, '#'];
  for (const { hex, name } of entries) {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${pad3(r)} ${pad3(g)} ${pad3(b)}\t${name}`);
  }
  return lines.join('\n') + '\n';
}

/** JASC-PAL (.pal), read by GrafX2 / Paint Shop Pro. CRLF for old-parser safety. */
export function buildJascPal(entries: PaletteEntry[]): string {
  const lines = ['JASC-PAL', '0100', String(entries.length)];
  for (const { hex } of entries) {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${r} ${g} ${b}`);
  }
  return lines.join('\r\n') + '\r\n';
}
