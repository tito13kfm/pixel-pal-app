import { describe, it, expect, beforeEach } from 'vitest';
import {
  enableRenderCounts, disableRenderCounts, resetRenderCounts,
  getRenderCount, recordRender,
} from '../../src/lib/renderCount';

describe('renderCount harness', () => {
  beforeEach(() => disableRenderCounts());

  it('is a no-op until enabled', () => {
    recordRender('X');
    expect(getRenderCount('X')).toBe(0);
  });

  it('counts after enable and resets on reset', () => {
    enableRenderCounts();
    recordRender('X');
    recordRender('X');
    expect(getRenderCount('X')).toBe(2);
    resetRenderCounts();
    expect(getRenderCount('X')).toBe(0);
  });
});
