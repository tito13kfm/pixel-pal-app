import { rgbToHex, rgbToHsl, hexToHsl } from './color';

export interface PiskelSprite {
  pattern: string[];
  width: number;
  height: number;
  numShades: number;
}

// ---------- Piskel C parser ----------
export const parsePiskelC = (text: string): PiskelSprite | null => {
  try {
    const hexValues = text.match(/0x[0-9a-fA-F]{8}/g);
    if (!hexValues || hexValues.length < 16) return null;

    let width: number | null = null, height: number | null = null;
    const widthMatch = text.match(/FRAME_WIDTH\s+(\d+)/);
    const heightMatch = text.match(/FRAME_HEIGHT\s+(\d+)/);
    if (widthMatch) width = parseInt(widthMatch[1]);
    if (heightMatch) height = parseInt(heightMatch[1]);

    if (!width || !height) {
      const sqrt = Math.sqrt(hexValues.length);
      if (Number.isInteger(sqrt)) { width = sqrt; height = sqrt; }
      else return null;
    }
    if (hexValues.length < width * height) return null;

    const pixelCount = width * height;
    const pixels = hexValues.slice(0, pixelCount);

    const uniqueColors = new Map<string, number>();
    for (const hex of pixels) {
      if (hex === '0x00000000') continue;
      if (hex.substring(0, 4).toLowerCase() === '0x00') continue;
      if (!uniqueColors.has(hex)) {
        const colorPart = hex.slice(4);
        const r = parseInt(colorPart.slice(0, 2), 16);
        const g = parseInt(colorPart.slice(2, 4), 16);
        const b = parseInt(colorPart.slice(4, 6), 16);
        uniqueColors.set(hex, rgbToHsl({ r, g, b }).l);
      }
    }
    if (uniqueColors.size === 0) return null;

    const sortedColors = Array.from(uniqueColors.entries()).sort((a, b) => a[1] - b[1]);
    const numShades = sortedColors.length;
    const colorToIndex = new Map<string, number>();
    sortedColors.forEach(([hex], i) => colorToIndex.set(hex, i));

    const pattern = [];
    for (let y = 0; y < height; y++) {
      let row = '';
      for (let x = 0; x < width; x++) {
        const hex = pixels[y * width + x];
        if (hex === '0x00000000' || hex.substring(0, 4).toLowerCase() === '0x00') {
          row += '.';
        } else {
          const idx = colorToIndex.get(hex)!;
          row += idx < 10 ? String(idx) : String.fromCharCode(87 + idx);
        }
      }
      pattern.push(row);
    }
    return { pattern, width, height, numShades };
  } catch (err) {
    console.error('Parse failed:', err);
    return null;
  }
};

// ---------- GIMP Palette (.gpl) parser ----------
// Handles GIMP canonical format plus common dialects:
// - Aseprite's "Channels: RGBA" extension (we just ignore the alpha column)
// - Piskel's "Name: Untitled" non-issue (name is purely cosmetic on import)
// - Tolerates blank lines, leading/trailing whitespace, comment lines (#),
//   and tabs or any whitespace between R G B values.
// Returns { name, colors } where colors is an array of '#rrggbb' strings,
// or null if parsing failed. Duplicate colors are NOT collapsed here; the
// caller decides (the modal shows the raw count).
export interface GplPalette {
  name: string;
  colors: string[];
}
export const parseGpl = (text: string): GplPalette | null => {
  try {
    if (typeof text !== 'string') return null;
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return null;
    // First non-empty line must be "GIMP Palette" (case-insensitive).
    let i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) return null;
    if (lines[i].trim().toLowerCase() !== 'gimp palette') return null;
    i++;

    let name = '';
    let hasRgba = false; // Aseprite extension: 4 values per line instead of 3.
    const colors = [];

    for (; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (line === '') continue;
      if (line.startsWith('#')) continue;

      // Header lines: "Name:", "Columns:", "Channels:" etc.
      const headerMatch = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/);
      if (headerMatch) {
        const key = headerMatch[1].toLowerCase();
        const val = headerMatch[2].trim();
        if (key === 'name') name = val;
        else if (key === 'channels' && /rgba/i.test(val)) hasRgba = true;
        // Other headers (Columns, etc.) are ignored.
        continue;
      }

      // Color line: 3 (or 4 if RGBA) whitespace-separated ints, optionally
      // followed by a name. We capture the first 3-4 integers and ignore
      // anything after.
      const nums = line.split(/\s+/).filter(Boolean);
      const expected = hasRgba ? 4 : 3;
      if (nums.length < expected) continue;
      const r = parseInt(nums[0], 10);
      const g = parseInt(nums[1], 10);
      const b = parseInt(nums[2], 10);
      // Some files have RGBA without declaring Channels. Detect by looking
      // at whether the fourth token is also a clamped int 0-255 and the
      // first non-numeric token comes after position 4.
      if (!hasRgba && nums.length >= 4) {
        const a = parseInt(nums[3], 10);
        if (!Number.isNaN(a) && a >= 0 && a <= 255) {
          // Could be RGBA or RGB with a numeric name like "255". Ambiguous.
          // Conservative call: assume RGB and let the 4th token be name-ish.
        }
      }
      if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) continue;
      if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) continue;
      colors.push(rgbToHex(r, g, b));
    }

    if (colors.length === 0) return null;
    return { name: name || 'Imported Palette', colors };
  } catch {
    return null;
  }
};

// ---------- GPL auto-subset heuristic ----------
// Given a flat array of hex colors, pick 4-6 representative bases by:
// 1. Deduplicating exact hex matches.
// 2. Filtering to "mid-lightness" range (L between 30 and 70) since the
//    ramp generator produces both shadows and highlights from each base.
//    Pure-dark and pure-light bases produce degenerate ramps.
// 3. Sorting by hue and sampling N evenly-spaced colors where N is the
//    midpoint of 4-6 unless the filtered pool is smaller.
// 4. Fallback: if mid-lightness filtering leaves <3 colors, fall back to
//    all unique colors and sample from there.
export const subsetGplColors = (colors: string[]): string[] => {
  if (!Array.isArray(colors) || colors.length === 0) return [];
  // Dedupe (case-insensitive, normalized).
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const hex of colors) {
    const n = hex.toLowerCase();
    if (!seen.has(n)) { seen.add(n); unique.push(n); }
  }
  if (unique.length <= 6) return unique;

  // Filter mid-lightness.
  const mid = unique.filter(hex => {
    const { l } = hexToHsl(hex);
    return l >= 30 && l <= 70;
  });
  const pool = mid.length >= 3 ? mid : unique;

  // Sort by hue (grayscale colors get hue 0; that's fine for ordering).
  const sorted = [...pool].sort((a, b) => (hexToHsl(a).h as number) - (hexToHsl(b).h as number));

  // Target 5 representatives.
  const target = Math.min(5, sorted.length);
  if (target === sorted.length) return sorted;
  const out: string[] = [];
  for (let k = 0; k < target; k++) {
    const idx = Math.round((k * (sorted.length - 1)) / (target - 1));
    out.push(sorted[idx]);
  }
  // Dedupe again in case the spacing landed on the same hex twice.
  return [...new Set(out)];
};
