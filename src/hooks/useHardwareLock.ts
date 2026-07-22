// Hardware-lock handlers (#113): toggle the render-time lock and bake the
// snapped output into permanent pins.
//
// Extracted from App.tsx. Document state flows through the Zustand-backed
// usePaletteState() (same pattern as useRampEditing); activeHardware (the
// resolved HARDWARE_PALETTES entry) and gamutPerRamp (App-local state, not
// store-backed) plus the cross-domain callbacks arrive via params.
import { usePaletteState } from './usePaletteState';
import { HARDWARE_PALETTES } from '../lib/constants';
import { quantizeToHardware } from '../lib/hardware-quantize';
import { applyOverrides, resolveBaseForRamp, resolveSizeForRamp, resolveHueShiftForRamp, generateRamp } from '../lib/ramp-helpers';
import { resolveActiveStyle } from '../lib/style-presets';
import type { GamutStrategySerialized } from '../lib/palette';

// The resolved hardware palette object (a HARDWARE_PALETTES entry) when
// locked; the store only holds the id string.
type HardwarePalette = (typeof HARDWARE_PALETTES)[number];

interface UseHardwareLockParams {
  activeHardware: HardwarePalette | null;
  gamutPerRamp: Record<string, GamutStrategySerialized>;
  tagNextLabel: (label: string) => void;
  setExportFeedback: (v: string) => void;
}

export function useHardwareLock(p: UseHardwareLockParams) {
  const { activeHardware, gamutPerRamp, tagNextLabel, setExportFeedback } = p;
  const {
    baseColors, hardwareLock, setHardwareLock, setOverrides,
    rampSize, rampSizeOverrides, rampSatOverrides,
    hueShiftStrength, hueShiftStrengthPerRamp, shuffleSeed, rampShuffleOffsets,
    lightnessCurvePerRamp, satCurvePerRamp, stylePresets,
    rampStyleOverrides, paletteDefaultStyle,
  } = usePaletteState();

  // toggleHardwareLock: switches the hardware lock on/off. If already locked
  // to the given hardware, clicking again unlocks. If locked to a different
  // hardware, switches the lock target. Setting the lock is NON-destructive:
  // baseColors and overrides are preserved as-is. The lock is applied at
  // render time via the hardware-snap step in buildRamp (ramp-pipeline.ts).
  // This means unlocking restores the full free-generation ramps without
  // data loss.
  //
  // Pin overrides ARE retained while locked but get snapped on output via
  // the order of operations in buildRamp (overrides run first, then the
  // hardware snap covers everything including the pinned hex).
  // This was a deliberate choice: clearing pins on lock would force the
  // user to re-pin every time they toggled. Instead, pinned hexes get
  // visually snapped while locked and reappear as the user's chosen hex
  // when unlocked.
  const toggleHardwareLock = (hardwareId: string) => {
    if (hardwareLock === hardwareId) {
      tagNextLabel('Unlock hardware');
      setHardwareLock(null);
      setExportFeedback(`Unlocked from hardware`);
    } else {
      const hw = HARDWARE_PALETTES.find(h => h.id === hardwareId);
      tagNextLabel(hw ? `Lock to ${hw.name}` : 'Lock hardware');
      setHardwareLock(hardwareId);
      setExportFeedback(hw ? `Locked to ${hw.name}` : 'Locked');
    }
    setTimeout(() => setExportFeedback(''), 2000);
  };

  // bakeHardwareLock: convert the currently-snapped output into permanent
  // pins so the user can keep editing without reverting to non-legal hexes.
  //
  // Strategy (the "diff-only" option from the analysis): for each
  // (base, shade, style), compute the post-pin pre-snap value `withPins`
  // and the post-snap value `snapped`. Pin the (base, shade, style) only
  // when snapped !== withPins. This minimizes pin bloat: shades the lock
  // wouldn't have changed are left procedural so future tweaks
  // (rampSize, hue shift, base color edits, sat multiplier) still affect
  // them naturally. Shades the lock DID change become permanent pins.
  //
  // Existing pins on shades the lock would NOT have changed are preserved
  // verbatim. Existing pins on shades the lock WOULD have changed get
  // REPLACED with the snapped value (because the user was looking at the
  // snapped output anyway; preserving the unsnapped pin would silently
  // un-bake that one shade).
  //
  // Per-style independence: a pin in (i, j, 'punchy') doesn't affect
  // (i, j, 'balanced'). Each style is baked independently.
  //
  // Dedup note: buildRamp's hardware snap dedupes consecutive duplicates for
  // DISPLAY, but bake pins by the pre-dedup shade index (every slot of
  // the full ramp). After unlocking, an 8-shade ramp on Game Boy will
  // show 8 slots with consecutive duplicates rather than the 4-color
  // deduped view. To get the deduped view back, use hidden shades.
  // Trade-off: the pin grid stays slot-aligned with the rest of the app.
  //
  // Clears hardwareLock to null after writing pins, since the same hexes
  // are now baked in. History entry tagged 'Bake hardware lock'.
  const bakeHardwareLock = () => {
    if (!activeHardware) return;
    tagNextLabel('Bake hardware lock');
    const STYLES = ['punchy', 'balanced', 'muted'] as const;
    setOverrides(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      for (let i = 0; i < baseColors.length; i++) {
        const effBase = resolveBaseForRamp(baseColors[i], i, rampSatOverrides);
        const effSize = resolveSizeForRamp(i, rampSizeOverrides, rampSize);
        // Must resolve per-ramp same as buildRamp (ramp-pipeline.ts), or a
        // ramp with a hue-shift override bakes pins against a ramp the user
        // never saw on screen.
        const effHueShift = resolveHueShiftForRamp(i, hueShiftStrengthPerRamp, hueShiftStrength);
        const activeStyle = resolveActiveStyle(rampStyleOverrides, i, paletteDefaultStyle);
        const stylesToBake: readonly ('punchy' | 'balanced' | 'muted' | 'custom')[] = activeStyle === 'custom'
          ? [...STYLES, 'custom'] as const
          : STYLES;
        for (const style of stylesToBake) {
          const raw = generateRamp(effBase, effSize, style, effHueShift, i, {
            gamutPerRamp, stylePresets, shuffleSeed, rampShuffleOffsets, lightnessCurvePerRamp, satCurvePerRamp,
          });
          // The store types overrides opaquely (Record<string, unknown>);
          // this is the real per-shade pin map shape applyOverrides reads.
          const withPins = applyOverrides(raw, i, prev as Parameters<typeof applyOverrides>[2], style);
          const snapped = withPins.map(hex => quantizeToHardware(hex, activeHardware));
          for (let j = 0; j < withPins.length; j++) {
            if (snapped[j] !== withPins[j]) {
              if (!next[i]) next[i] = {};
              if (!next[i][j]) next[i][j] = {};
              next[i][j][style] = snapped[j];
            }
          }
        }
      }
      return next;
    });
    setHardwareLock(null);
    setExportFeedback('Baked hardware lock into pins');
    setTimeout(() => setExportFeedback(''), 2500);
  };

  return { toggleHardwareLock, bakeHardwareLock };
}
