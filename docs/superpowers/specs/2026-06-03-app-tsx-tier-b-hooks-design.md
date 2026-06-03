# App.tsx Tier B — Domain Logic → Custom Hooks

**Date:** 2026-06-03
**Status:** Design approved, pending spec review
**Predecessor:** `2026-06-02-app-tsx-tier-a-helper-extraction-design.md` (Tier A, merged PR #31)

---

## Goal

Decompose the `src/App.tsx` god component (~7251 lines, `@ts-nocheck`) by
extracting its ~127 `useState` fields and ~44 `useEffect`s into focused
custom hooks. **Zero behavior change.** App.tsx remains the wiring layer that
calls the hooks and composes the JSX return; JSX → per-panel components is
deferred to Tier C.

This is a *reorganize*, not a *redesign*. The snapshot/undo machinery stays
byte-identical. No `useReducer` consolidation, no React context — both are
deferred (reducer to a possible later step, context to Tier C when we see
what panels actually consume).

---

## The structural fact this design is built on

`buildUndoSnapshot` (App.tsx:3060) names exactly **19 fields**. That partition
is the backbone:

- **Document state (19 fields):** coupled by three things that all read them
  together — the debounced history watcher effect, the serialize/diff label
  inference (`inferLabel`), and `applyUndoSnapshot`. These move as one unit.
  The 19: `baseColors, aiColorNames, aiReasoning, rampSize, shuffleSeed,
  overrides, harmonyAnchor, rampSizeOverrides, rampSatOverrides,
  hueShiftStrengthPerRamp, hiddenShades, rampShuffleOffsets, hardwareLock,
  hueShiftStrength, lockedRamps, collapsedRamps, lightnessCurvePerRamp,
  satCurvePerRamp, stylePresets`.
- **Ephemeral UI state (~108 fields):** loading flags, errors, feedback
  strings, panel toggles, drag state, importer drafts, eyedropper, etc.
  Domain-local and **mutually independent** — no shared container needed.

Because the ~108 are independent, the "state-sharing architecture" question
collapses: most of Tier B is plain domain hooks returning `{state, setters,
handlers}`; only the 19-field document core wants shared machinery, and it
stays co-located with history.

### Effect classification (44 effect sites)

- **Domain-local persistence** (the majority): `[theme]`, `[cvdMode]`,
  `[rampSize]`, `[gplStyle]`, `[exportFormat]`, `[vizStyle]`,
  `[rampExportStyle]`, `[sectionOrder]`, the panel-open persistence at
  line 1029, the remap effects (`[remapImageDataUrl, livePaletteSig]`,
  `[remapOutput]`, `[sbsLeftRemap]`, `[sbsRightRemap]`, `[sbsRemapSource,...]`).
  Each moves cleanly with its domain.
- **Cross-domain cluster 1 — history:** the debounced watcher (App.tsx:2648,
  dep array at 2696), the ref-sync effects (2645/2646), and the keybind
  rebind (2728, deps `[historyEntries, historyIndex]`). The single most
  delicate piece in the file. Stays with the document core.
- **Cross-domain cluster 2 — generation pipeline:** effects at 3740/3797
  (dep arrays 3770 `[gplImport, pinEditor, editingIndex, compareMode]`,
  3828 `[baseColors, lockedRamps, safeAnchor, gplImport, pinEditor,
  editingIndex]`). These read document + editor state together, so the ramp
  generation/harmony pipeline lives **with** `usePaletteState`, not in its
  own hook.

---

## Hook decomposition

### Wave 1 — independent ephemeral hooks

Extract first. Near-zero coupling, each gets its own `.spec.ts` where logic is
testable (pure handler logic; effect-only hooks get a smoke test or are
covered by existing e2e). Each returns `{state fields, setters, handlers}`.

| Hook | Owns (state) | Effects |
|---|---|---|
| `useDisplaySettings` | theme, cvdMode, crtEnabled | theme persist `[theme]`, cvd persist `[cvdMode]` |
| `useExportSettings` | gplStyle, exportFormat, rampExportStyle, exportFeedback, lastSavedPath, sessionRampGplFolder | persist `[gplStyle]`, `[exportFormat]`, `[rampExportStyle]` |
| `usePanelLayout` | rampsOpen, harmonyOpen, tipsOpen, hwPickerOpen, exportOpen, historyOpen, savedOpen, sbsOpen, pgOpen, advancedOpen, sectionOrder, dragOver, draggingKey | panel-open persist (1029), sectionOrder persist (1033) |
| `useAIAssist` | aiInput, aiLoading, aiError, showAISettings, aiConfigured (the *request*) | — |
| `useImageExtract` | imageDataUrl, imageColorCount, imageLoading, imageError, isDragging, eyedropperActive, imageZoom, imageNaturalSize, hoveredColor | mode-reset (1105) |
| `useImageRemap` | remapImageDataUrl, remapImageNaturalSize, remapOutput, remapOutputSignature, remapDither, remapLoading, remapError, remapImageName, remapDownloadScale, remapDownloadConfirmPending, remapDragOver | `[remapImageDataUrl, livePaletteSig]`, `[remapOutput]`, `[remapImageDataUrl]` |
| `useSideBySide` | sbsRemapSource, sbsLeftRemap, sbsRightRemap, sbsLeftRemapLoading, sbsRightRemapLoading, sbsLeft, sbsRight, sbsLeftPayload, sbsRightPayload, sbsLeftError, sbsRightError, sbsLeftLoading, sbsRightLoading | `[sbsLeftRemap]`, `[sbsRightRemap]`, `[sbsLeft]`, `[sbsRight]`, `[sbsRemapSource, leftRemapKey]`, `[sbsRemapSource, rightRemapKey]` |
| `useSpriteImport` | spriteKey, customSprites, showSpriteImporter, spriteImportText, spriteImportName, spriteImportError, spriteDragging | — |
| `useTour` | tourOpen, tourGuideId, tourStep, launcherOpen | tour snapshot effects |
| `useSavedPalettes` | savedPalettes, saveName, savedError, savedBusy, confirmDeleteSlug, renamingSlug, renameDraft, renameError, savedFilter, classicLoaderId, confirmReset | saved persist |
| `useVizSettings` | vizStyle, matrixColorSet, matrixView, ditherPattern | `[vizStyle]` persist |
| `useUpdater` | updateInfo, updateReady, updateDownloading | updater init effects |

Leftover small fields (mode, colorInput, copiedHex, compareMode/anchor/result,
gplImport, editingIndex, editorHsv, pinEditor, addBaseFeedback) are evaluated
during implementation: either folded into the nearest hook above or left in
App.tsx if they are genuinely cross-cutting wiring. The editor cluster
(editingIndex, editorHsv, pinEditor) and compare cluster
(compareMode, compareAnchor, compareResult) are candidates for a
`useShadeEditor` / `useCompare` hook **but** are touched by
`applyUndoSnapshot` — see the interface note below.

### Wave 2 — document core (last, one co-located unit)

- **`usePaletteState`** — owns the 19 snapshot fields + the ramp-generation /
  harmony pipeline (effects 3740/3797). Exposes the document state and the
  bulk handlers (Generate, Harmonize, Load, GPL import, Add/Remove ramp).
  This includes `aiColorNames` and `aiReasoning`: the AI *request* is
  ephemeral (`useAIAssist`), but the AI *results* are document state — written
  by the generate handler into `usePaletteState` and restored by
  `applyUndoSnapshot`, same as `baseColors`. Leaving them in `useAIAssist`
  would force `useHistory`'s restore to reach into the request hook's setters,
  re-introducing the cross-hook leak this design exists to contain.
- **`useHistory`** — owns historyEntries, historyIndex, historyOpen, the refs
  (historyEntriesRef, historyIndexRef, isReplayingHistoryRef,
  pendingLabelRef), the debounced watcher, `buildUndoSnapshot`,
  `applyUndoSnapshot`, `inferLabel`, `undo`/`redo`/`jump`, keybind rebind.

These two stay together (same file or sibling files wired in App.tsx). The
watcher must observe all 19 fields; splitting them across unrelated hooks
re-introduces the coupling we are containing.

---

## Key interface: `useHistory` ↔ editor/compare reset

`applyUndoSnapshot` (App.tsx:3090) is **not pure to the 19 document fields**.
After restoring them it also resets four ephemeral fields:

```js
setPinEditor(null);
setEditingIndex(null);
setCompareAnchor(null);
setCompareResult(null);
```

So `useHistory` cannot be fully isolated from the editor/compare state. The
restore path must invoke reset callbacks owned elsewhere. Design:

- `useHistory` accepts an `onRestore` (or `resetTransientEditors`) callback in
  its options; `applyUndoSnapshot` calls it after applying the 19.
- App.tsx wires that callback to the editor/compare setters (whether those
  live in App.tsx or in a `useShadeEditor`/`useCompare` hook).

This keeps the impurity explicit at the wiring layer instead of hidden inside
the history hook.

---

## Verification strategy

`@ts-nocheck` on App.tsx means **the build gate is theater for this direction
of move** (obs #7): `tsc` skips the file, and the bundler only errors on a bad
`import` — never on a dangling reference to a now-removed local. A green build
does **not** prove a clean extraction.

Per-task verification, in order:

1. **Characterization tests for undo/redo, written BEFORE Wave 2.** A sequence
   of edits → undo → redo → jump, asserting the document state round-trips.
   This is the safety net for the one behavior-sensitive cluster. Add to the
   vitest unit suite.
2. **grep-per-moved-symbol.** For each field/handler moved out, confirm it
   appears in App.tsx only as a hook-return binding + call sites, never as a
   leftover `const`/`useState` redefinition (`grep -n 'setFoo\|const foo'`).
   This catches the dangling-local case the compiler misses.
3. `npm test` (vitest) + `npm run build` — necessary, not sufficient.
4. **Early e2e run.** Run `npm run test:e2e` (or push to let CI run it) after
   Wave 1 and again after Wave 2 — do not defer all behavioral checks to the
   end. e2e only runs in CI locally-unavailable contexts; gate the merge on
   green CI, never on local unit pass alone (obs #6).

---

## Task sizing

Each hook extraction = **create hook file + wire into App.tsx + remove old
declarations + commit, within one turn** (obs #8 — a half-applied move that
deletes a local but doesn't add the import leaves App.tsx in a non-compiling
duplicate-declaration state). If a hook is large (useSideBySide, useImageRemap,
usePaletteState), split into "create hook (state + handlers)" and
"wire + remove from App.tsx + commit" sub-tasks. Commit the instant it's green.

These tasks are **bespoke judgment work, not loopable** like Tier A — no
extraction agent. Each move reshapes interfaces and must be reasoned about.

---

## Out of scope (deferred)

- `useReducer` consolidation of the 19 document fields → possible later step.
- React context for cross-hook sharing → Tier C, when panel components reveal
  what they actually consume.
- JSX return → per-panel components → Tier C.
- Issue #30 (pre-existing `buildRampsForSnapshot` hiddenShades bug).

---

## Success criteria

- App.tsx materially smaller; each domain's state+effects+handlers live in a
  named hook with a clear return interface.
- Zero behavior change: undo/redo characterization tests pass; full e2e green
  in CI.
- No field defined in two places; grep-per-symbol clean for every moved field.
- Snapshot machinery byte-identical to pre-Tier-B.
