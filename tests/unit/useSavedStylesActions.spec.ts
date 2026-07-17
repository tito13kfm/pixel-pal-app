// useSavedStylesActions: named save/load of custom ramp styles (#69).
// Round-trip against a mocked window.storage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedStylesActions } from '../../src/hooks/useSavedStylesActions';

function makeMockStorage() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => (store.has(key) ? { value: store.get(key)! } : null),
    set: async (key: string, value: string) => { store.set(key, value); return { ok: true }; },
    delete: async (key: string) => { store.delete(key); return { ok: true }; },
    list: async (prefix: string) => ({ keys: [...store.keys()].filter(k => k.startsWith(prefix)) }),
  };
}

function setup() {
  const rampStyleScalars: { current: Record<number, { reach: number; chromaFalloff: number }> } = { current: {} };
  const setRampStyleScalars = (updater: (prev: typeof rampStyleScalars.current) => typeof rampStyleScalars.current) => {
    rampStyleScalars.current = updater(rampStyleScalars.current);
  };
  const rampStyleOverrides: { current: Record<number, string> } = { current: {} };
  const setRampStyleOverrides = (updater: (prev: typeof rampStyleOverrides.current) => typeof rampStyleOverrides.current) => {
    rampStyleOverrides.current = updater(rampStyleOverrides.current);
  };
  const tagNextLabel = vi.fn();
  const hook = renderHook(() => useSavedStylesActions({ setRampStyleScalars, setRampStyleOverrides, tagNextLabel }));
  return { hook, rampStyleScalars, rampStyleOverrides, tagNextLabel };
}

describe('useSavedStylesActions', () => {
  beforeEach(() => {
    (window as any).storage = makeMockStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips save -> refresh (newest first) -> loadOntoRamp -> delete', async () => {
    const { hook, rampStyleScalars, rampStyleOverrides, tagNextLabel } = setup();

    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000);
    await act(async () => { await hook.result.current.saveStyle('Sunset', { reach: 0.5, chromaFalloff: 0.3 }); });
    nowSpy.mockReturnValueOnce(2000);
    await act(async () => { await hook.result.current.saveStyle('Ocean', { reach: 0.2, chromaFalloff: 0.9 }); });
    nowSpy.mockRestore();

    expect(hook.result.current.savedStyles.map(s => s.name)).toEqual(['Ocean', 'Sunset']);

    const sunset = hook.result.current.savedStyles.find(s => s.name === 'Sunset')!;
    expect(sunset).toBeTruthy();

    await act(async () => { await hook.result.current.loadStyleOntoRamp(sunset.slug, 2); });
    expect(rampStyleScalars.current[2]).toEqual({ reach: 0.5, chromaFalloff: 0.3 });
    expect(rampStyleOverrides.current[2]).toBe('custom');
    expect(tagNextLabel).toHaveBeenCalledWith('Load ramp style');

    await act(async () => { await hook.result.current.deleteStyle(sunset.slug); });
    expect(hook.result.current.savedStyles.map(s => s.name)).toEqual(['Ocean']);
  });

  it('rejects an empty name without touching storage', async () => {
    const { hook } = setup();
    await act(async () => { await hook.result.current.saveStyle('   ', { reach: 0.1, chromaFalloff: 0.1 }); });
    expect(hook.result.current.savedStyles).toEqual([]);
    expect(hook.result.current.error).toMatch(/name/i);
  });
});
