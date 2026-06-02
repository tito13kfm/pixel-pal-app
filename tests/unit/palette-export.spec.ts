import { describe, it, expect } from 'vitest';
import { dedupeEntries, buildGpl, buildJascPal, buildAse } from '../../src/lib/palette-export';

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

describe('buildAse', () => {
  it('emits a valid ASEF file: header, count, one normal RGB color block', () => {
    const bytes = buildAse([{ hex: '#ff0000', name: 'red' }]);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('ASEF');
    expect(dv.getUint16(4, false)).toBe(1);
    expect(dv.getUint16(6, false)).toBe(0);
    expect(dv.getUint32(8, false)).toBe(1);
    expect(dv.getUint16(12, false)).toBe(0x0001);
    // body length: 2 (nameLen) + 2*4 (name 'red'+null UTF16) + 4 ('RGB ') + 12 (3 floats) + 2 (type) = 28
    expect(dv.getUint32(14, false)).toBe(28);
    expect(dv.getUint16(18, false)).toBe(4);
    expect([bytes[20], bytes[21], bytes[22], bytes[23], bytes[24], bytes[25]])
      .toEqual([0x00, 0x72, 0x00, 0x65, 0x00, 0x64]);
    expect([bytes[26], bytes[27]]).toEqual([0x00, 0x00]);
    expect(String.fromCharCode(bytes[28], bytes[29], bytes[30], bytes[31])).toBe('RGB ');
    expect(dv.getFloat32(32, false)).toBe(1);
    expect(dv.getFloat32(36, false)).toBe(0);
    expect(dv.getFloat32(40, false)).toBe(0);
    expect(dv.getUint16(44, false)).toBe(0x0002);
  });

  it('falls back to hex as the swatch name when name is empty', () => {
    const bytes = buildAse([{ hex: '#0000ff', name: '' }]);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(dv.getUint16(18, false)).toBe(8); // '#0000ff'.length + 1
  });
});

// Anti-drift contract: the three palette-file formats are all fed the SAME
// entry list by App.tsx's collectPaletteEntries, so none may drop or reorder
// colors. Locked here: for one shared fixture, every format encodes the same count.
describe('format color-count parity', () => {
  it('gpl / pal / ase encode the same number of colors for one fixture', () => {
    const entries = [
      { hex: '#ff0000', name: 'a' },
      { hex: '#00ff00', name: 'b' },
      { hex: '#0000ff', name: 'c' },
    ];
    const gplCount = buildGpl(entries, { paletteName: 'X', columns: 8 })
      .split('\n').filter((l) => /^\s*\d+\s+\d+\s+\d+\t/.test(l)).length;
    const palCount = Number(buildJascPal(entries).split('\r\n')[2]);
    const aseCount = new DataView(buildAse(entries).buffer).getUint32(8, false);
    expect(gplCount).toBe(3);
    expect(palCount).toBe(3);
    expect(aseCount).toBe(3);
  });
});
