# `applib-extractor` Subagent — Design

**Date:** 2026-06-02
**Status:** Design — pending user approval
**Scope:** A reusable custom subagent that automates the per-module pure-helper
extraction loop used to decompose `src/App.tsx`.

---

## Problem

Decomposing `src/App.tsx` (a `@ts-nocheck` god component) into typed `lib/`
modules is a fixed, repeated procedure — the "Per-module procedure (TDD)" of
the Tier-A spec (`2026-06-02-app-tsx-tier-a-helper-extraction-design.md`). It
has been run by hand 7+ times (wcag → hardware-quantize). Each run is the same
5 mechanical steps, gated by build + test, committed individually. It is a
strong automation candidate: bounded, verifiable, and recurring (3 Tier-A
modules remain, with Tier B/C and future artifact ports to follow).

Two hard-won lessons (logged as process observations) must be **built into the
agent**, because re-deriving them by hand is where the manual loop slips:

1. **Line numbers go stale.** Every extraction deletes lines from App.tsx,
   shifting everything below. An implementer who re-reads App.tsx and works off
   the spec's source-line ranges operates on stale offsets. **Locate helpers by
   symbol-name grep, never by line number.** The spec's line ranges are hints.
2. **`npm run build` does not type-check App.tsx.** App.tsx carries
   `// @ts-nocheck`, so `tsc` validates the *new* `lib/` module but is blind to
   whether App.tsx still consumes it correctly. The real consumer-side net is a
   **per-task grep gate** on App.tsx (obs #7).

---

## Goal

A repo-specific custom subagent (`.claude/agents/applib-extractor.md`) that,
given a tier-spec doc path, extracts **all not-yet-done** pure-helper modules
from that spec's module map — in dependency order, TDD-first, one commit per
module — and returns a batch report. It skips the e2e suite (run once by the
human after the batch, per the Tier-A spec).

Non-goals: hooks, handlers, JSX, or React components (Tier B/C); the e2e run;
anything beyond pure top-level helpers.

---

## Input contract

Caller passes a **tier-spec doc path** (e.g.
`docs/superpowers/specs/2026-06-02-app-tsx-tier-a-helper-extraction-design.md`)
and the directive **"extract remaining modules"**.

The spec's *Module map* table supplies, per module:

- target module name (`lib/<name>.ts`),
- the **symbol names** to move (the stable key — not line numbers),
- dependencies (intra-tier and external),
- wave / dependency order.

Line ranges in the spec are advisory only.

---

## Per-module loop (5 steps)

For each not-yet-done module, in dependency order:

1. **Locate by symbol grep.** For each symbol, grep `src/App.tsx` for its
   definition (`const <sym>` / `function <sym>`). Read the surrounding block.
   Ignore the spec's line numbers — they have shifted.
2. **Write `tests/unit/<name>.spec.ts` first — unless it already exists**
   (see Done-detection: a spec may be present from a prior interrupted
   session; if so, **read it, trust it, resume at step 3** — do not
   regenerate or overwrite it). When writing fresh: prefer **black-box
   behavioral invariants** (e.g. "empty palette → returns input hex", "snaps
   near-red to red", "ignores transparent pixels") over echoing whatever the
   function computes — a test that pins "the output of the code I'm about to
   move" and then matches the moved code to it verifies nothing (it would pass
   even if a `<`/`<=` slipped during the move). Where a specific *computed*
   value must be asserted (the ImageData-heavy modules), capture ground truth
   from the **pre-move original** — temporarily export/harness the inline
   function, record its output, then those recorded values become the
   assertions. Heavy modules are where a transcription slip is most likely and
   hand-computing expected output is hardest; if rigorous capture isn't
   feasible, flag the module in the report for human spot-check. Heavy modules
   construct synthetic `ImageData` fixtures. Run the spec; confirm TDD red
   before writing the module.
3. **Create typed `lib/<name>.ts`.** Move logic verbatim; add real types;
   **underscore-prefix unused params** (never delete — arity must not change);
   import deps from existing lib modules (`color`, `oklch`, `ramp-engine`,
   `constants`, and intra-tier modules already extracted).
4. **Swap App.tsx.** Delete the inline definition(s); add
   `import { … } from './lib/<name>'`.
5. **Verify (gate below) then commit.** Module + spec + App.tsx edit in one
   commit: `refactor(applib): extract <name> to lib/<name>`.

---

## Verification gate (per module, before commit)

All three must pass:

1. **Build:** `npm run build` green — proves the new module's types
   (`tsc --noEmit` + vite).
2. **Tests:** `npm test` green — proves behavior is pinned.
3. **Grep gate** (the consumer-side net `build` can't provide), per moved
   symbol:
   - the inline `const`/`function <sym>` definition is **gone** from App.tsx
     (no stale duplicate left behind),
   - **if App.tsx still references the symbol**, `import { … } from
     './lib/<name>'` is **present** in App.tsx and the references resolve to it;
   - **orphan check (whole `src/` tree, not just App.tsx):** `lib/<name>.ts` is
     imported by **≥1 consumer** somewhere — App.tsx *or* another lib module.
     This is what avoids the false "dead code" review flag. A symbol whose only
     consumer is another lib module (e.g. `quantizeToPalette` used by
     `image-remap`, not App.tsx) is correctly **not** required to appear in
     App.tsx — checking only App.tsx would false-fail it.

**On failure:** stop that module and **clean its partial work out of the
working tree before moving on** — `git checkout -- src/App.tsx` and
`git clean -f tests/unit/<name>.spec.ts src/lib/<name>.ts` (or stash the
module's paths). This is mandatory in batch mode: a failed module leaves a
half-written spec / `lib/<name>.ts` / partial App.tsx edit in the tree, and the
**next** module's `git add … && commit` would otherwise sweep that broken
half-extraction into an unrelated commit. Record the failing check + quoted
error in the report, skip any modules that depend on the failed one, and
continue with remaining independent modules.

---

## Done-detection

Three states, not two (never inferred from line numbers):

1. **Done** — `lib/<name>.ts` exists **and** App.tsx (or another consumer)
   imports `from './lib/<name>'`. Skip.
2. **In progress / interrupted** — `tests/unit/<name>.spec.ts` exists **but**
   `lib/<name>.ts` does **not** (a prior session wrote the spec and stopped;
   e.g. `image-extract` at the start of this work — its spec is on disk,
   untracked). **Resume at step 3** (create the module to satisfy the existing
   spec); do **not** regenerate the spec.
3. **Not started** — neither file exists. Run the full 5-step loop.

The agent computes the remaining set (states 2 + 3) from the spec's module map
minus the done set, then orders it by the spec's waves.

---

## Tools & isolation

- **Tools:** Read, Edit, Write, Grep, Glob, Bash.
- **No worktree.** Commits are sequential on the active branch; wave-2 modules
  depend on wave-1 having landed. Isolation would only add merge overhead.
- **Model:** inherit (no override).

---

## Output — batch report

Per module, one line:

- `✅ <name> — committed <sha>` (+ symbols moved, App.tsx line delta)
- `⏭️ <name> — skipped (already done / dependency failed)`
- `❌ <name> — failed at <build|test|grep> gate: <quoted error>`

Footer: total App.tsx line-count delta, count committed / skipped / failed, and
a reminder that **`npm run test:e2e` is the human's post-batch step**.

---

## Reusability

Repo-specific by choice: hard-codes pixel-pal conventions (`npm run
build`/`test`, `tests/unit/<name>.spec.ts`, the `refactor(applib):` commit
prefix, the `@ts-nocheck` App.tsx assumption). The *input contract is
spec-driven*, so the same agent serves any tier-spec with a compatible module
map — Tier A's three remaining modules now, and any future pure-helper tier
that follows the same table shape.

---

## Success criteria

- `.claude/agents/applib-extractor.md` exists with correct frontmatter
  (name, description, tools).
- Invoked with the Tier-A spec path, it extracts the 3 remaining modules
  (`image-extract`, `image-remap`, `snapshot-ramps`) in dependency order, each
  a clean commit passing build + test + grep gate, or reports precisely why a
  module was skipped/failed.
- Zero behavior change in the app (the human's post-batch e2e run confirms).
