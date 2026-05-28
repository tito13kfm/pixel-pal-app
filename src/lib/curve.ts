export type CurvePoints = { t: number; v: number }[];

// Full arrays: first point is t=0 endpoint, last is t=1 endpoint.
// Lightness fixed endpoints are (0,0)→(1,1). Sat endpoints default to (0,1.0)→(1,1.0).
export const LIGHTNESS_PRESETS: Record<string, CurvePoints> = {
  linear:     [{ t: 0, v: 0 }, { t: 0.5, v: 0.5 },  { t: 1, v: 1 }],
  eased:      [{ t: 0, v: 0 }, { t: 0.5, v: 0.65 }, { t: 1, v: 1 }],
  'ease-in':  [{ t: 0, v: 0 }, { t: 0.5, v: 0.35 }, { t: 1, v: 1 }],
  'ease-out': [{ t: 0, v: 0 }, { t: 0.5, v: 0.72 }, { t: 1, v: 1 }],
  's-curve':  [{ t: 0, v: 0 }, { t: 0.25, v: 0.12 }, { t: 0.75, v: 0.88 }, { t: 1, v: 1 }],
};

export const SAT_PRESETS: Record<string, CurvePoints> = {
  flat: [{ t: 0, v: 1 }, { t: 1, v: 1 }],
  bell: [{ t: 0, v: 1 }, { t: 0.5, v: 1.6 },  { t: 1, v: 1 }],
  rise: [{ t: 0, v: 1 }, { t: 0.5, v: 0.6 }, { t: 0.9, v: 1.5 }, { t: 1, v: 1 }],
  dip:  [{ t: 0, v: 1 }, { t: 0.5, v: 0.5 },  { t: 1, v: 1 }],
};

// Catmull-Rom spline interpolation.
// points must be sorted by t and include endpoints as first/last elements.
// Phantom endpoints are reflected through the real endpoints to give smooth tangents.
export function evalCurve(points: CurvePoints, t: number, yMin = 0, yMax = 1): number {
  const clamp = (v: number) => Math.max(yMin, Math.min(yMax, v));

  if (points.length === 0) return clamp((yMin + yMax) / 2);
  if (points.length === 1) return clamp(points[0].v);
  if (t <= points[0].t) return clamp(points[0].v);
  if (t >= points[points.length - 1].t) return clamp(points[points.length - 1].v);

  const n = points.length;
  // Reflect through first and last real points to create phantom endpoints
  const phantom0 = { t: 2 * points[0].t - points[1].t,         v: 2 * points[0].v - points[1].v };
  const phantomN = { t: 2 * points[n-1].t - points[n-2].t,     v: 2 * points[n-1].v - points[n-2].v };
  const all = [phantom0, ...points, phantomN];

  // Find segment in original points where points[i].t <= t < points[i+1].t
  let segIdx = n - 2;
  for (let i = 0; i < n - 1; i++) {
    if (t < points[i + 1].t) { segIdx = i; break; }
  }

  // In all[], points[segIdx] is at all[segIdx+1]
  const P0 = all[segIdx];
  const P1 = all[segIdx + 1];
  const P2 = all[segIdx + 2];
  const P3 = all[segIdx + 3];

  const s = (t - P1.t) / (P2.t - P1.t);
  const v = 0.5 * (
    2 * P1.v +
    (-P0.v + P2.v) * s +
    (2 * P0.v - 5 * P1.v + 4 * P2.v - P3.v) * s * s +
    (-P0.v + 3 * P1.v - 3 * P2.v + P3.v) * s * s * s
  );

  return clamp(v);
}

// Returns the preset key whose points match within epsilon, or null if custom.
export function activePreset(
  points: CurvePoints,
  presets: Record<string, CurvePoints>,
  eps = 0.01,
): string | null {
  for (const [key, preset] of Object.entries(presets)) {
    if (preset.length !== points.length) continue;
    if (preset.every((p, i) => Math.abs(p.t - points[i].t) < eps && Math.abs(p.v - points[i].v) < eps)) {
      return key;
    }
  }
  return null;
}

// Migration: convert old CurvePreset string to CurvePoints.
// Falls back to eased for unrecognised values.
export function presetToPoints(preset: string): CurvePoints {
  const pts = LIGHTNESS_PRESETS[preset] ?? LIGHTNESS_PRESETS.eased;
  return pts.map(p => ({ ...p }));
}
