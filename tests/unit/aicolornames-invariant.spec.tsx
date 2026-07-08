import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import App from '../../src/App';
import { useRampsStore } from '../../src/store/rampsStore';

// Issue #108: setAiColorNames's padding loop (App.tsx addColorAsBase /
// addHarmonyColor / addHarmonyPair / addHarmonyMany / handleImageClick) reads
// the sibling `baseColors` closure instead of the updater's own `prev`. This
// pins the invariant it's meant to preserve (aiColorNames stays index-aligned
// with baseColors after every add), including the fresh-mount case where the
// store starts desynced (baseColors=['#ff00ff'], aiColorNames=[]).
describe('aiColorNames stays aligned with baseColors after adds (#108)', () => {
  beforeEach(() => {
    useRampsStore.setState({ baseColors: ['#ff00ff'], aiColorNames: [] });
  });

  it('pads correctly from the fresh-mount desync and stays aligned across repeated adds', () => {
    const { container } = render(<App />);
    const hexInput = container.querySelector('[data-tour-id="hex-input"]') as HTMLInputElement;
    const addBtn = container.querySelector('[data-tour-id="add-base-btn"]') as HTMLButtonElement;
    expect(hexInput).toBeTruthy();
    expect(addBtn).toBeTruthy();

    const hexes = ['#111111', '#222222', '#333333'];
    for (const hex of hexes) {
      fireEvent.change(hexInput, { target: { value: hex } });
      fireEvent.click(addBtn);
      const { baseColors, aiColorNames } = useRampsStore.getState();
      expect(aiColorNames.length).toBe(baseColors.length);
    }

    const { baseColors, aiColorNames } = useRampsStore.getState();
    expect(baseColors.slice(1)).toEqual(hexes);
    expect(aiColorNames.length).toBe(baseColors.length);
  });
});
