// Stateful wrapper around src/lib/export.ts's pure formatting functions.
//
// Extracted from App.tsx (SP2 phase c). Owns no state itself: reads/writes
// through the params passed in, which App.tsx sources from useExportSettings()
// plus a handful of ramp-core values (baseColors, rampsPunchy/Balanced/Muted,
// harmony, resolveBaseForRamp, labelsForRamp, filterHidden, buildRampsForSnapshot)
// and viz-settings values (vizStyle, matrixColorSet, matrixView, ditherPattern).
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

type RampStyle = 'punchy' | 'balanced' | 'muted';

interface UseExportParams {
  baseColors: string[];
  aiColorNames: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  harmony: HarmonySet;
  resolveBaseForRamp: (hex: string, baseIndex: number) => string;
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => { hexes: string[]; labels: string[] };
  buildRampsForSnapshot: (snap: any, style: string) => string[][];
  rampSize: number;
  vizStyle: string;
  gplStyle: string;
  rampExportStyle: RampStyle;
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

  const exportLightnessPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
      const { sortedByL } = computeVizData(ramps);
      if (sortedByL.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawLightnessStripPng(sortedByL);
      const result = await saveFile({
        defaultName: 'pixel-pal-lightness.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportMosaicPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r: any) => r.hexes);
      if (rows.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawMosaicPng(rows);
      const result = await saveFile({
        defaultName: 'pixel-pal-mosaic.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportMatrixPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
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
      const result = await saveFile({
        defaultName: 'pixel-pal-adjacency.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
    } catch {
      p.setExportFeedback('Failed to export PNG');
      setTimeout(() => p.setExportFeedback(''), 3000);
    }
  };

  const exportDitherPng = async (snap: any) => {
    try {
      const ramps = p.buildRampsForSnapshot(snap, p.vizStyle);
      const { mosaicRamps } = computeVizData(ramps);
      const rows = mosaicRamps.map((r: any) => r.hexes);
      if (rows.length === 0) {
        p.setExportFeedback('Nothing to export');
        setTimeout(() => p.setExportFeedback(''), 2000);
        return;
      }
      const blob = await drawDitherBlendPng(rows, { pattern: p.ditherPattern as DitherPattern });
      const result = await saveFile({
        defaultName: 'pixel-pal-dither.png',
        filters: [{ name: 'PNG image', extensions: ['png'] }],
        data: { bytes: blob },
        folderKey: 'png',
      });
      if (result.canceled) p.setExportFeedback('Save canceled');
      else if (!result.ok) p.setExportFeedback('Failed to save PNG');
      else p.setExportFeedback('Downloaded!');
      setTimeout(() => p.setExportFeedback(''), 2000);
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

  const collectPaletteEntries = (style: RampStyle) => collectPaletteEntriesLib({ style, ...p });

  const buildPaletteGpl = (style: RampStyle) => buildPaletteGplLib({ style, ...p });

  const exportPaletteGpl = async () => {
    const text = buildPaletteGpl(p.gplStyle as RampStyle);
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}.gpl`,
      filters: [{ name: 'GIMP palette', extensions: ['gpl'] }],
      data: { text },
      folderKey: 'gpl',
    });
  };

  const exportPalettePal = async () => {
    const text = buildJascPal(collectPaletteEntries(p.gplStyle as RampStyle));
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}.pal`,
      filters: [{ name: 'JASC palette', extensions: ['pal'] }],
      data: { text },
      folderKey: 'pal',
    });
  };

  const exportPaletteAse = async () => {
    const bytes = buildAse(collectPaletteEntries(p.gplStyle as RampStyle));
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}.ase`,
      filters: [{ name: 'Adobe Swatch Exchange', extensions: ['ase'] }],
      data: { bytes },
      folderKey: 'ase',
    });
  };

  const exportPaletteStripPng = async () => {
    const rows = p.baseColors.map((_, i) => filteredRamp({ i, style: p.gplStyle as RampStyle, ...p }).hexes);
    const blob = await drawPaletteStripPng(rows, 32);
    return await saveFile({
      defaultName: `pixel-pal-${p.gplStyle}-strip.png`,
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

  const buildSingleRampText = (i: number, style: RampStyle) =>
    buildSingleRampTextLib(filteredRamp({ i, style, ...p }));

  const buildSingleRampGpl = (i: number, style: RampStyle) =>
    buildSingleRampGplLib({ filtered: filteredRamp({ i, style, ...p }), i, style, aiColorNames: p.aiColorNames });

  const copyRampToClipboard = async (i: number) => {
    const text = buildSingleRampText(i, p.rampExportStyle);
    const count = text.trim().split('\n').length;
    const success = await copyTextToClipboard(text);
    p.setExportFeedback(success ? `Copied ${count} shade${count === 1 ? '' : 's'}` : 'Copy failed');
    setTimeout(() => p.setExportFeedback(''), 2000);
  };

  const downloadSingleRampGpl = async (i: number) => {
    try {
      const text = buildSingleRampGpl(i, p.rampExportStyle);
      const defaultName = `pixel-pal-ramp-${i + 1}-${p.rampExportStyle}.gpl`;
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
