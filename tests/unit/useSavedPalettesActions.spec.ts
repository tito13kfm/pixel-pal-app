import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedPalettesActions } from '../../src/hooks/useSavedPalettesActions';
import { useRampsStore } from '../../src/store/rampsStore';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => (store.has(key) ? { value: store.get(key)! } : null),
    set: async (key: string, value: string) => { store.set(key, value); return { ok: true }; },
    delete: async (key: string) => { store.delete(key); return { ok: true }; },
    list: async (prefix: string) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)) }),
  };
}

function setup() {
  const state: any = {
    savedPalettes: [], saveName: '', savedError: '', savedBusy: false,
    confirmDeleteSlug: null, renamingSlug: null, renameDraft: '', renameError: '',
    spriteKey: 'nes', customSprites: {}, gamutPerRamp: {}, advancedOpen: {},
  };
  const params = {
    savedPalettes: state.savedPalettes,
    setSavedPalettes: (v: any[]) => { state.savedPalettes = v; },
    saveName: state.saveName,
    setSaveName: (v: string) => { state.saveName = v; },
    setSavedError: (v: string) => { state.savedError = v; },
    setSavedBusy: (v: boolean) => { state.savedBusy = v; },
    confirmDeleteSlug: state.confirmDeleteSlug,
    setConfirmDeleteSlug: (v: string | null) => { state.confirmDeleteSlug = v; },
    setRenamingSlug: (v: string | null) => { state.renamingSlug = v; },
    renameDraft: state.renameDraft,
    setRenameDraft: (v: string) => { state.renameDraft = v; },
    setRenameError: (v: string) => { state.renameError = v; },
    spriteKey: state.spriteKey,
    setSpriteKey: (v: string) => { state.spriteKey = v; },
    customSprites: state.customSprites,
    setCustomSprites: (fn: any) => { state.customSprites = fn(state.customSprites); },
    gamutPerRamp: state.gamutPerRamp,
    setGamutPerRamp: (v: any) => { state.gamutPerRamp = v; },
    advancedOpen: state.advancedOpen,
    setAdvancedOpen: (v: any) => { state.advancedOpen = v; },
    setV2NoticePending: vi.fn(),
    setExportFeedback: vi.fn(),
    tagNextLabel: vi.fn(),
    // Mirrors the real resetPaletteState (usePaletteReset.ts), which clears
    // lospecSource as part of the shared reset. A no-op mock here would
    // diverge from production and give a false characterization signal.
    resetPaletteState: vi.fn(() => useRampsStore.setState({ lospecSource: null } as any)),
  };
  const hook = renderHook(() => useSavedPalettesActions(params));
  return { hook, params, state };
}

