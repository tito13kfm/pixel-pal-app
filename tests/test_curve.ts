// Run: node --experimental-strip-types tests/test_curve.ts
// Fallback if Node < 22.6: npx tsx tests/test_curve.ts

import { evalCurve, activePreset, presetToPoints, LIGHTNESS_PRESETS, SAT_PRESETS } from '../src/lib/curve.ts';

let pass = 0, fail = 0;

function assert(label: string, ok: boolean) {
  if (ok) { console.log(`  ✓ ${label}`); pass++; }
  else { console.error(`  ✗ ${label}`); fail++; }
}

function near(a: number, b: number, eps = 0.01) { return Math.abs(a - b) < eps; }

// --- evalCurve: linear preset ---
console.log('evalCurve — linear (2 interior segments, Catmull-Rom)');
{
  const pts = LIGHTNESS_PRESETS.linear; // [{t:0,v:0},{t:0.5,v:0.5},{t:1,v:1}]
  assert('t=0 → 0', near(evalCurve(pts, 0, 0, 1), 0));
  assert('t=1 → 1', near(evalCurve(pts, 1, 0, 1), 1));
  assert('t=0.5 → 0.5', near(evalCurve(pts, 0.5, 0, 1), 0.5));
  assert('t=0.25 ≈ 0.25', near(evalCurve(pts, 0.25, 0, 1), 0.25, 0.04));
}

// --- evalCurve: sat flat (2 points = linear interp) ---
console.log('evalCurve — sat flat (2 points)');
{
  const pts = SAT_PRESETS.flat; // [{t:0,v:1},{t:1,v:1}]
  assert('t=0 → 1', near(evalCurve(pts, 0, 0, 2), 1));
  assert('t=0.5 → 1', near(evalCurve(pts, 0.5, 0, 2), 1));
  assert('t=1 → 1', near(evalCurve(pts, 1, 0, 2), 1));
}

// --- evalCurve: sat bell (midpoint peak) ---
console.log('evalCurve — sat bell');
{
  const pts = SAT_PRESETS.bell; // [{t:0,v:1},{t:0.5,v:1.6},{t:1,v:1}]
  assert('endpoints at 1.0', near(evalCurve(pts, 0, 0, 2), 1) && near(evalCurve(pts, 1, 0, 2), 1));
  assert('peak at midpoint > 1', evalCurve(pts, 0.5, 0, 2) > 1.4);
}

// --- evalCurve: sat dip ---
console.log('evalCurve — sat dip');
{
  const pts = SAT_PRESETS.dip; // [{t:0,v:1},{t:0.5,v:0.5},{t:1,v:1}]
  assert('trough at midpoint < 1', evalCurve(pts, 0.5, 0, 2) < 0.7);
}

// --- evalCurve: yMin/yMax clamp ---
console.log('evalCurve — clamping');
{
  const pts = [{ t: 0, v: -0.5 }, { t: 1, v: 1.5 }];
  assert('below yMin clamped to 0', near(evalCurve(pts, 0, 0, 1), 0));
  assert('above yMax clamped to 1', near(evalCurve(pts, 1, 0, 1), 1));
}

// --- evalCurve: eased is non-linear ---
console.log('evalCurve — eased (non-linear)');
{
  const pts = LIGHTNESS_PRESETS.eased; // midpoint at v=0.65
  const mid = evalCurve(pts, 0.5, 0, 1);
  assert('eased midpoint > 0.5', mid > 0.55);
}

// --- activePreset ---
console.log('activePreset');
{
  assert('linear matches', activePreset(LIGHTNESS_PRESETS.linear, LIGHTNESS_PRESETS) === 'linear');
  assert('eased matches', activePreset(LIGHTNESS_PRESETS.eased, LIGHTNESS_PRESETS) === 'eased');
  assert("s-curve matches", activePreset(LIGHTNESS_PRESETS['s-curve'], LIGHTNESS_PRESETS) === 's-curve');

  const custom = [{ t: 0, v: 0 }, { t: 0.5, v: 0.3 }, { t: 1, v: 1 }];
  assert('custom → null', activePreset(custom, LIGHTNESS_PRESETS) === null);

  // Within epsilon (default 0.01)
  const nearLinear = [{ t: 0, v: 0.005 }, { t: 0.5, v: 0.505 }, { t: 1, v: 1.0 }];
  assert('within eps → linear', activePreset(nearLinear, LIGHTNESS_PRESETS) === 'linear');

  // Different length = no match
  const wrongLen = [{ t: 0, v: 0 }, { t: 1, v: 1 }];
  assert('wrong length → null', activePreset(wrongLen, LIGHTNESS_PRESETS) === null);

  // Sat presets
  assert('sat flat matches', activePreset(SAT_PRESETS.flat, SAT_PRESETS) === 'flat');
  assert('sat bell matches', activePreset(SAT_PRESETS.bell, SAT_PRESETS) === 'bell');
}

// --- presetToPoints ---
console.log('presetToPoints');
{
  const eased = presetToPoints('eased');
  assert('known preset returns array', Array.isArray(eased) && eased.length > 0);
  assert('starts at t=0', eased[0].t === 0);
  assert('ends at t=1', eased[eased.length - 1].t === 1);

  const fallback = presetToPoints('not-a-real-preset');
  const expected = LIGHTNESS_PRESETS.eased;
  assert('unknown → eased fallback', JSON.stringify(fallback) === JSON.stringify(expected));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
