// Per-ramp active-style derivation + picker action (#69).
//
// Extracted from App.tsx (Task 6 landed these inline; pulled out here to keep
// App.tsx under the #113 line ratchet). Owns no state of its own: it reads the
// per-ramp style fields App.tsx sources from the store and returns the derived
// render array plus the picker handler.
//
//  - activeStyleFor(i): a ramp's resolved style (its override, else the palette
//    default).
//  - rampsActive: the single per-ramp render array (each ramp built at its own
//    resolved style, rather than one of the three global sets).
//  - setRampStyleOverride(i, style): the Color Ramps card's per-ramp picker.
//    Switching a ramp to 'custom' with no scalars yet seeds rampStyleScalars[i]
//    from the ramp's current resolved {reach, chromaFalloff} so the Task 7
//    sliders start where the ramp visually was, instead of snapping to the
//    balanced-preset fallback resolveRampScalars would otherwise use.
import { useCallback, useMemo } from 'react';
import { buildRamp } from '../lib/ramp-pipeline';
import type { RampSnapshot } from '../lib/snapshot-ramps';
import {
  resolveActiveStyle,
  resolveRampScalars,
  type RampStyle,
  type StylePresets,
  type StyleScalars,
} from '../lib/style-presets';

type StyleMapUpdater<V> = (prev: Record<number, V>) => Record<number, V>;

interface UseRampStyleActionsParams {
  liveRampSnapshot: RampSnapshot;
  rampStyleOverrides: Record<number, RampStyle>;
  rampStyleScalars: Record<number, StyleScalars>;
  paletteDefaultStyle: RampStyle;
  stylePresets: StylePresets;
  setRampStyleOverrides: (updater: StyleMapUpdater<RampStyle>) => void;
  setRampStyleScalars: (updater: StyleMapUpdater<StyleScalars>) => void;
}

export function useRampStyleActions({
  liveRampSnapshot,
  rampStyleOverrides,
  rampStyleScalars,
  paletteDefaultStyle,
  stylePresets,
  setRampStyleOverrides,
  setRampStyleScalars,
}: UseRampStyleActionsParams) {
  const activeStyleFor = useCallback(
    (i: number): RampStyle => resolveActiveStyle(rampStyleOverrides, i, paletteDefaultStyle),
    [rampStyleOverrides, paletteDefaultStyle],
  );

  const rampsActive = useMemo(
    () => liveRampSnapshot.baseColors.map((_, i) => buildRamp(liveRampSnapshot, activeStyleFor(i), i)),
    [liveRampSnapshot, activeStyleFor],
  );

  const setRampStyleOverride = useCallback((i: number, style: RampStyle) => {
    if (style === 'custom' && rampStyleScalars[i] === undefined) {
      const seeded = resolveRampScalars({
        style: activeStyleFor(i),
        baseIndex: i,
        stylePresets,
        rampStyleScalars,
      });
      setRampStyleScalars(prev => ({ ...prev, [i]: seeded }));
    }
    setRampStyleOverrides(prev => ({ ...prev, [i]: style }));
  }, [rampStyleScalars, activeStyleFor, stylePresets, setRampStyleScalars, setRampStyleOverrides]);

  return { activeStyleFor, rampsActive, setRampStyleOverride };
}