describe('useSavedPalettesActions', () => {
  beforeEach(() => {
    (window as any).storage = makeMockStorage();
    useRampsStore.setState({ baseColors: ['#ff00ff'], aiColorNames: [], hardwareLock: null, shuffleSeed: 5, lospecSource: null } as any);
  });
  afterEach(() => vi.restoreAllMocks());

  it('loadClassicPalette sets baseColors/names, resets, clears hardwareLock and shuffleSeed', () => {
    useRampsStore.setState({ hardwareLock: 'nes', shuffleSeed: 5 } as any);
    const { hook, params } = setup();
    act(() => { hook.result.current.loadClassicPalette({ name: 'NES', baseColors: ['#111111', '#222222'], names: ['A', 'B'] }); });
    expect(useRampsStore.getState().baseColors).toEqual(['#111111', '#222222']);
    expect(useRampsStore.getState().aiColorNames).toEqual(['A', 'B']);
    expect(useRampsStore.getState().hardwareLock).toBeNull();
    expect(useRampsStore.getState().shuffleSeed).toBe(0);
    expect(params.resetPaletteState).toHaveBeenCalled();
    expect(params.setExportFeedback).toHaveBeenCalledWith('Loaded "NES"');
  });

  it('loadClassicPalette clears lospecSource via the shared reset, carries no provenance', () => {
    // resetPaletteState is mocked to mirror production (it clears
    // lospecSource); loadClassicPalette itself never passes provenance, so
    // the net result is null either way.
    useRampsStore.setState({ lospecSource: { slug: 'x', title: 'X', author: 'A', url: 'u' } } as any);
    const { hook } = setup();
    act(() => { hook.result.current.loadClassicPalette({ name: 'NES', baseColors: ['#111111'] }); });
    expect(useRampsStore.getState().lospecSource).toBeNull();
  });

  it('applyGplImport "all" mode dedupes and caps at 16', () => {
    const { hook, params } = setup();
    act(() => { hook.result.current.setGplImport({ name: 'Test', colors: Array.from({ length: 20 }, (_, i) => `#${(i % 5).toString(16).repeat(6)}`), error: null }); });
    act(() => { hook.result.current.applyGplImport('all'); });
    expect(useRampsStore.getState().baseColors.length).toBeLessThanOrEqual(16);
    expect(params.resetPaletteState).toHaveBeenCalled();
  });

  it('loadLospecPalette sets baseColors and lospecSource provenance', () => {
    const { hook } = setup();
    const palette = { slug: 'greyt-bit', title: 'Greyt-bit', colors: ['#574368', '#ffffff'], numberOfColors: 2, author: 'Sam Keddy', url: 'https://lospec.com/palette-list/greyt-bit' };
    act(() => { hook.result.current.loadLospecPalette(palette, 'all'); });
    expect(useRampsStore.getState().baseColors).toEqual(['#574368', '#ffffff']);
    expect(useRampsStore.getState().lospecSource).toEqual({ slug: 'greyt-bit', title: 'Greyt-bit', author: 'Sam Keddy', url: 'https://lospec.com/palette-list/greyt-bit' });
  });

  it('save -> refresh -> load round-trips lospecSource provenance', async () => {
    const { hook, params, state } = setup();
    const palette = { slug: 'a', title: 'A', colors: ['#111111'], numberOfColors: 1, author: 'Auth', url: 'https://lospec.com/palette-list/a' };
    act(() => { hook.result.current.loadLospecPalette(palette, 'all'); });
    params.saveName = 'My Lospec Save';
    (hook.rerender as any)();
    await act(async () => { await hook.result.current.saveCurrentPalette(); });
    // params.savedPalettes is a value snapshot taken when setup() built the
    // params object; setSavedPalettes reassigns state.savedPalettes, which
    // params.savedPalettes does not track. Read the live value off state.
    const listed = state.savedPalettes as any[];
    expect(listed[0]?.lospecSource ?? null).not.toBeNull();
    useRampsStore.setState({ lospecSource: null } as any);
    await act(async () => { await hook.result.current.loadPalette(listed[0].slug); });
    expect(useRampsStore.getState().lospecSource).toEqual(palette && { slug: 'a', title: 'A', author: 'Auth', url: 'https://lospec.com/palette-list/a' });
  });

  it('loadLospecPalette with empty colors surfaces feedback instead of silently no-oping', () => {
    const { hook, params } = setup();
    const palette = { slug: 'empty', title: 'Empty Palette', colors: [], numberOfColors: 0, author: 'A', url: 'https://lospec.com/palette-list/empty' };
    act(() => { hook.result.current.loadLospecPalette(palette, 'all'); });
    expect(params.setExportFeedback).toHaveBeenCalledWith(expect.stringMatching(/.+/));
    // Early return still guards the actual state write: baseColors unchanged.
    expect(useRampsStore.getState().baseColors).toEqual(['#ff00ff']);
  });

  it('loading a legacy payload (no lospecSource field) clears it to null', async () => {
    const { hook } = setup();
    await (window as any).storage.set('palettes:legacy', JSON.stringify({ name: 'Legacy', baseColors: ['#123456'], savedAt: 1 }));
    useRampsStore.setState({ lospecSource: { slug: 'x', title: 'X', author: 'A', url: 'u' } } as any);
    await act(async () => { await hook.result.current.loadPalette('legacy'); });
    expect(useRampsStore.getState().lospecSource).toBeNull();
  });
});
