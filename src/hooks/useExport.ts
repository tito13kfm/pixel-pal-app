// Stateful wrapper around src/lib/export.ts's pure formatting functions.
//
// Extracted from App.tsx (SP2 phase c). Owns no state itself: reads/writes
// through the params passed in, which App.tsx sources from useExportSettings()
// plus a handful of ramp-core values (baseColors, rampsPunchy/Balanced/Muted,
// rampsActive, activeStyleFor, harmony, resolveBaseForRamp, labelsForRamp,
// filterHidden, buildRampsForSnapshot) and viz-settings values (matrixColorSet,
// matrixView, ditherPattern).
import type { MatrixView, DitherPattern } from '../lib/viz-interaction';
import {
  buildPaletteText as buildPaletteTextLib,
  collectPaletteEntries as collectPaletteEntriesLib,
  buildPaletteGpl as buildPaletteGplLib,
  filteredRamp,
  buildSingleRampText as buildSingleRampTextLib,
  buildSingleRampGpl as buildSingleRampGplLib,
  copyTextToClipboard,
  type HarmonySet,
} from '../lib/export';
import { saveFile } from '../lib/save-file';
import { buildJascPal, buildAse } from '../lib/palette-export';
import {
  computeVizData,
  drawLightnessStripPng,
  drawMosaicPng,
  drawAdjacencyMatrixPng,
  drawDitherBlendPng,
  drawPaletteStripPng,
} from '../lib/strip-export';

import type { RampStyle } from '../lib/style-presets';

interface UseExportParams {
  baseColors: string[];
  aiColorNames: string[];
  // rampsPunchy/Balanced/Muted are kept ONLY for buildPaletteText, the full
  // human-readable .txt dump that lists all three styles. Every style-selected
  // export reads rampsActive (each ramp at its own active style, #69).
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  rampsActive: string[][];
  activeStyleFor: (baseIndex: number) => RampStyle;
  harmony: HarmonySet;
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
  buildRampsForSnapshot: (snap: any) => string[][];
  rampSize: number;
  exportFormat: string;
  matrixColorSet: string;
  matrixView: string;
  ditherPattern: string;
  copiedHex: string | null;
  setCopiedHex: (v: string | null) => void;
  exportFeedback: string;
  setExportFeedback: (v: string) => void;
  lastSavedPath: string | null;
  setLastSavedPath: (v: string | null) => void;
  sessionRampGplFolder: string | null;
  setSessionRampGplFolder: (v: string | null) => void;
}

