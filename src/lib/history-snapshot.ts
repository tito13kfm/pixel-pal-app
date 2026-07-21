export const SNAPSHOT_FIELDS = [
  'baseColors', 'aiColorNames', 'rampSize', 'shuffleSeed',
  'overrides', 'harmonyAnchor', 'lospecSource', 'rampSizeOverrides', 'rampSatOverrides',
  'hueShiftStrengthPerRamp', 'hiddenShades', 'rampShuffleOffsets',
  'hardwareLock', 'hueShiftStrength', 'lockedRamps', 'collapsedRamps',
  'lightnessCurvePerRamp', 'satCurvePerRamp', 'stylePresets',
  'paletteDefaultStyle', 'rampStyleOverrides', 'rampStyleScalars',
] as const;

// Verbatim from App.tsx inferLabel, do not "improve". Characterized by spec.
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
  if (JSON.stringify(prev.rampStyleScalars) !== JSON.stringify(next.rampStyleScalars)) return 'Customize ramp style';
  if (JSON.stringify(prev.rampStyleOverrides) !== JSON.stringify(next.rampStyleOverrides)) return 'Change ramp style';
  if (prev.paletteDefaultStyle !== next.paletteDefaultStyle) return 'Change default style';
  return 'Edit';
}

// Human-readable age for a history entry's timestamp ("just now", "5m ago").
// Pure display formatter used by HistoryPanel. Extracted verbatim from
// App.tsx (#113 slice 2).
export function formatHistoryAge(timestamp: number): string {
  const ageSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (ageSec < 10) return 'just now';
  if (ageSec < 60) return `${ageSec}s ago`;
  const ageMin = Math.floor(ageSec / 60);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageHr = Math.floor(ageMin / 60);
  if (ageHr < 24) return `${ageHr}h ago`;
  const ageDay = Math.floor(ageHr / 24);
  return `${ageDay}d ago`;
}
