// tests/unit/save-file.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveFile } from '../../src/lib/save-file';

describe('saveFile (browser fallback)', () => {
  let createdAnchors: HTMLAnchorElement[] = [];
  let createdUrls: string[] = [];
  let revokedUrls: string[] = [];

  beforeEach(() => {
    if ('__TAURI_INTERNALS__' in window) {
      // @ts-expect-error test setup
      delete window.__TAURI_INTERNALS__;
    }
    createdAnchors = [];
    createdUrls = [];
    revokedUrls = [];
    Object.defineProperty(URL, 'createObjectURL', { value: () => '', writable: true, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: () => {}, writable: true, configurable: true });
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob) => {
      const u = `blob:mock/${createdUrls.length}`;
      createdUrls.push(u);
      return u;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
      revokedUrls.push(u);
    });
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag) as HTMLElement;
      if (tag === 'a') {
        const a = el as HTMLAnchorElement;
        a.click = vi.fn();
        createdAnchors.push(a);
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes a text blob with the supplied filename and triggers a download click', async () => {
    const result = await saveFile({
      defaultName: 'palette.txt',
      filters: [{ name: 'Pixel Pal palette', extensions: ['txt'] }],
      data: { text: '#ffaabb\n#001122\n' },
      folderKey: 'txt',
    });
    expect(result.ok).toBe(true);
    expect(createdAnchors).toHaveLength(1);
    expect(createdAnchors[0].download).toBe('palette.txt');
    expect(createdAnchors[0].click).toHaveBeenCalledOnce();
    expect(createdUrls).toHaveLength(1);
  });

  it('writes a binary Blob input untouched', async () => {
    const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
    const result = await saveFile({
      defaultName: 'snap.png',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      data: { bytes: png },
      folderKey: 'png',
    });
    expect(result.ok).toBe(true);
    expect(createdAnchors[0].download).toBe('snap.png');
  });

  it('writes a Uint8Array binary input wrapped in a Blob', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = await saveFile({
      defaultName: 'bin.gpl',
      filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
      data: { bytes },
      folderKey: 'gpl',
    });
    expect(result.ok).toBe(true);
  });
});
