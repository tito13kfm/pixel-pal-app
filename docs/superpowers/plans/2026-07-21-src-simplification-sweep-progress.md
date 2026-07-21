# src/ Simplification Sweep: Progress Tracker

Tracks chunk-by-chunk status for the plan at
docs/superpowers/plans/2026-07-21-src-simplification-sweep.md.

| # | Chunk | Status | PR | Bug fixes shipped |
|---|-------|--------|----|--------------------|
| 1 | contexts + store + workers | merged | [#162](https://github.com/tito13kfm/pixel-pal-app/pull/162) | none (consistency-only: reorderRamps now clears compareResult) |
| 2 | hooks: UI/session/tour | merged | [#164](https://github.com/tito13kfm/pixel-pal-app/pull/164) | usePanelLayout: corrupt ui:sectionOrder in localStorage crashed mount (unguarded JSON.parse); now falls back to DEFAULT_SECTION_ORDER |
| 3 | hooks: ramp/palette actions | merged | [#165](https://github.com/tito13kfm/pixel-pal-app/pull/165) | reExtractFromImage missing 3 guards (stale error, empty-extraction, decode-failure) vs its handleImageUpload sibling; harmony/eyedropper add paths' case-sensitive duplicate check, root-caused to handleGenerate not normalizing colorInput to lowercase |
| 4 | components: non-panel | not started | | |
| 5 | components: panels | not started | | |
| 6 | lib: platform/UI-support | not started | | |
| 7 | lib: export/import | not started | | |
| 8 | core palette/style state | not started | | |
| 9 | lib: ramp/color engine + constants | not started | | |

## Housekeeping outside the sweep's own chunks

While gating chunk 1, master's CI was found red for two pre-existing reasons,
both stemming from the 2026-07-20 Lospec commit (`62f0bbf`): a hooks-lint
dependency-array violation in `useLospecBrowser.ts`, and stale line numbers
in `.ts-prune-baseline.txt` for two lospec.ts test-only exports. Fixed and
merged as [#163](https://github.com/tito13kfm/pixel-pal-app/pull/163) before
continuing.

## Carried-forward check for chunk 6

Chunk 2's bug fix (usePanelLayout's unguarded `JSON.parse` on
`ui:sectionOrder`) prompted advisor to flag a sibling risk: `lib/panel-state.ts`'s
`loadPanelState()` is called at module scope in `usePanelLayout.ts`
(`const _panels = loadPanelState()`). If that function has the same unguarded-parse
bug, it's strictly worse: a throw at module-evaluation time can't be caught
by an ErrorBoundary (render-only), so it's an unrecoverable white screen.
`panel-state.ts` is in chunk 6's file list, check this specifically when
that chunk runs.

## Carried-forward check for chunk 5

Chunk 3 fixed a case-sensitive `baseColors.includes()` duplicate check at
its root (handleGenerate normalizing colorInput to lowercase), but a grep of
every `baseColors.(includes|indexOf|findIndex|some)(` site in `src/` found
two more case-sensitive reads that are now believed fixed by the root
change, but weren't directly verified against a live component render:
`HarmonyPanel.tsx:49,72` and `RampsPanel.tsx:338` (both chunk 5, components:
panels). When that chunk runs, confirm these sites behave correctly now
rather than re-flagging them as a fresh finding.

## Files with no existing unit test (as of 2026-07-21)

NO TEST: src/lib/constants.ts
NO TEST: src/lib/curve.ts
NO TEST: src/lib/env.ts
NO TEST: src/lib/palette.ts
NO TEST: src/lib/ramp-pipeline.ts
NO TEST: src/lib/renderCount.ts
NO TEST: src/lib/tauri-bridge.ts
NO TEST: src/lib/theme.ts
NO TEST: src/lib/tours.ts
NO TEST: src/hooks/useBaseDock.ts
NO TEST: src/hooks/useDisplaySettings.ts
NO TEST: src/hooks/useDragReorder.tsx
NO TEST: src/hooks/useExport.ts
NO TEST: src/hooks/useExportSettings.ts
NO TEST: src/hooks/useGenerationActions.ts
NO TEST: src/hooks/useGlobalShortcuts.ts
NO TEST: src/hooks/useHardwareLock.ts
NO TEST: src/hooks/useHarmony.ts
NO TEST: src/hooks/useHistory.ts
NO TEST: src/hooks/useImageExtract.ts
NO TEST: src/hooks/useImageExtractHandlers.ts
NO TEST: src/hooks/useImageRemap.ts
NO TEST: src/hooks/useImageRemapCompute.ts
NO TEST: src/hooks/usePaletteState.ts
NO TEST: src/hooks/usePanelLayout.ts
NO TEST: src/hooks/useRampEditing.ts
NO TEST: src/hooks/useRampStyleActions.ts
NO TEST: src/hooks/useSavedPalettes.ts
NO TEST: src/hooks/useSessionPrefs.ts
NO TEST: src/hooks/useSideBySide.ts
NO TEST: src/hooks/useSideBySideCompute.ts
NO TEST: src/hooks/useSpriteImport.ts
NO TEST: src/hooks/useThemeHelpers.ts
NO TEST: src/hooks/useTour.ts
NO TEST: src/hooks/useTourOrchestration.ts
NO TEST: src/hooks/useUpdater.ts
NO TEST: src/hooks/useVizSettings.ts
NO TEST: src/contexts/EditorContext.tsx
NO TEST: src/contexts/index.ts
NO TEST: src/contexts/LayoutContext.tsx
NO TEST: src/contexts/PaletteContext.tsx
NO TEST: src/contexts/ThemeContext.tsx
NO TEST: src/workers/remap.worker.ts
NO TEST: src/components/AdjacencyMatrix.tsx
NO TEST: src/components/CrossRampDither.tsx
NO TEST: src/components/CurveEditor.tsx
NO TEST: src/components/CvdActiveBadge.tsx
NO TEST: src/components/DesktopAppLink.tsx
NO TEST: src/components/DitherBlend.tsx
NO TEST: src/components/panels/HeaderControls.tsx
NO TEST: src/components/panels/InputPanel.tsx
NO TEST: src/components/PixelPlayground.tsx
NO TEST: src/components/RampAdvancedPanel.tsx
NO TEST: src/components/TourOverlay.tsx
NO TEST: src/components/TourPanel.tsx
NO TEST: src/components/V2EngineNotice.tsx
