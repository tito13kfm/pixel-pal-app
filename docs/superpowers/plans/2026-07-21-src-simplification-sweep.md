# src/ Simplification Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically review and simplify every file in `src/lib/`, `src/hooks/`, `src/components/`, `src/contexts/`, `src/store/`, and `src/workers/` for bug risk, consistency, and dead weight, shipping one small reviewed PR per chunk, ordered from lowest to highest blast radius.

**Architecture:** Nine chunks, each a directory-scoped cluster of files, processed in leaf-first order (ranked by real import fan-in measured below). Each chunk runs the same pipeline: branch, dispatch a review subagent with a combined bug+simplify lens, bucket its findings, gate locally, open a PR, wait for CI, merge.

**Tech Stack:** TypeScript, Vitest, Playwright, GitHub Actions CI, `gh` CLI.

## Global Constraints

- Never commit directly to `master` (local pre-commit hook hard-blocks it); every chunk works on its own branch, `simplify/<chunk-name>`.
- No em dashes or en dashes in any file this plan touches, including this plan and PR descriptions (repo dash guard, enforced by pre-commit and CI).
- Never add `Co-Authored-By: Claude` or similar AI-authorship lines to commits or PRs.
- `App.tsx`, `main.tsx`, and all `*.d.ts` files are out of scope for this entire plan (see design doc, `docs/superpowers/specs/2026-07-21-src-simplification-sweep-design.md`).
- `src/lib/lospec.ts` is also out of scope: it went through a review + fix pass on 2026-07-20 (three simplifications applied, commit `62f0bbf`) and does not need another pass right now.
- Dead-code candidates are **report-only, never auto-deleted**. `ts-prune` has produced false positives on this repo before (flagged live exports; flagged-but-unadopted extraction TODOs are a known, intentional category). Every dead-code finding gets a manual disposition (real-dead / unadopted-extraction TODO / false positive) via grep before anything is removed, and that disposition step is never delegated to the review subagent.
- A bug fix (behavior-changing) must never be folded silently into a refactor diff. It gets its own test that fails before the fix and passes after, and the PR description calls it out by name as a bug fix, not "cleanup."
- Advisor is invoked on a chunk's PR only if that PR contains a bug fix (bucket b). Pure-refactor/dedup chunks skip it.
- Every chunk's PR must pass full CI (lint, `tsc --noEmit`, vitest, Playwright) before merge. Local `tsc`/`vitest`/`build` passing is necessary but not sufficient to merge.
- Follow the project's comment policy: no comments by default; only add one where it explains a non-obvious WHY. Flag and remove comments in reviewed files that merely restate the code.
- PowerShell is the preferred shell on this Windows host; Bash is acceptable for POSIX-only steps (this plan gives Bash commands for grep-heavy inventory steps since they're POSIX-portable; use Git Bash or WSL to run them, or the PowerShell equivalent).

---

## Finalized Chunk Order

Real import fan-in was measured on 2026-07-21 (count of other `src/**/*.{ts,tsx}` files, including `App.tsx`, that import each module by path; self-matches excluded). Full methodology: for each candidate file, `grep -rlE "from ['\"][.a-zA-Z/-]*/${base}['\"]" src --include="*.ts" --include="*.tsx" | grep -v "^${file}$" | wc -l`.

Findings that reshape the design doc's starting clusters:
- Almost every file in `hooks/`, `contexts/`, `components/` has fan-in of exactly 1 (only `App.tsx` imports it) or 2 (one sibling component/hook plus `App.tsx`). These directories are uniformly leaf from an internal-reuse perspective; the risk in touching them is local (caught by their own unit test and e2e), not cascading.
- `src/hooks/usePaletteState.ts` is the one hook exception, at fan-in 12 (12 other hooks import it). It is pulled out of the general hooks chunks into its own high-care tier.
- Within `lib/`, `constants.ts` has the highest fan-in of any file measured (15), higher than `color.ts` (10) or `export.ts` (10). It moves from the design doc's "platform/UI-support" cluster into the final, highest-care tier alongside the ramp/color engine.
- `palette.ts` (7) and `style-presets.ts` (7) were omitted from the design doc's clustering entirely; they're added here, grouped with `usePaletteState.ts` as a "core palette/style state" tier given their comparable fan-in and role.

Final order, leaf-first:

| # | Chunk | Files | Fan-in range |
|---|-------|-------|--------------|
| 1 | contexts + store + workers | 7 | 0-1 |
| 2 | hooks: UI/session/tour | 14 | 1 |
| 3 | hooks: ramp/palette actions (minus usePaletteState) | 13 | 1 |
| 4 | components: non-panel | 17 | 1-2 |
| 5 | components: panels | 10 | 1-2 |
| 6 | lib: platform/UI-support (minus constants.ts) | 14 | 0-7 |
| 7 | lib: export/import | 5 | 2-10 |
| 8 | core palette/style state (usePaletteState.ts, palette.ts, style-presets.ts) | 3 | 7-12 |
| 9 | lib: ramp/color engine + constants.ts | 15 | 1-15 |

---

## Standard Per-Chunk Review Subagent Prompt (template)

Every chunk task below dispatches a subagent with this prompt, substituting `<CHUNK_FILES>` (the file list) and `<CHUNK_NAME>`:

```
Repo: C:\Claude\pixel-pal-app. Review chunk "<CHUNK_NAME>" of a systematic
src/ simplification sweep. Do NOT modify any files, this is a review-only
pass; findings will be verified and applied by the orchestrating session.

Files in this chunk:
<CHUNK_FILES>

Apply a combined lens: correctness bugs AND reuse/simplification/consistency
issues, together. Read docs/review-lenses.md (silent-failure + type-design
checklists) and project CLAUDE.md before reviewing. Key constraints:

- Don't propose extracting shared helpers/generics unless there's real
  duplication already present (3+ call sites in this chunk or its direct
  callers). Three similar lines beat a premature abstraction.
- Default to no comments; only flag/keep a comment that explains a
  non-obvious WHY. Flag comments that just restate the code.
- Never suggest deleting anything ts-prune-flagged as unused; this repo has
  had false positives (live exports it didn't detect) and unadopted
  extraction TODOs (helpers extracted but not yet wired up) in that list.
  Report candidates, don't recommend deletion.
- If two code paths are meant to produce the same result (export mirroring a
  view, serialize/deserialize, a hook and its "compute" sibling), diff their
  entire transform chain from shared source to output rather than assuming
  they agree because they call the same helper.

Output findings in three buckets:
(a) behavior-preserving refactor: dedup, rename, simplify a redundant
    check, consistency fix. One sentence description + one sentence fix,
    file:line.
(b) behavior-changing bug fix: a real correctness issue. Describe the
    concrete failure scenario (inputs/state that produce a wrong result or
    crash), file:line, and what the fix would be. Flag these clearly, they
    need a dedicated test.
(c) dead-code candidate: an export/function that looks unused within this
    chunk and its known callers. File:line and why you think it's unused.
    Do not recommend deletion, report only.

Rank each bucket by impact. If a file has nothing worth flagging, say so
briefly rather than inventing minor nits.
```

---

## Task 1: Inventory and Progress Tracker

**Files:**
- Create: `docs/superpowers/plans/2026-07-21-src-simplification-sweep-progress.md`

**Interfaces:**
- Produces: the progress tracker table that every later task's final step updates (columns: Chunk, Status, PR, Bug fixes shipped).

- [ ] **Step 1: Check test coverage per file across all nine chunks**

Run (Git Bash):
```bash
cd /c/Claude/pixel-pal-app
for f in $(find src/lib src/hooks src/contexts src/store src/workers src/components -type f \( -name "*.ts" -o -name "*.tsx" \) | grep -v "\.d\.ts$" | grep -v "App.tsx" | grep -v "main.tsx"); do
  base=$(basename "$f" | sed 's/\.tsx\?$//')
  spec=$(find tests/unit -iname "${base}.spec.*" 2>/dev/null | head -1)
  if [ -z "$spec" ]; then echo "NO TEST: $f"; else echo "covered: $f -> $spec"; fi
done
```

Expected: a mix of `covered:` and `NO TEST:` lines. Save the `NO TEST:` list, you'll need it per chunk below to decide which files get a characterization test before non-trivial edits.

- [ ] **Step 2: Write the progress tracker doc**

```markdown
# src/ Simplification Sweep: Progress Tracker

Tracks chunk-by-chunk status for the plan at
docs/superpowers/plans/2026-07-21-src-simplification-sweep.md.

| # | Chunk | Status | PR | Bug fixes shipped |
|---|-------|--------|----|--------------------|
| 1 | contexts + store + workers | not started | | |
| 2 | hooks: UI/session/tour | not started | | |
| 3 | hooks: ramp/palette actions | not started | | |
| 4 | components: non-panel | not started | | |
| 5 | components: panels | not started | | |
| 6 | lib: platform/UI-support | not started | | |
| 7 | lib: export/import | not started | | |
| 8 | core palette/style state | not started | | |
| 9 | lib: ramp/color engine + constants | not started | | |

## Files with no existing unit test (as of 2026-07-21)

<paste the "NO TEST:" lines from Task 1 Step 1 here>
```

- [ ] **Step 3: Commit**

```bash
cd /c/Claude/pixel-pal-app
git checkout -b docs/simplification-sweep-progress-tracker
git add docs/superpowers/plans/2026-07-21-src-simplification-sweep-progress.md
git commit -m "docs: add progress tracker for src/ simplification sweep"
git checkout master
git merge --no-ff docs/simplification-sweep-progress-tracker -m "Merge docs/simplification-sweep-progress-tracker"
git push origin master
git branch -d docs/simplification-sweep-progress-tracker
```

---

## Task 2: Chunk 1, contexts + store + workers

**Files:**
- Review: `src/contexts/EditorContext.tsx`, `src/contexts/LayoutContext.tsx`, `src/contexts/PaletteContext.tsx`, `src/contexts/ThemeContext.tsx`, `src/contexts/index.ts`, `src/store/rampsStore.ts`, `src/workers/remap.worker.ts`
- Test: whichever of `tests/unit/*.spec.*` cover these (check Task 1's inventory output)

**Interfaces:**
- Consumes: the "NO TEST" list from Task 1.
- Produces: nothing consumed by later tasks; this chunk is independent of the others.

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/contexts-store-workers
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `contexts + store + workers`
- `<CHUNK_FILES>` = the 7 files listed above

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

For each behavior-preserving refactor the subagent reported, make the edit yourself (or verify the subagent's proposed diff if it already applied them, this template says review-only, so no diffs exist yet, you write them). Before applying any "duplicate/identical" claim, open the files and confirm it yourself, don't take the subagent's word for it.

- [ ] **Step 4: Handle bucket (b) findings, if any**

For each behavior-changing bug fix: write a test in the appropriate `tests/unit/*.spec.*` file that fails against current behavior, run it to confirm the failure, then implement the fix, then confirm the test passes. If the touched file has no existing spec file, create one following the naming convention of a neighboring spec in `tests/unit/`.

- [ ] **Step 5: Handle bucket (c) findings**

For each dead-code candidate, grep the codebase for every reference to that export. Classify it: real-dead (no references anywhere, including `App.tsx`), unadopted-extraction TODO (referenced in a design/plan doc as a future adoption target but not yet imported), or false positive (it is in fact used, e.g. `(used in module)` per `npm run deadcode` conventions). Do not delete anything, note the disposition in the PR description instead.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run tests/unit/rampsStore.spec.ts
npm run build
```

Expected: all three succeed with no errors.

- [ ] **Step 7: Push and open PR**

```bash
git add -A
git commit -m "refactor: simplify contexts, store, and worker modules"
git push -u origin simplify/contexts-store-workers
gh pr create --title "Simplify contexts/store/workers (sweep chunk 1)" --body "$(cat <<'EOF'
Part of the src/ simplification sweep (docs/superpowers/plans/2026-07-21-src-simplification-sweep.md).

Chunk 1 of 9: contexts + store + workers.

## Findings applied
- (a) refactors: <fill in from step 3>
- (b) bug fixes: <fill in from step 4, or "none">
- (c) dead-code candidates (report only): <fill in from step 5, or "none">

## Test plan
- [ ] tsc --noEmit clean
- [ ] vitest suite green
- [ ] npm run build clean
- [ ] CI green (lint, full vitest, Playwright)
EOF
)"
```

- [ ] **Step 8: Wait for CI, then merge**

Check CI status with `gh pr checks <PR_NUMBER> --watch`. If this chunk shipped any bucket-(b) bug fix, call `advisor()` on the diff before merging. Once CI is green (and advisor, if invoked, has no blocking concerns):

```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
git checkout master
git pull
```

- [ ] **Step 9: Update the progress tracker**

Edit `docs/superpowers/plans/2026-07-21-src-simplification-sweep-progress.md`, mark chunk 1 as "merged", fill in the PR link and any bug fixes shipped. Commit directly to a small branch and merge the same way as Task 1 Step 3 (docs-only, no PR needed).

---

## Task 3: Chunk 2, hooks: UI/session/tour

**Files:**
- Review: `src/hooks/useDisplaySettings.ts`, `src/hooks/useDragReorder.tsx`, `src/hooks/useGlobalShortcuts.ts`, `src/hooks/useSessionPrefs.ts`, `src/hooks/useSideBySide.ts`, `src/hooks/useSideBySideCompute.ts`, `src/hooks/useSpriteImport.ts`, `src/hooks/useThemeHelpers.ts`, `src/hooks/useTour.ts`, `src/hooks/useTourOrchestration.ts`, `src/hooks/useUpdater.ts`, `src/hooks/useVizSettings.ts`, `src/hooks/useExportSettings.ts`, `src/hooks/usePanelLayout.ts`
- Test: whichever of `tests/unit/*.spec.*` cover these (check Task 1's inventory output)

**Interfaces:**
- Consumes: the "NO TEST" list from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/hooks-ui-session-tour
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `hooks: UI/session/tour`
- `<CHUNK_FILES>` = the 14 files listed above

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run tests/unit/useTour.spec.ts tests/unit/useSideBySide.spec.ts tests/unit/useSideBySideCompute.spec.ts tests/unit/usePanelLayout.spec.ts
npm run build
```

Adjust the vitest file list to match whatever Task 1's inventory found for this chunk's files; run the full suite (`npx vitest run`) if unsure which specs apply.

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify UI/session/tour hooks (sweep chunk 2)" and "Chunk 2 of 9" in the body.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8.

- [ ] **Step 9: Update the progress tracker**

Same process as Task 2 Step 9, marking chunk 2.

---

## Task 4: Chunk 3, hooks: ramp/palette actions (minus usePaletteState)

**Files:**
- Review: `src/hooks/useBaseDock.ts`, `src/hooks/useExport.ts`, `src/hooks/useGenerationActions.ts`, `src/hooks/useHardwareLock.ts`, `src/hooks/useHarmony.ts`, `src/hooks/useHistory.ts`, `src/hooks/useImageExtract.ts`, `src/hooks/useImageExtractHandlers.ts`, `src/hooks/useImageRemap.ts`, `src/hooks/useImageRemapCompute.ts`, `src/hooks/useRampEditing.ts`, `src/hooks/useRampStyleActions.ts`, `src/hooks/useSavedStylesActions.ts`
- Note: `usePaletteState.ts`, `useSavedPalettes.ts`, `useSavedPalettesActions.ts`, `usePaletteReset.ts`, and `useLospecBrowser.ts` are excluded here: the first is handled in Task 9 (core palette/style state tier), the rest touch `useSavedPalettesActions.ts` which was already modified in the 2026-07-20 Lospec fixes and shares heavy dependency on `usePaletteState.ts`, so they move to Task 9 too to avoid reviewing them twice under different assumptions about `usePaletteState.ts`'s shape.

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/hooks-ramp-palette-actions
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `hooks: ramp/palette actions`
- `<CHUNK_FILES>` = the 13 files listed above

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run
npm run build
```

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify ramp/palette action hooks (sweep chunk 3)" and "Chunk 3 of 9" in the body.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8.

- [ ] **Step 9: Update the progress tracker**

Same process as Task 2 Step 9, marking chunk 3.

---

## Task 5: Chunk 4, components: non-panel

**Files:**
- Review: `src/components/AdjacencyMatrix.tsx`, `src/components/BaseColorDock.tsx`, `src/components/CrossAdjacencyMatrix.tsx`, `src/components/CrossRampDither.tsx`, `src/components/CurveEditor.tsx`, `src/components/CvdActiveBadge.tsx`, `src/components/DesktopAppLink.tsx`, `src/components/DitherBlend.tsx`, `src/components/ErrorBoundary.tsx`, `src/components/PaletteCycleEditor.tsx`, `src/components/PixelPlayground.tsx`, `src/components/RampAdvancedPanel.tsx`, `src/components/SectionCard.tsx`, `src/components/ShadeCountControl.tsx`, `src/components/TourOverlay.tsx`, `src/components/TourPanel.tsx`, `src/components/V2EngineNotice.tsx`

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/components-non-panel
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `components: non-panel`
- `<CHUNK_FILES>` = the 17 files listed above

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3. Note: `SectionCard.tsx` is a shared building block (used by multiple panels per project memory, gained `headerTitle`/`headerTourId`/`chevronColor`/`keepMounted` props via a prior fidelity audit), treat proposed prop or interface changes to it with extra care and check every panel that uses it.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run
npm run build
```

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify non-panel components (sweep chunk 4)" and "Chunk 4 of 9" in the body.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8.

- [ ] **Step 9: Update the progress tracker**

Same process as Task 2 Step 9, marking chunk 4.

---

## Task 6: Chunk 5, components: panels

**Files:**
- Review: `src/components/panels/ExportPanel.tsx`, `src/components/panels/HarmonyPanel.tsx`, `src/components/panels/HeaderControls.tsx`, `src/components/panels/HistoryPanel.tsx`, `src/components/panels/InputPanel.tsx`, `src/components/panels/LospecBrowserPanel.tsx`, `src/components/panels/PlaygroundPanel.tsx`, `src/components/panels/RampsPanel.tsx`, `src/components/panels/SavedPalettesPanel.tsx`, `src/components/panels/VizComparePanel.tsx`
- Note: `LospecBrowserPanel.tsx` already had its `PaletteCard` extraction done on 2026-07-20 (commit `62f0bbf`). Still include it in this chunk's review for the bug-risk and consistency lenses, but the reviewer should not re-flag the duplication that was already fixed.

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/components-panels
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `components: panels`
- `<CHUNK_FILES>` = the 10 files listed above

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run
npm run build
```

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify panel components (sweep chunk 5)" and "Chunk 5 of 9" in the body.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8.

- [ ] **Step 9: Update the progress tracker**

Same process as Task 2 Step 9, marking chunk 5.

---

## Task 7: Chunk 6, lib: platform/UI-support (minus constants.ts)

**Files:**
- Review: `src/lib/base-dock.ts`, `src/lib/env.ts`, `src/lib/hex-utils.ts`, `src/lib/history-snapshot.ts`, `src/lib/image-extract.ts`, `src/lib/image-remap.ts`, `src/lib/panel-state.ts`, `src/lib/pixel-brush.ts`, `src/lib/remap-worker-client.ts`, `src/lib/renderCount.ts`, `src/lib/tauri-bridge.ts`, `src/lib/theme.ts`, `src/lib/tour-runtime.ts`, `src/lib/tours.ts`, `src/lib/viz-interaction.ts`

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/lib-platform-support
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `lib: platform/UI-support`
- `<CHUNK_FILES>` = the 15 files listed above

Add this extra line to the prompt for this chunk only: "`tauri-bridge.ts` and any dynamic-import gating pattern in these files exists specifically so the web build (no Tauri) doesn't break; do not propose converting a dynamic/conditional import to a static one."

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run
npm run build
npm run build:web
```

Both build commands must succeed since this chunk includes the Tauri-bridge module that differs between desktop and web builds.

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify lib platform/UI-support modules (sweep chunk 6)" and "Chunk 6 of 9" in the body.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8.

- [ ] **Step 9: Update the progress tracker**

Same process as Task 2 Step 9, marking chunk 6.

---

## Task 8: Chunk 7, lib: export/import

**Files:**
- Review: `src/lib/export.ts`, `src/lib/palette-export.ts`, `src/lib/palette-import.ts`, `src/lib/save-file.ts`, `src/lib/strip-export.ts`

**Interfaces:**
- Consumes: nothing from earlier chunks.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/lib-export-import
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `lib: export/import`
- `<CHUNK_FILES>` = the 5 files listed above

Add this extra line to the prompt for this chunk only, per the mirror-path review rule: "`export.ts`/`palette-export.ts`/`strip-export.ts` are three different export FORMATS of the same underlying palette data, and `palette-import.ts` is a round-trip partner to at least one of them. If any two of these are meant to produce compatible/round-trippable output, diff their entire transform chains (dedupe, sort, clamp, round, normalize steps) rather than assuming agreement because they share a data source."

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4. Pay particular attention to any finding involving a normalization step (dedupe, sort, clamp, round) present in one export/import path but not another, per the mirror-path rule, and test an edge input (duplicates, empty palette, max color count) that would expose divergence.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run
npm run build
```

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify lib export/import modules (sweep chunk 7)" and "Chunk 7 of 9" in the body.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8. This chunk is a likely candidate for bucket-(b) findings given the mirror-path risk called out above, budget for an advisor call.

- [ ] **Step 9: Update the progress tracker**

Same process as Task 2 Step 9, marking chunk 7.

---

## Task 9: Chunk 8, core palette/style state

**Files:**
- Review: `src/hooks/usePaletteState.ts`, `src/lib/palette.ts`, `src/lib/style-presets.ts`
- Also review (deferred from Task 4 for this reason): `src/hooks/useSavedPalettes.ts`, `src/hooks/useSavedPalettesActions.ts`, `src/hooks/usePaletteReset.ts`, `src/hooks/useLospecBrowser.ts`

**Interfaces:**
- Consumes: nothing from earlier chunks (this tier was deliberately isolated because these files are the most heavily depended-on in the hooks tree).

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/core-palette-state
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `core palette/style state`
- `<CHUNK_FILES>` = the 7 files listed above

Add this extra line to the prompt for this chunk only: "`usePaletteState.ts` is imported by 12 other hooks in this codebase, more than any other hook. Treat any proposed change to its exported interface (function names, parameter shapes, return shape) as high-risk: list every caller you can find via grep and confirm each still compiles/behaves the same way before proposing the change, don't just describe the change in isolation."

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3. Before applying any change to `usePaletteState.ts`'s public interface, grep for every import of it and read each call site, not just the ones the subagent happened to check.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4. Given the fan-in here, run the FULL test suite (not a targeted subset) after any fix in this chunk: `npx vitest run`.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run
npm run build
npm run build:web
```

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify core palette/style state (sweep chunk 8)" and "Chunk 8 of 9" in the body. Call out in the PR description that this chunk touches the most heavily-depended-on hook in the codebase and list which callers were manually checked.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8. Given the fan-in, call `advisor()` on this chunk's diff regardless of whether it contains a bucket-(b) fix, this is the one exception to the "only if bug fix" rule, made explicit because of blast radius rather than left to judgment mid-sweep.

- [ ] **Step 9: Update the progress tracker**

Same process as Task 2 Step 9, marking chunk 8.

---

## Task 10: Chunk 9, lib: ramp/color engine + constants.ts

**Files:**
- Review: `src/lib/color.ts`, `src/lib/constants.ts`, `src/lib/curve.ts`, `src/lib/hardware-quantize.ts`, `src/lib/harmony.ts`, `src/lib/mood.ts`, `src/lib/oklch.ts`, `src/lib/palette-generator.ts`, `src/lib/permute-indexed-state.ts`, `src/lib/ramp-engine.ts`, `src/lib/ramp-helpers.ts`, `src/lib/ramp-pipeline.ts`, `src/lib/randomizer.ts`, `src/lib/snapshot-ramps.ts`, `src/lib/wcag.ts`

**Interfaces:**
- Consumes: nothing from earlier chunks. This is deliberately the last chunk: highest fan-in in the entire sweep (`constants.ts` at 15, `color.ts` at 10).

- [ ] **Step 1: Branch**

```bash
cd /c/Claude/pixel-pal-app
git checkout master
git pull
git checkout -b simplify/lib-ramp-color-engine
```

- [ ] **Step 2: Dispatch the review subagent**

Use the Standard Per-Chunk Review Subagent Prompt template above with:
- `<CHUNK_NAME>` = `lib: ramp/color engine + constants`
- `<CHUNK_FILES>` = the 15 files listed above

Add this extra line to the prompt for this chunk only: "This is the final and highest-risk chunk of the sweep, `constants.ts` alone is imported by 15 other files. `color.ts` and `ramp-engine.ts` implement the perceptual OKLCH ramp math (see project memory 'ramp-engine' and 'ramp-engine-v2' for prior determinism and balance-guarantee decisions already made deliberately, e.g. the retired ΔL threshold). Do not propose changes to color-math constants, thresholds, or formulas as 'simplification' without flagging them as bucket (b) and requiring a snapshot/visual-strip test, prior tuning in this file was often deliberate and visually validated, not incidental."

- [ ] **Step 2.5: Write characterization tests for thin-coverage files before non-trivial changes**

Cross-reference this chunk's files against the "NO TEST" list from Task 1 Step 1. For any file on that list where an upcoming bucket (a) or (b) finding is a non-trivial change (not a pure rename, comment removal, or obviously behavior-preserving deletion), write a test in the appropriate `tests/unit/*.spec.*` file first that exercises the function/component with representative inputs and asserts today's actual current output, run it to confirm it passes against current behavior, then proceed. This is the safety net for this sweep: CI passing on an otherwise-untested file proves nothing.

- [ ] **Step 3: Apply bucket (a) findings directly**

Same process as Task 2 Step 3.

- [ ] **Step 4: Handle bucket (b) findings, if any**

Same process as Task 2 Step 4. Given this chunk's role, run the full suite after any fix: `npx vitest run`, and manually sanity-check any visual/color output change by running the app (`npm run dev`) and comparing a ramp before/after if the fix touches ramp generation.

- [ ] **Step 5: Handle bucket (c) findings**

Same process as Task 2 Step 5.

- [ ] **Step 6: Local gate**

```bash
cd /c/Claude/pixel-pal-app
npx tsc --noEmit
npx vitest run
npm run build
npm run build:web
```

- [ ] **Step 7: Push and open PR**

Same process as Task 2 Step 7, with PR title "Simplify ramp/color engine and constants (sweep chunk 9)" and "Chunk 9 of 9, final chunk" in the body.

- [ ] **Step 8: Wait for CI, then merge**

Same process as Task 2 Step 8. Call `advisor()` on this chunk's diff regardless of bucket-(b) status, same exception as chunk 8, given this is the highest-fan-in code in the codebase.

- [ ] **Step 9: Update the progress tracker, close out the sweep**

Same process as Task 2 Step 9, marking chunk 9 as the final entry. Add a closing note to the progress tracker doc summarizing total bug fixes found across all nine chunks and any dead-code candidates still awaiting a manual disposition decision.
