import { describe, it, expect } from 'vitest';
import { parseGpl, subsetGplColors, parsePiskelC } from '../../src/lib/palette-import';

describe('parseGpl', () => {
  it('parses a minimal GIMP palette into #rrggbb colors', () => {
    const gpl = 'GIMP Palette\nName: Test\n# comment\n255   0   0\t Red\n0 255 0 Green\n';
    expect(parseGpl(gpl)).toEqual({ name: 'Test', colors: ['#ff0000', '#00ff00'] });
  });
  it('rejects a file without the GIMP Palette header', () => {
    expect(parseGpl('not a palette\n255 0 0')).toBeNull();
  });
  it('returns null for non-string input', () => {
    expect(parseGpl(undefined as unknown as string)).toBeNull();
  });
  it('parses Aseprite Channels: RGBA palette (4-col lines)', () => {
    const gpl = 'GIMP Palette\nName: Ase\nChannels: RGBA\n255   0   0 255 Red\n0 255 0 128 Green\n';
    expect(parseGpl(gpl)).toEqual({ name: 'Ase', colors: ['#ff0000', '#00ff00'] });
  });
});

describe('subsetGplColors', () => {
  it('returns [] for empty input', () => {
    expect(subsetGplColors([])).toEqual([]);
  });
  it('dedupes case-insensitively and returns <=6 untouched', () => {
    expect(subsetGplColors(['#FF0000', '#ff0000', '#00ff00'])).toEqual(['#ff0000', '#00ff00']);
  });
  it('samples down to 5 representatives when given many', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      `#${(i * 12 % 256).toString(16).padStart(2, '0')}8040`);
    const out = subsetGplColors(many);
    expect(out.length).toBeLessThanOrEqual(5);
    out.forEach(h => expect(h).toMatch(/^#[0-9a-f]{6}$/));
  });
});

describe('parsePiskelC', () => {
  it('returns null when fewer than 16 pixels are present', () => {
    expect(parsePiskelC('0xff112233 0xff445566')).toBeNull();
  });
  it('parses a 4x4 single-color sprite into a pattern grid', () => {
    const px = Array(16).fill('0xffaa1020').join(' ');
    const text = `FRAME_WIDTH 4\nFRAME_HEIGHT 4\n${px}`;
    const result = parsePiskelC(text);
    expect(result).not.toBeNull();
    expect(result!.width).toBe(4);
    expect(result!.height).toBe(4);
    expect(result!.pattern).toHaveLength(4);
    expect(result!.numShades).toBe(1);
  });
  it('encodes multiple shades by lightness-sorted index', () => {
    const D = '0xff203040', L = '0xffe0f0ff';
    const px = [D,D,L,L, D,D,L,L, L,L,D,D, L,L,D,D].join(' ');
    const result = parsePiskelC(`FRAME_WIDTH 4\nFRAME_HEIGHT 4\n${px}`);
    expect(result).not.toBeNull();
    expect(result!.numShades).toBe(2);
    expect(result!.pattern).toEqual(['0011','0011','1100','1100']);
  });
});
