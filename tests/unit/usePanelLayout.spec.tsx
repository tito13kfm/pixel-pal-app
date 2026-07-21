// Regression coverage: corrupt 'ui:sectionOrder' localStorage must not crash
// the whole tree on mount. The 'ui:vizSubOpen' initializer wraps its
// JSON.parse in try/catch; sectionOrder's initializer did not.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePanelLayout } from '../../src/hooks/usePanelLayout';

describe('usePanelLayout', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to DEFAULT_SECTION_ORDER when ui:sectionOrder is corrupt, does not throw', () => {
    localStorage.setItem('ui:sectionOrder', '{not valid json');
    expect(() => renderHook(() => usePanelLayout())).not.toThrow();
    const { result } = renderHook(() => usePanelLayout());
    expect(result.current.sectionOrder).toEqual(result.current.DEFAULT_SECTION_ORDER);
  });
});
