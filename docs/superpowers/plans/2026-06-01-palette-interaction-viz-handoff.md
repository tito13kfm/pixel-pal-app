# Handoff: Palette Interaction Visualizations

**Date:** 2026-06-01
**Branch:** `feat/palette-interaction-viz` (created off `feat/viz-png-export`)
**Status:** Pre-brainstorm. Nothing built yet. This doc resumes a fresh (post-`/clear`) session.

## What to do next

Run the **superpowers:brainstorming** skill to design TWO new palette visualizations, then `writing-plans` → `subagent-driven-development` (same flow we used for the PNG export feature). Both features are wanted and judged "equally useful." Decide during brainstorming whether to spec them as one combined feature or two sequential ones (lean: one spec, two components — they share infra).

### Feature 1 — Adjacency / pairing matrix
N×N grid: every palette color against every other. Each cell shows the two colors together (side-by-side split, or one as a thin border inside the other). Optionally tint/annotate each cell by **contrast ratio** or **ΔE_OK** so clashing vs harmonious pairs read at a glance. This is the most direct answer to "how do these colors work together."
- Open questions for brainstorm: which color set drives it — unique deduped colors (`computeVizData().allColors`) or per-ramp bases? Cell metric (contrast ratio vs ΔE_OK vs none)? Diagonal handling? Size limits for big palettes (N could be 30+ → matrix gets large).

### Feature 3 — Dither-blend preview
Pixel-art-specific: for adjacent colors (within a ramp and/or across ramps) show a 2-color **checkerboard / Bayer dither blend** so users see the optical mix they'll actually get when dithering at sprite scale. Nothing in the app shows this today.
- Open questions: which pairs to show (consecutive ramp shades? all adjacent mosaic neighbors?)? Dither pattern (2x2 checker vs 4x4 Bayer)? One blend swatch per pair, or a strip?

## Reuse — do NOT rebuild (all on this branch via PR #20)
- `src/lib/strip-export.ts` — `computeVizData(ramps): { allColors, sortedByL, mosaicRamps }` (shared screen+export source of truth) and `drawLightnessStripPng` / `drawMosaicPng` (flat-rect canvas → PNG Blob pattern). New viz draws should follow the same canvas pattern.
- `src/lib/hex-utils.ts` — `dedupeHexes`.
- `src/lib/save-file.ts` — `saveFile({ folderKey: 'png', data: { bytes: Blob }, ... })`, Tauri native dialog + browser anchor fallback. Already proven.
- Color math in `src/lib/color.ts` (`hexToHsl`, etc.) and OKLCH in `src/lib/oklch.ts` (ΔE_OK lives in the ramp engine — grep `deltaE`/`ΔE` in `src/lib/ramp-engine.ts`). WCAG contrast ratio helper already exists for the WCAG Check feature — grep `contrast` in `src/App.tsx` / `src/lib`.
- The on-screen viz lives in `renderSlotViz` in `src/App.tsx` (Visualize & Compare section). New views likely slot in there next to Mosaic / Lightness / polar plot, and respect the `vizStyle` toggle.

## Decisions to confirm during brainstorm
1. PNG export for each new view too? (Match the strip/mosaic precedent — likely yes, reuse `saveFile` png path + a new `draw*Png` in `strip-export.ts`.)
2. Working palette only, or also the side-by-side compare slots? (PNG feature was working-only; `renderSlotViz` renders both — these views would naturally appear in both.)
3. Performance/size guard for large palettes (adjacency matrix is O(N²) cells).

## Branch / integration notes
- Branched off `feat/viz-png-export` to inherit the PNG infra above. **After PR #20 merges to master, rebase this branch onto master** (`git rebase master` once #20 lands) so history is clean and not stacked.
- PR #20 (the PNG export feature) is open: https://github.com/tito13kfm/pixel-pal-app/pull/20
- Project flow reminder: `npm test` (vitest), `npm run build` (tsc --noEmit + vite), web smoke via `npm run dev` (localhost:5173). `App.tsx` is `// @ts-nocheck`; new lib modules should be typed. See `CLAUDE.md` + `memory/` index.
