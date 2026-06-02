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

/** Canonical GIMP palette (.gpl). Byte-identical to the legacy inline builder.
 *  Entries must be pre-deduped (call dedupeEntries first). */
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

/** JASC-PAL (.pal), read by GrafX2 / Paint Shop Pro. CRLF for old-parser safety.
 *  Entries must be pre-deduped (call dedupeEntries first). */
export function buildJascPal(entries: PaletteEntry[]): string {
  const lines = ['JASC-PAL', '0100', String(entries.length)];
  for (const { hex } of entries) {
    const { r, g, b } = hexToRgb(hex);
    lines.push(`${r} ${g} ${b}`);
  }
  return lines.join('\r\n') + '\r\n';
}

/** Adobe Swatch Exchange (.ase), big-endian binary. Flat (no group blocks),
 *  matching the flat dedup of the text formats. Targets Photoshop / Illustrator
 *  / Krita — NOT Aseprite (whose .ase/.aseprite sprite files are unrelated).
 *  Entries must be pre-deduped (call dedupeEntries first). */
export function buildAse(entries: PaletteEntry[]): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push((n >>> 8) & 0xff, n & 0xff);
  const u32 = (n: number) => out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  const f32 = (v: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, false); // big-endian
    out.push(b[0], b[1], b[2], b[3]);
  };
  const ascii = (s: string) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff); };

  ascii('ASEF');
  u16(1); u16(0);          // version 1.0
  u32(entries.length);     // block count

  for (const { hex, name } of entries) {
    const label = name && name.length ? name : hex;
    const codeUnits = label.length + 1;                 // incl trailing null
    const bodyLen = 2 + codeUnits * 2 + 4 + 12 + 2;     // nameLen + name + 'RGB ' + 3 floats + type
    u16(0x0001);           // block type: color entry
    u32(bodyLen);
    u16(codeUnits);        // name length in UTF-16 units (incl null)
    for (let i = 0; i < label.length; i++) {
      const c = label.charCodeAt(i);
      out.push((c >>> 8) & 0xff, c & 0xff);             // UTF-16BE
    }
    out.push(0, 0);        // null terminator
    ascii('RGB ');         // color model (trailing space matters)
    const { r, g, b } = hexToRgb(hex);
    f32(r / 255); f32(g / 255); f32(b / 255);
    u16(0x0002);           // color type: normal
  }
  return new Uint8Array(out);
}
