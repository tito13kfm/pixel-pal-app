export const SNAPSHOT_FIELDS = [
  'baseColors', 'aiColorNames', 'aiReasoning', 'rampSize', 'shuffleSeed',
  'overrides', 'harmonyAnchor', 'rampSizeOverrides', 'rampSatOverrides',
  'hueShiftStrengthPerRamp', 'hiddenShades', 'rampShuffleOffsets',
  'hardwareLock', 'hueShiftStrength', 'lockedRamps', 'collapsedRamps',
  'lightnessCurvePerRamp', 'satCurvePerRamp', 'stylePresets',
  // engineVersion participates in undo/redo so a load→edit→undo round-trip
  // preserves the palette's engine. It changes only alongside a wholesale
  // baseColors replace (load, or resetPaletteState on new-palette actions,
  // which carry their own tagNextLabel) — never in isolation — so inferLabel
  // needs no dedicated case for it.
  'engineVersion',
] as const;

// Verbatim from App.tsx inferLabel — do not "improve". Characterized by spec.
export function inferLabel(prev: any, next: any): string {
  if (!prev || !next) return 'Edit';
  if (JSON.stringify(prev.baseColors) !== JSON.stringify(next.baseColors)) {
    if (prev.baseColors.length < next.baseColors.length) return 'Add ramp';
    if (prev.baseColors.length > next.baseColors.length) return 'Remove ramp';
    return 'Edit base color';
  }
  if (JSON.stringify(prev.overrides) !== JSON.stringify(next.overrides)) return 'Pin / unpin shade';
  if (JSON.stringify(prev.hiddenShades) !== JSON.stringify(next.hiddenShades)) return 'Hide / restore shade';
  if (JSON.stringify(prev.lockedRamps) !== JSON.stringify(next.lockedRamps)) return 'Lock / unlock ramp';
  if (JSON.stringify(prev.rampShuffleOffsets) !== JSON.stringify(next.rampShuffleOffsets)) return 'Shuffle ramp';
  if (JSON.stringify(prev.rampSatOverrides) !== JSON.stringify(next.rampSatOverrides)) return 'Adjust saturation';
  if (JSON.stringify(prev.hueShiftStrengthPerRamp) !== JSON.stringify(next.hueShiftStrengthPerRamp)) return 'Adjust ramp hue shift';
  if (JSON.stringify(prev.rampSizeOverrides) !== JSON.stringify(next.rampSizeOverrides)) return 'Change ramp size';
  if (prev.rampSize !== next.rampSize) return 'Change shade count';
  if (prev.hueShiftStrength !== next.hueShiftStrength) return 'Adjust hue shift';
  if (prev.hardwareLock !== next.hardwareLock) {
    return next.hardwareLock ? `Lock to ${next.hardwareLock}` : 'Unlock hardware';
  }
  if (prev.harmonyAnchor !== next.harmonyAnchor) return 'Change harmony anchor';
  if (prev.shuffleSeed !== next.shuffleSeed) return 'Generate';
  if (JSON.stringify(prev.collapsedRamps) !== JSON.stringify(next.collapsedRamps)) return 'Collapse / expand ramps';
  return 'Edit';
}
