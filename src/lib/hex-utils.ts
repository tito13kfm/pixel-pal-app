// dedupeHexes: collapse duplicate hex strings preserving first occurrence
// and original casing. Used for visualization, export, and copy where the
// hardware-locked ramp can produce repeats (e.g. an 8-shade Game Boy ramp
// collapses to 4 unique colors). The main per-ramp editor UI keeps duplicates
// visible so the user sees the full shadow->highlight sequence; only
// downstream consumers dedupe.
export const dedupeHexes = (hexes: unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const hex of hexes) {
    if (typeof hex !== 'string') continue;
    const key = hex.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hex);
  }
  return out;
};
