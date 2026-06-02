import { describe, it, expect } from 'vitest';
import { dedupeEntries, buildGpl, buildJascPal } from '../../src/lib/palette-export';

describe('dedupeEntries', () => {
  it('keeps first occurrence by lowercased hex, drops empties', () => {
    const out = dedupeEntries([
      { hex: '#FF0000', name: 'red a' },
      { hex: '#ff0000', name: 'red b' }, // dup (case-insensitive)
      { hex: '', name: 'empty' },        // dropped
      { hex: '#00ff00', name: 'green' },
    ]);
    expect(out).toEqual([
      { hex: '#FF0000', name: 'red a' },
      { hex: '#00ff00', name: 'green' },
    ]);
  });
});

describe('buildGpl', () => {
  it('emits canonical GIMP palette text', () => {
    const text = buildGpl(
      [{ hex: '#ff0000', name: 'Color 1 base' }, { hex: '#00ff00', name: 'Color 2 base' }],
      { paletteName: 'PIXEL.PAL Punchy', columns: 8 },
    );
    expect(text).toBe(
      'GIMP Palette\nName: PIXEL.PAL Punchy\nColumns: 8\n#\n' +
      '255   0   0\tColor 1 base\n' +
      '  0 255   0\tColor 2 base\n'
    );
  });
});

describe('buildJascPal', () => {
  it('emits JASC-PAL text with CRLF endings', () => {
    const text = buildJascPal([{ hex: '#ff0000', name: 'r' }, { hex: '#00ff00', name: 'g' }]);
    expect(text).toBe('JASC-PAL\r\n0100\r\n2\r\n255 0 0\r\n0 255 0\r\n');
  });
});
