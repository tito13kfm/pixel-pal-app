# src/ simplification sweep: design

**Date:** 2026-07-21
**Status:** approved, not yet started

## Problem

`src/` was ported from a 7820-line single-file Claude artifact and has since been
decomposed (App.tsx: ~3900 to ~1300 lines via the AI rebuild initiative), but the
resulting `lib/`, `hooks/`, and `components/` trees have never had a systematic
pass. Code across these directories was originally written by multiple AI
sessions/models with varying conventions. Goals for this sweep, in order:

1. **Bug risk**: latent correctness issues (silent-failure paths, mirror-path
   divergence between paths meant to agree, edge-case gaps) that nobody has
   re-read since an AI wrote them.
2. **Consistency**: naming, structure, and pattern drift between files that
   should feel like one codebase.
3. **Bloat/dead weight**: real duplication and over-engineered abstractions
   (distinct from `ts-prune` dead-export tracking, which is handled separately).

Out of scope: `App.tsx` (actively being decomposed by the `applib-extractor`
agent under the ai-rebuild-initiative; a second effort here would collide with
that one), `main.tsx` (load-bearing Tauri dynamic-import gating per CLAUDE.md,
untested, high silent-break risk if "tidied"), and `*.d.ts` files (nothing to
simplify).

## Approach

Subagent-driven, session-per-chunk: the same pattern already validated on the
App.tsx decomposition (Tier A/B/C extraction). One chunk equals one
directory-scoped cluster of files, worked in its own branch, reviewed, gated,
and shipped via PR before the next chunk starts.

### Chunking & ordering

Chunks are carved along existing directory boundaries, sub-split where a
directory is too large for one pass:

- `lib/` (~55 files) splits into 3-4 sub-chunks by cohesion: ramp/color engine
  (color.ts, oklch.ts, ramp-engine.ts, ramp-helpers.ts, ramp-pipeline.ts,
  harmony.ts, hardware-quantize.ts, palette-generator.ts,
  permute-indexed-state.ts, randomizer.ts, mood.ts, wcag.ts, curve.ts,
  snapshot-ramps.ts), export/import (export.ts, palette-export.ts,
  strip-export.ts, save-file.ts, palette-import.ts), platform/UI-support
  (tauri-bridge.ts, env.ts, theme.ts, tour-runtime.ts, tours.ts,
  renderCount.ts, viz-interaction.ts, image-extract.ts, image-remap.ts,
  remap-worker-client.ts, pixel-brush.ts, base-dock.ts, hex-utils.ts,
  constants.ts, panel-state.ts, history-snapshot.ts).
- `hooks/` (~29 files) splits into 2 sub-chunks: ramp/palette-state hooks vs.
  UI/session/tour hooks.
- `components/` splits into 2 sub-chunks: `components/panels/` (10 files) and
  top-level non-panel components (17 files).
- `contexts/` plus `store/` plus `workers/` folded into one small chunk.

**Ordering rule: leaf-first, foundational-last, ranked by import fan-in.** Not
directory-alphabetical, and not "biggest/most-foundational first." A
foundational, heavily-imported module (e.g. `color.ts`, `ramp-engine.ts`) has
the largest blast radius if a regression slips through, so it gets touched
only after the per-chunk process is proven on low-fan-in leaf modules. Phase 0
(first task in the implementation plan) computes actual fan-in per file and
finalizes chunk order and grouping; the clusters above are a starting
approximation, not final.

### Per-chunk pipeline

0. **Inventory**: for the chunk's files, check existing test coverage (does
   `tests/unit/` have a matching spec?) and import fan-in. A file with
   thin/no coverage that needs non-trivial change gets a characterization
   test written first (pins current behavior), or is restricted to
   mechanical-only edits (renames, dead-import removal, edits with no
   behavior-change surface) if a real test isn't practical yet. This is the
   actual safety net for the sweep: CI passing on an uncovered file proves
   nothing.
1. Branch off master: `simplify/<chunk-name>`.
2. Dispatch a subagent to review the chunk against a **combined lens**
   (correctness bugs plus reuse/simplify/consistency), following
   `docs/review-lenses.md` and the project's own guardrails (mirror-path /
   render-sibling rule, "deadcode is a TODO not a delete target", no
   premature abstraction, comment policy). The subagent does not blind-apply
   everything it finds; it returns findings bucketed:
   - **(a) behavior-preserving refactor**: apply directly (dedup, rename,
     extract-on-3+-sites, drop redundant checks).
   - **(b) behavior-changing bug fix**: requires a test that fails before
     the fix and passes after, called out explicitly in the PR body as a
     bug fix, never folded silently into a "cleanup" diff.
   - **(c) dead-code candidate**: **report only, never auto-deleted.**
     `ts-prune` has already produced false positives here (flagged live
     exports, and flagged-but-unadopted extraction TODOs are a known
     category, not a delete target; see project memory). Each (c) finding
     gets a manual grep-verified disposition (real-dead / unadopted-extraction
     TODO / false positive) before anything is removed.
3. Gate: `tsc --noEmit`, the chunk's vitest suite, full suite periodically,
   grep for dangling refs (only matters for `@ts-nocheck` files, i.e. none in
   this sweep's scope), `npm run build`.
4. Manual verify: read the diff myself, and for any "duplicate/identical"
   claim in the findings, confirm it against the actual code before trusting
   it. Do not repeat a claim the subagent made without checking it firsthand.
5. Push branch, open a PR, wait for CI (full Playwright plus lint suite, not
   just the local checks from step 3) before merging.
6. Merge, delete branch.

### Advisor cadence

Not a blanket start/end-of-initiative rule (that would contradict the
standing rule of invoking advisor for behavior-changing work and skipping it
for repeated-pattern work). Instead: **a chunk's PR gets an advisor look only
if it contains a bucket-(b) behavior-changing fix.** Pure-refactor/dedup
chunks (the common case) skip it. The discriminator is the diff, not the
chunk.

### Tracking

A progress tracker (companion doc, updated per chunk) lists: chunk name,
directory scope, status (not started / in review / merged), PR link, whether
it shipped any bucket-(b) fixes. Same pattern as the App.tsx decomposition
tracking in project memory.

## Testing

Existing `npm test` (vitest) and `npm run test:e2e` (Playwright) suites are
the regression gate; new characterization tests are added per chunk as
described in the pipeline above, not as a separate phase.
