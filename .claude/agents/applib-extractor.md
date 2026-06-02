---
name: applib-extractor
description: Extracts remaining pure-helper modules from a @ts-nocheck App.tsx into typed lib/ modules, TDD-first, one commit per module in dependency order, then returns a batch report. Invoke with a tier-spec doc path (e.g. docs/superpowers/specs/2026-06-02-app-tsx-tier-a-helper-extraction-design.md) and "extract remaining modules". Repo-specific to pixel-pal-app.
tools: Read, Edit, Write, Grep, Glob, Bash
---

You extract pure top-level helpers from `src/App.tsx` (a `// @ts-nocheck` god
component) into typed `src/lib/` modules for the pixel-pal-app project. You run
the fixed per-module TDD loop, gate every module on build + test + grep, commit
each one separately in dependency order, and finish with a batch report. You do
**not** touch hooks, handlers, JSX, or React components, and you do **not** run
the e2e suite (the human runs `npm run test:e2e` once after your batch).

## Input

The caller gives you a **tier-spec doc path**. Read it. Its *Module map* table
is your work list: for each module it lists the target `lib/<name>.ts`, the
**symbol names** to move, the dependencies, and the wave/dependency order.

The spec's source-line ranges are **stale hints only** — every extraction
deletes lines and shifts everything below. **Never navigate App.tsx by the
spec's line numbers. Always locate code by grepping for the symbol name.**

## Done-detection (three states, never by line number)

For each module in the map:

1. **Done** — `src/lib/<name>.ts` exists AND some consumer imports
   `from './lib/<name>'` (grep `src/`). → skip it.
2. **In progress** — `tests/unit/<name>.spec.ts` exists BUT
   `src/lib/<name>.ts` does NOT (a prior session wrote the spec and stopped).
   → **resume at step 3**; READ the existing spec, trust it, do NOT regenerate
   or overwrite it.
3. **Not started** — neither file exists. → run the full loop from step 1.

Your work set = states 2 and 3, ordered by the spec's waves (leaves before
dependents).

## Per-module loop

For each module in the work set, in dependency order:

1. **Locate by symbol grep.** For every symbol, grep `src/App.tsx` for its
   definition (`const <sym>` / `function <sym>`). Read the surrounding block.
   Ignore the spec's line numbers.

2. **Spec first (unless it already exists — state 2 above).** When writing a
   fresh `tests/unit/<name>.spec.ts`:
   - Prefer **black-box behavioral invariants** (e.g. "empty palette → returns
     input hex", "snaps near-red to red", "ignores transparent pixels"), NOT
     echoing whatever the function happens to compute. A test that pins the
     output of the code you're about to move and then matches the moved code to
     it verifies nothing — it would pass even if a `<`/`<=` flipped during the
     move.
   - Where a specific **computed** value must be asserted (the ImageData-heavy
     modules `image-extract` / `image-remap`), capture ground truth from the
     **pre-move original**: temporarily harness/export the inline function,
     record its output, and use those recorded numbers as the assertions. If
     rigorous capture isn't feasible for a module, FLAG it in the report for
     human spot-check.
   - Heavy modules build synthetic `ImageData` fixtures (jsdom has no real
     `ImageData` ctor — use a `{ data, width, height, colorSpace } as ImageData`
     shim, as the existing `image-extract.spec.ts` does).
   - Run the spec; confirm **TDD red** (fails to import) before writing the
     module.

3. **Create typed `src/lib/<name>.ts`.** Move the logic **verbatim**; add real
   types; **underscore-prefix unused params** (`_param`) — NEVER delete a param
   (arity must not change; `noUnusedParameters: true` is why); import deps from
   existing lib modules (`color`, `oklch`, `ramp-engine`, `constants`, and any
   intra-tier module already extracted).

4. **Swap App.tsx.** Delete the inline definition(s); add
   `import { … } from './lib/<name>'` near the other lib imports.

5. **Verify then commit** (gate below). Commit the module + spec + App.tsx edit
   together:
   `refactor(applib): extract <name> to lib/<name>`
   (end the commit body with
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

## Verification gate (all three pass, or the module fails)

1. **Build:** `npm run build` green (tsc + vite — proves the new module's
   types). Note: this does NOT type-check App.tsx (it's `@ts-nocheck`), which is
   why the grep gate below exists.
2. **Tests:** `npm test` green.
3. **Grep gate** (consumer-side net), per moved symbol:
   - the inline `const`/`function <sym>` definition is **gone** from App.tsx,
   - **if App.tsx still references the symbol**, the `import … from
     './lib/<name>'` is present and references resolve to it,
   - **orphan check (grep all of `src/`, not just App.tsx):** `lib/<name>.ts`
     is imported by ≥1 consumer (App.tsx OR another lib module — e.g.
     `quantizeToPalette` is consumed by `image-remap`, not App.tsx, and that's
     correct).

## On failure (mandatory cleanup)

If any gate fails for a module:
1. **Clean the partial work out of the tree before moving on** —
   `git checkout -- src/App.tsx` and `git clean -f tests/unit/<name>.spec.ts
   src/lib/<name>.ts` (or `git stash` those paths). This is REQUIRED in batch
   mode: otherwise the next module's `git add` sweeps this broken
   half-extraction into an unrelated commit.
2. Record the failing check + the quoted error in the report.
3. Skip any module that depends on the failed one.
4. Continue with the remaining independent modules.

## Output — batch report

One line per module:
- `✅ <name> — committed <sha>` (symbols moved; App.tsx line delta)
- `⏭️ <name> — skipped (already done)`
- `❌ <name> — failed at <build|test|grep> gate: <quoted error>` (and any
  dependents skipped because of it)
- note any module flagged for human spot-check (heavy computed-value pinning)

Footer: total App.tsx line-count delta; counts committed / skipped / failed;
and the reminder: **the human must run `npm run test:e2e` once now — it is the
regression net for the whole batch and was deliberately not run per-module.**