export function useExport(p: UseExportParams) {
  const buildPaletteText = () => buildPaletteTextLib(p);

  const copyHex = async (hex: string) => {
    const success = await copyTextToClipboard(hex);
    p.setCopiedHex(success ? hex : 'FAIL:' + hex);
    setTimeout(() => p.setCopiedHex(null), success ? 1000 : 1500);
  };

  const exportPalette = async () => {
    const text = buildPaletteText();
    return await saveFile({
      defaultName: 'pixel-pal-palette.txt',
      filters: [{ name: 'Pixel Pal palette', extensions: ['txt'] }],
      data: { text },
      folderKey: 'txt',
    });
  };

  // Shared save+feedback tail for the four viz PNG exporters below: save the
  // blob, then report canceled/failed/downloaded via the same feedback timing.
  const saveVizPng = async (defaultName: string, blob: Blob) => {
    const result = await saveFile({
      defaultName,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      data: { bytes: blob },
      folderKey: 'png',
    });
    if (result.canceled) p.setExportFeedback('Save canceled');
    else if (!result.ok) p.setExportFeedback('Failed to save PNG');
    else p.setExportFeedback('Downloaded!');
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  const exportLightnessPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap);
      const { sortedByL } = computeVizData(ramps);
      if (sortedByL.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawLightnessStripPng(sortedByL);
      await saveVizPng('pixel-pal-lightness.png', blob);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportMosaicPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r: any) => r.hexes);
      if (rows.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawMosaicPng(rows);
      await saveVizPng('pixel-pal-mosaic.png', blob);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportMatrixPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap);
      const { allColors } = computeVizData(ramps);
      const colors = p.matrixColorSet === 'bases'
        ? (Array.isArray(snap?.baseColors) ? snap.baseColors : [])
        : allColors;
      if (colors.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawAdjacencyMatrixPng(colors, { view: p.matrixView as MatrixView });
      await saveVizPng('pixel-pal-adjacency.png', blob);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportDitherPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r: any) => r.hexes);
      if (rows.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawDitherBlendPng(rows, { pattern: p.ditherPattern as DitherPattern });
      await saveVizPng('pixel-pal-dither.png', blob);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const copyPaletteToClipboard = async () => {
    const text = buildPaletteText();
    const success = await copyTextToClipboard(text);
    p.setExportFeedback(success ? 'Copied!' : 'Copy failed');
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  // Whole-palette exports now render each ramp at its own active style
  // (rampsActive). The style suffix on filenames / the .gpl palette name is a
  // single word only when every ramp shares one style; otherwise it's 'mixed'.
  const exportStyleTag = (): string => {
    if (p.baseColors.length === 0) return 'punchy';
    const first = p.activeStyleFor(0);
    return p.baseColors.every((_, i) => p.activeStyleFor(i) === first) ? first : 'mixed';
  };
  const gplPaletteName = (): string => {
    const tag = exportStyleTag();
    return `PIXEL.PAL ${tag.charAt(0).toUpperCase() + tag.slice(1)}`;
  };

  const collectPaletteEntries = () => collectPaletteEntriesLib({ ...p });

  const buildPaletteGpl = () => buildPaletteGplLib({ ...p, paletteName: gplPaletteName() });

  const exportPaletteGpl = async () => {
    const text = buildPaletteGpl();
    return await saveFile({
      defaultName: `pixel-pal-${exportStyleTag()}.gpl`,
      filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
      data: { text },
      folderKey: 'gpl',
    });
  };

  const exportPalettePal = async () => {
    const text = buildJascPal(collectPaletteEntries());
    return await saveFile({
      defaultName: `pixel-pal-${exportStyleTag()}.pal`,
      filters: [{ name: 'JASC palette', extensions: ['pal'] }],
      data: { text },
      folderKey: 'pal',
    });
  };

  const exportPaletteAse = async () => {
    const bytes = buildAse(collectPaletteEntries());
    return await saveFile({
      defaultName: `pixel-pal-${exportStyleTag()}.ase`,
      filters: [{ name: 'Adobe Swatch Exchange', extensions: ['ase'] }],
      data: { bytes },
      folderKey: 'ase',
    });
  };

  const exportPaletteStripPng = async () => {
    const rows = p.baseColors.map((_, i) => filteredRamp({ i, ...p }).hexes);
    const blob = await drawPaletteStripPng(rows, 32);
    return await saveFile({
      defaultName: `pixel-pal-${exportStyleTag()}-strip.png`,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
      data: { bytes: blob },
      folderKey: 'png',
    });
  };

  const exportActiveFormat = async () => {
    const runner =
      p.exportFormat === 'txt' ? exportPalette :
      p.exportFormat === 'pal' ? exportPalettePal :
      p.exportFormat === 'ase' ? exportPaletteAse :
      p.exportFormat === 'png-strip' ? exportPaletteStripPng :
      exportPaletteGpl;
    try {
      const result = await runner();
      if (result?.canceled) { p.setExportFeedback('Save canceled'); }
      else if (!result?.ok) { p.setExportFeedback('Export failed'); }
      else {
        p.setExportFeedback('Downloaded!');
        if (result.path) p.setLastSavedPath(result.path);
      }
    } catch {
      p.setExportFeedback('Export failed');
    }
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  const revealLastSaved = async () => {
    if (!p.lastSavedPath) return;
    try {
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(p.lastSavedPath);
    } catch {
      p.setExportFeedback("Couldn't open folder");
      setTimeout(() => p.setExportFeedback(''), 2000);
    }
  };

  // Per-ramp Copy/Download honor that ramp's own active style (#69).
  const buildSingleRampText = (i: number) =>
    buildSingleRampTextLib(filteredRamp({ i, ...p }));

  const buildSingleRampGpl = (i: number) =>
    buildSingleRampGplLib({ filtered: filteredRamp({ i, ...p }), i, style: p.activeStyleFor(i), aiColorNames: p.aiColorNames });

  const copyRampToClipboard = async (i: number) => {
    const text = buildSingleRampText(i);
    const count = text.trim().split('\n').length;
    const success = await copyTextToClipboard(text);
    p.setExportFeedback(success ? `Copied ${count} shade${count === 1 ? '' : 's'}` : 'Copy failed');
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  const downloadSingleRampGpl = async (i: number) => {
    try {
      const text = buildSingleRampGpl(i);
      const defaultName = `pixel-pal-ramp-${i + 1}-${p.activeStyleFor(i)}.gpl`;
      const result = await saveFile({
        defaultName,
        filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
        data: { text },
        folderKey: 'gpl',
        silentToFolder: p.sessionRampGplFolder,
      });
      if (result.canceled) {
        p.setExportFeedback('Save canceled');
      } else if (!result.ok) {
        if (p.sessionRampGplFolder) {
          p.setSessionRampGplFolder(null);
          p.setExportFeedback('Folder unavailable, pick a new one');
        } else {
          p.setExportFeedback('Ramp GPL export failed');
        }
      } else {
        if (result.folder && result.folder !== p.sessionRampGplFolder) {
          p.setSessionRampGplFolder(result.folder);
        }
        if (p.sessionRampGplFolder && result.folder) {
          p.setExportFeedback(`Saved ramp ${i + 1}.gpl to ${result.folder}`);
        } else {
          p.setExportFeedback(`Downloaded ramp ${i + 1}.gpl`);
        }
      }
      setTimeout(() => p.setExportFeedback(''), 2500);
    } catch {
      p.setExportFeedback('Ramp GPL export failed');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  return {
    copyHex, buildPaletteText, exportPalette, exportLightnessPng, exportMosaicPng,
    exportMatrixPng, exportDitherPng, copyPaletteToClipboard, collectPaletteEntries,
    buildPaletteGpl, exportPaletteGpl, exportPalettePal, exportPaletteAse,
    exportPaletteStripPng, exportActiveFormat, revealLastSaved, buildSingleRampText,
    buildSingleRampGpl, copyRampToClipboard, downloadSingleRampGpl,
  };
}
