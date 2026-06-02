# Feature Backlog — parked, not yet specced

Brief outlines so we don't forget. Each gets its own full spec (brainstorming →
writing-plans → build) when its turn comes. Grounded in the 2026-06-02
competitive deep-research sweep (see git log / chat): PIXEL.PAL's OKLCH ramp
differentiator is NOT unique — PalGen + Rampart (in-Aseprite) and Novaboard
(browser) all ship perceptual ramps. The honest wedge is breadth + low-friction
handoff + repairing palettes artists already own.

Build order (decided 2026-06-02):
1. **Spec 1 (in progress):** A+C — export formats + one-click handoff
2. **E — Fix My Palette** (absorbs B)
3. **D — variable shade count 2–64**

**Under consideration (2026-06-02): removing AI Assist entirely.** Art
communities push back on the mere presence of an AI option, which is a
positioning liability in this audience regardless of feature quality. Not
decided. If it happens: it RAISES the priority of **F** (the non-AI, no-key
instant generator becomes the replacement for AI "Surprise Me"), and touches
the README/provider filtering/settings. Web build already filters providers;
full removal would be its own spec.

---

## E — "Fix My Palette" (input/repair mode[not actually called "fix my palette", that's pretentious])

**One-liner:** Mirror of generate-from-scratch. Artist brings a palette they
already own; tool diagnoses and repairs it using primitives already shipped.

**Wedge (why it beats incumbents):** PalGen/Rampart/Novaboard all generate
*from a seed*. None take an *existing* palette and improve it. Meets the artist
at the Lospec library + their own back-catalog instead of asking them to
restart. Pure leverage on ΔE_OK + adjacency matrix + the OKLCH engine.

**Inputs:** pasted hex list, `.gpl`/`.hex` file, image/screenshot (extraction
path already exists).

**Three repair operations (all from existing code):**
1. **Near-dupe flag** — reuse pairwise ΔE_OK (already computed for the
   adjacency matrix). Surface "these two read identical at sprite scale (ΔE
   1.3) — you're wasting a slot." One-click merge.
2. **Re-ramp** *(headline)* — cluster the flat palette into base colors, run
   `generateRamp` on each → turn a random pile into structured perceptual
   ramps.
3. **Diagnose / even-out** — detect uneven lightness steps or hue drift in an
   existing ramp; show the perceptual alternative side-by-side (lightness strip
   + polar plot already exist).

**>>> ABSORBS SUB-PROJECT B (Lospec round-trip) <<<**
B = "import a Lospec palette → re-ramp → export back" is just Fix-My-Palette
with a Lospec-format input. **Do NOT build B separately.** When E is specced,
make sure E's import layer covers Lospec's format(s) and the re-ramp→export
round-trip. B is important; it lives here so it isn't forgotten.

**Open UI questions (for E's own brainstorm):** where does repair mode live
(new tab vs. modal vs. inline on import)? How to preview before/after without
clobbering the working palette? Visual companion likely warranted.

---

## D — variable shade count 2–64

**One-liner:** Let ramps be 2–64 shades, not just 4–8. Novaboard does this; we
don't.

**Good news:** the engine is ALREADY general. `generateRamp` in
`src/lib/ramp-engine.ts` takes an arbitrary `size` and the math handles any N
(incl. N≤1 guard). **No engine work.**

**The actual work is UI + state, and it's the hard part:**
1. **Lift the `[4,5,6,7,8]` cap** — hard-coded in at least 3 places in
   `src/App.tsx` (~lines 562, 1542, 3179 as of 2026-06-02) plus the persisted
   `ui:rampSize` validation. Find ALL of them (grep `[4, 5, 6, 7, 8]`).
2. **Position-label scheme breaks** — outline/shadow/base/highlight/bright is
   defined only for 4–8 (`App.tsx` ~lines 1364-1367). 64 shades can't carry
   five named slots. Decide: drop labels above some N? Number them? Keep
   named anchors (darkest/base/lightest) + numbered middles? **This is the
   core design question.**
3. **Pin / hide / size-override migration** — overrides keyed by shade index;
   resizing must stay coherent (logic already exists for 4↔8, must generalize).
4. **UI control** — a 2–64 selector. Stepper? Slider? Number input? And how
   does the ramp render legibly at 64 swatches in the existing layout?

**Open UI questions (for D's own brainstorm):** label strategy above ~8;
selector widget; ramp rendering at high N. Visual companion warranted.

---

## A + C — export formats + one-click handoff (SPEC 1, in progress)

Being specced now in its own design doc. Listed here only for build-order
context. Scope: JASC/GrafX2 `.pal` export, Adobe `.ase` export, and a
reveal-in-folder / copy-as-palette handoff convenience.

---

## F — one-click "generate a palette" (harmonious, non-AI)

**One-liner:** A single button that produces a whole multi-base palette either
(a) seeded from one input color or (b) fully random, picking base colors that
generally work together — Coolors-style. Each generated base still gets our
OKLCH ramps, which is the differentiator vs. plain swatch generators.

**Positioning:** overlap with Coolors/etc. is fine and intentional — PIXEL.PAL
is the swiss-army-knife of palette software (breadth IS the wedge; see
positioning memory). F composes with what only we have: every generated base
gets OKLCH ramps. It also fills a real internal gap — the app has single-hex
input, a "roll random" hex, harmony derivation (rotate around one anchor), and
AI "Surprise Me" (needs a key/prompt), but no **non-AI, instant, multi-base**
generator. F is press-once → a cohesive set of bases (not rotations of one),
each ramped, no key required.

**Likely approach (for F's own brainstorm):** sample base hues with a harmony
strategy (golden-angle / curated offsets) + perceptual spacing so bases are
distinct under ΔE_OK; optional single-color seed locks one base and derives the
rest around it. Reuse existing harmony + ramp-engine; no new color math likely.

**Open questions:** how many bases by default? does "random" bias toward
pleasing lightness/chroma ranges, or full gamut? button placement (next to the
existing random-hex roll?). Relation to AI "Surprise Me" — keep both, frame F
as the no-key instant option.
