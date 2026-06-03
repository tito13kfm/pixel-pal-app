# Ramp Engine v2 — Even Shade Distribution Around the Base

**Date:** 2026-06-03
**Status:** Design approved, pre-plan
**Issue:** #35 (ramp base placement is lightness-driven → highlight/shadow-starved ramps)

---

## Problem

For a perceptually-light base (e.g. green `#37CD76`, OKLCH L 0.751), a Punchy
7-shade ramp produces 5 shadows and a single, far-flung highlight:

```
#000900 outline · #003704 deep shadow · #006B1E shadow · #11953E shadow 2
· #28B25B shadow 3 · #37CD76 BASE · #B0FFCB bright
```

The base→bright lightness step is **ΔL ≈ 0.184**, while base→shadow steps are
~0.095 — the lone highlight has to span the entire `base.L → lightCap` distance
in one jump. The user-visible symptom: "the visual distinction between base and
bright, and base and shadow 3 is a ton." The duplicate `shadow 2/3` labels are a
downstream symptom of the dark-heavy slot count, not a separate bug.

### Root cause (confirmed empirically)

`src/lib/ramp-engine.ts` couples two concerns per-arm:

1. **Slot placement** — `baseIndex = clamp(round(frac·(N-1)), 1, N-2)` where
   `frac = (base.L - darkBottom)/(lightTop - darkBottom)`. Light hues have high
   OKLCH L → high `frac` → base near the top → few highlight slots.
2. **Lightness stepping** — each arm *independently* spans from `base.L` to its
   cap (`darkBottom`/`lightTop`) using the curve. A sparse arm (1 highlight at
   N=7) must cover its whole range in one step → the giant jump.

Measured base→neighbour ΔL by ramp size (green base, Punchy):

| N | base→bright ΔL | base→shadow ΔL | note |
|---|----------------|----------------|------|
| 7  | **0.184** | ~0.095 | the "ton" — bright ≈ 2× the shadow step |
| 16 | ~0.012 | ~0.012 | acceptable |
| 64 | ~0.009 | ~0.009 | fine, uniform |
| 2  | 0.631 (base + 1 shadow, **0 highlights**) | — | broken edge case |

It is a **low-N artifact**: at large N each arm has enough slots that per-step
ΔL is tiny. The forthcoming **2–64 shade** range makes the small-N end matter.

The inverse hits perceptually-dark hues: navy `#1a2f6b` (L 0.327) → baseIndex 2 →
2 shadows / 4 highlights.

---

## Decision

**Re-center the slot split + size all steps from one global curve.** Chosen over
"strict-lightness + capped step" because a pixel-art palette is more useful with
a couple of real highlights climbing toward white than with one short,
lightness-accurate highlight that never reaches white at low N.

**Key realisation:** byte-exact ≠ slot-exact. The base *hex* stays exactly the
picked colour in every approach; what we change is only *how many* neighbours
land lighter vs darker (the slot split) and how the steps are sized. Re-centering
does not corrupt the base colour.

Old saved palettes must **not** change appearance when opened. Achieved by
**engine versioning** (precedent: the v0.6 perceptual-engine migration banner),
not by baking/freezing ramps.

---

## Architecture

### 1. v2 ramp engine (`src/lib/ramp-engine.ts`)

Preserve today's `generateRamp` as the **v1** code path (frozen, characterized).
Add **v2** with two decoupled stages:

**(a) Slot allocation — proportional, then centering bias that fades with N.**
- `proportionalDark = (base.L - darkBottom) / (lightTop - darkBottom)`.
- `w(N)` = centering weight, strong at small N, → 0 as N grows (so v2 ≈ v1 at
  N≈64 and the look converges for large ramps). Candidate form:
  `w(N) = clamp(C / (N - 1), 0, wMax)` — exact `C`, `wMax` tuned in the plan
  against the step-ratio assertions below.
- `biasedDark = lerp(proportionalDark, 0.5, w(N))`.
- `darkSlots = clamp(round(biasedDark · (N-1)), minSide, (N-1) - minSide)` where
  `minSide = min(guaranteed, floor((N-1)/2))` and `guaranteed` ≥ 1 (≥ 2 where
  N allows). `lightSlots = (N-1) - darkSlots`. Guarantees a usable count on the
  short side; light green at N=7 → ~2–3 highlights.

