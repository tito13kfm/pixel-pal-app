import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import App from '../../src/App';
import {
  enableRenderCounts, disableRenderCounts, resetRenderCounts, getRenderCount,
} from '../../src/lib/renderCount';

// NOTE: do NOT wrap <App> in StrictMode here — StrictMode double-renders and would
// double the counts. RTL's render() does not add StrictMode, which is what we want.
describe('phase-a memo: panel render isolation', () => {
  beforeEach(() => disableRenderCounts());

  it('HistoryPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    // History uses `{open && children}`, so expand it to mount the panel.
    fireEvent.click(screen.getByTitle('Expand the History panel (undo/redo)'));
    resetRenderCounts();
    // Orthogonal interaction: Tips toggle. `tipsOpen` is passed to no panel.
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('HistoryPanel')).toBe(0);
  });

  it('PlaygroundPanel does not re-render on an orthogonal (Tips) toggle', () => {
    enableRenderCounts();
    render(<App />);
    // PlaygroundPanel is keepMounted, so it is already mounted — no expand needed.
    resetRenderCounts();
    fireEvent.click(screen.getByTitle('Expand Tips'));
    expect(getRenderCount('PlaygroundPanel')).toBe(0);
  });

  it('PlaygroundPanel renders at least once on mount (memo is not over-aggressive)', () => {
    enableRenderCounts();
    render(<App />);
    expect(getRenderCount('PlaygroundPanel')).toBeGreaterThan(0);
  });
});