**(b) Smooth global stepping — smallest step next to the base, growing to caps.**
- One curve `f` (f(0)=0, f(1)=1, small f'(0)) shapes both arms so the step
  adjacent to the base is the *smallest* and steps widen toward each cap.
- Scale per arm so each arm still reaches its cap (`darkBottom` / `lightTop`),
  while the first step on each side is small and comparable → no discontinuity
  at the base. Because allocation (a) over-weights the short side, the short
  arm's steps are ≤ the long arm's, so base→bright ≤ base→shadow (gentle, never
  a 2× jump at the base).
- Base slot is the picked colour byte-for-byte (no curve/gamut/hue applied),
  exactly as v1.

Chroma falloff, hue shift, gamut mapping, satCurve: **unchanged from v1** — this
change is lightness-distribution only. (The separate observation that a light
saturated green's highlight desaturates via gamut clipping is out of scope here;
note it for a possible follow-up, do not address.)

**Edge cases (must be explicit + tested):**
- **N=2:** base + 1. Allocate the single non-base slot to the *farther* cap side
  (max(`base.L - darkBottom`, `lightTop - base.L`)) so the pair has the most
  contrast; define deterministically.
- **N=3, N=4:** `guaranteed` may exceed room; clamp so each side gets ≥1 and the
  base is never at an end. Define exact splits.
- **N up to 64:** verify monotonic L, no duplicate-adjacent L (respect the
  existing `STEP_DELTA` min-gap so the base reads distinct), uniform-ish steps.

### 2. Shared per-ramp pipeline — make the mirror STRUCTURAL, not test-enforced

The live `App.tsx` memos and `buildRampsForSnapshot` currently duplicate the
per-ramp pipeline (generate → pin → hardware-snap → hidden-filter). Adding v1+v2
on top would make that **two engines × two call sites = four places to keep in
sync** — the exact duplication that produced #30. **Before** wiring v2, extract
the per-ramp pipeline into ONE pure function (e.g. `buildRamp(params, style,
engineVersion)` in a shared lib module) that both the live memos and
`buildRampsForSnapshot` call. The mirror then can't diverge by construction; the
mirror test becomes a guard on a single code path, not a cross-check of two.
This extraction is part of THIS plan, not deferred debt.

### 3. Versioning + render routing

- Add `engineVersion?: number` to the saved-palette payload and to the history
  snapshot shape (`RampSnapshot`). **Absent → 1** (legacy).
- New palettes / fresh generation → `engineVersion: 2`.
- Both renderers select the engine by the active palette's version — via the
  shared `buildRamp` from §2, so selection logic lives in exactly one place.
- **Working-palette semantics (state explicitly):** loading a v1 (or
  version-absent) palette sets the working session's `engineVersion` to 1 and
  renders v1 until an *explicit* upgrade (deferred UI). The working palette does
  NOT silently adopt v2 on load. New/empty sessions start at v2.
- **Mirror constraint (CLAUDE.md rule):** a snapshot rendered at version V must
  equal the live render of the same data at version V — now guaranteed by the
  shared pipeline (§2) and verified by test at both V=1 and V=2.

**Result:** opening an old (v1 / version-absent) palette renders via v1 →
pixel-identical to before. No baking, no migration of stored data required for
the MVP.

### 4. Acceptance — visual sign-off FIRST, then freeze numbers as guards

The acceptance criterion must not be circular: deferring ΔL tolerances to the
plan *and* tuning `w(N)` until they pass makes the test self-fulfilling. The
user's complaint is **visual** ("a ton"), so the judge is the eye; the numbers
are only the lock.

1. **Principled design target, stated up front (not reverse-derived):**
   *no adjacent ΔL exceeds 1.5× the ramp's median ΔL*, for every hue × N in the
   matrix. Tune `w(N)` / `guaranteed` / step curve to hit THIS target.
2. **Visual sign-off gate:** render before/after ramp strips (v1 vs v2) for the
   hero cases — green @ N=4 and 7, navy, a mid-tone, a grey — as a screenshot,
   and get the user's visual approval. (Remote user → deliver via screenshot, as
   in this session.)
3. **Only after visual sign-off, freeze the observed v2 output as snapshot
   regression guards.** The numeric snapshot is the lock that prevents
   regressions; it is NOT the arbiter of "good."

### 5. Testing

- **Characterize v1** before adding v2: snapshot test pinning current output for
  a representative set (light/dark/saturated/grey bases × N ∈ {2,4,7,16,64}) so
  the legacy path is provably frozen.
- **v2 snapshot tests:** the visually-approved output for the same matrix (§4.3).
- **Principled-threshold assertion (the core of the fix):** for v2, assert
  *no adjacent ΔL > 1.5× median ΔL* (§4.1) for a light hue (green) and dark hue
  (navy) at N ∈ {4,7,16,64}; assert ≥ `guaranteed` shades on each side where N
  allows.
- **Mirror test:** `buildRampsForSnapshot(snap, style)` equals the live render
  for the same data, at both `engineVersion` 1 and 2 — exercising the shared
  `buildRamp` (§2).
- **Edge tests:** N=2/3/4 explicit expected ramps; monotonic L; min-gap respected.

---

## Scope

**MVP (this spec / plan):**
- Extract the per-ramp pipeline into one shared pure function (§2) — structural
  mirror, done before v2 wiring.
- v2 engine (allocation + stepping) + v1 preserved.
- `engineVersion` field; live + snapshot routing through the shared function;
  old palettes auto-render v1.
- Visual sign-off gate (§4) + full test suite (§5).

**Deferred (separate follow-up, not blocking):**
- Per-palette "Update shading to v2" action and/or a one-time migration banner
  to opt an existing palette into v2.
- Any chroma/gamut-clipping highlight-desaturation work.

---

## Open items to settle in the plan (tuning, not architecture)

- Exact `w(N)` constants (`C`, `wMax`) and `guaranteed` per-side minimum, tuned
  so the step-ratio assertions pass across N=4..64 for light and dark hues.
- Exact tiny-N (2/3/4) splits.
- Whether v2 reuses the existing `lightnessCurve`/`evalCurve` machinery for the
  global step shape or introduces a dedicated step-shaping curve.

These are numeric tuning decisions validated by the step-ratio + snapshot tests;
they do not change the architecture above.
