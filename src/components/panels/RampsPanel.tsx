import React, { useState } from 'react';
import {
  Sun, ChevronUp, ChevronDown, RotateCcw, Lock, Unlock, Shuffle,
  CopyPlus, Copy, Download, Sparkles, Sliders, Plus, Pin, Trash2, Cpu,
  AlertTriangle, Columns,
} from 'lucide-react';
import { useTheme } from '../../contexts';
import { RampAdvancedPanel } from '../RampAdvancedPanel';
import ShadeCountControl from '../ShadeCountControl';
import { hexToRgb } from '../../lib/color';
import { gamutMap, oklchToOklab, oklabToLinearRgb, isInGamut } from '../../lib/oklch';
import { wcagContrast, wcagAaTier } from '../../lib/wcag';
import { LIGHTNESS_PRESETS, SAT_PRESETS } from '../../lib/curve';
import type { CurvePoints } from '../../lib/curve';
import { DEFAULT_STYLE_PRESETS, resolveRampScalars } from '../../lib/style-presets';
import type { StylePresets, RampStyle, StyleScalars } from '../../lib/style-presets';
import type { GamutStrategySerialized } from '../../lib/palette';
import { DEFAULT_SPRITE_LIBRARY } from '../../lib/constants';
import type { HardwarePalette } from '../../lib/hardware-quantize';

type SpriteLibrary = Record<string, { pattern: string[]; numShades?: number }>;

// Per-style accent color + short label, used by the per-ramp picker, the
// active-only preview box, and the pin editor's 'custom' branch.
const STYLE_ACCENT: Record<RampStyle, string> = {
  punchy: '#ff00ff',
  balanced: '#00ffff',
  muted: '#a855f7',
  custom: '#facc15',
};
const STYLE_BORDER: Record<RampStyle, string> = {
  punchy: 'border-pink-500/50',
  balanced: 'border-cyan-500/50',
  muted: 'border-purple-400/60',
  custom: 'border-yellow-400/60',
};
const STYLE_LABEL: Record<RampStyle, string> = {
  punchy: 'Punchy',
  balanced: 'Balanced',
  muted: 'Muted',
  custom: 'Custom',
};
// Swatch border color per style (Tailwind class, matches the show-all-3 view).
const STYLE_SWATCH_BORDER: Record<RampStyle, string> = {
  punchy: 'border-pink-400',
  balanced: 'border-cyan-400',
  muted: 'border-purple-400',
  custom: 'border-yellow-400',
};

interface FilteredRamp {
  hexes: string[];
  labels: string[];
  originalIndices: number[];
}

interface PinEditor {
  baseIndex: number;
  shadeIndex: number;
  style: string;
}

interface CompareAnchor {
  baseIndex: number;
  shadeIndex: number;
  style: string;
  hex: string;
}

export interface RampsPanelProps {
  // theme string for class conditions
  theme: string;
  // palette data
  baseColors: string[];
  aiColorNames: string[];
  rampsPunchy: string[][];
  rampsBalanced: string[][];
  rampsMuted: string[][];
  // per-ramp active-style render array + resolver (#69)
  rampsActive: string[][];
  activeStyleFor: (i: number) => RampStyle;
  rampStyleOverrides: Record<number, RampStyle>;
  setRampStyleOverride: (i: number, style: RampStyle) => void;
  setRampStyleOverrides: React.Dispatch<React.SetStateAction<Record<number, RampStyle>>>;
  rampStyleScalars: Record<number, StyleScalars>;
  setRampScalar: (i: number, key: keyof StyleScalars, value: number) => void;
  paletteDefaultStyle: RampStyle;
  setPaletteDefaultStyle: React.Dispatch<React.SetStateAction<RampStyle>>;
  // style presets
  stylePresets: StylePresets;
  setStylePresets: React.Dispatch<React.SetStateAction<StylePresets>>;
  // hardware lock
  activeHardware: HardwarePalette | null;
  // ramp collapse/expand
  collapsedRamps: Set<number>;
  anyRampExpanded: boolean;
  // ramp lock
  lockedRamps: Set<number>;
  // hidden shades
  hiddenShades: Record<number, number[]>;
  // ramp size overrides
  rampSizeOverrides: Record<number, number>;
  setRampSizeOverrides: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  rampSize: number;
  // ramp saturation overrides
  rampSatOverrides: Record<number, number>;
  setRampSatOverrides: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  // base editor
  editingIndex: number | null;
  editorHsv: { h: number; s: number; v: number };
  editorOklch: { L: number; C: number; H: number };
  editorMode: 'hsv' | 'oklch';
  // pin editor
  pinEditor: PinEditor | null;
  setPinEditor: (e: PinEditor | null) => void;
  // per-ramp advanced
  advancedOpen: Record<string, boolean>;
  setAdvancedOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  lightnessCurvePerRamp: Record<string, CurvePoints>;
  setLightnessCurvePerRamp: React.Dispatch<React.SetStateAction<Record<string, CurvePoints>>>;
  satCurvePerRamp: Record<string, CurvePoints>;
  setSatCurvePerRamp: React.Dispatch<React.SetStateAction<Record<string, CurvePoints>>>;
  gamutPerRamp: Record<string, GamutStrategySerialized>;
  setGamutPerRamp: React.Dispatch<React.SetStateAction<Record<string, GamutStrategySerialized>>>;
  hueShiftStrengthPerRamp: Record<number, number>;
  setHueShiftStrengthPerRamp: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  // sprite
  spriteLibrary: SpriteLibrary;
  spriteKey: string;
  // compare / copy
  copiedHex: string | null;
  compareAnchor: CompareAnchor | null;
  compareMode: boolean;
  // misc
  highlightedRamp: number | null;
  confirmReset: boolean;
  // drag
  makeRampDragHandlers: (i: number) => Record<string, unknown>;
  rampDropLine: (i: number) => string | null;
  rampGrip: (i: number) => React.ReactNode;
  // closures over App state
  labelsForRamp: (ramp: string[], baseHex: string) => string[];
  filterHidden: (ramp: string[], labels: string[], baseIndex: number) => FilteredRamp;
  resolveBaseForRamp: (hex: string, i: number) => string;
  resolveSizeForRamp: (i: number) => number;
  resolveHueShiftForRamp: (i: number) => number;
  isShadePinned: (i: number, j: number, style: string) => boolean;
  // callbacks
  toggleAllRampsCollapse: () => void;
  resetToDefaults: () => void;
  resetStylePresets: () => void;
  toggleRampLock: (i: number) => void;
  shuffleRamp: (i: number) => void;
  duplicateRamp: (i: number) => void;
  copyRampToClipboard: (i: number) => void;
  downloadSingleRampGpl: (i: number) => void;
  resetHiddenShades: (i: number) => void;
  removeRamp: (i: number) => void;
  toggleBaseEditor: (i: number) => void;
  updateEditorHex: (hex: string) => void;
  updateEditorHsv: (hsv: { h: number; s: number; v: number }) => void;
  updateEditorOklch: (oklch: { L: number; C: number; H: number }) => void;
  updateEditorMode: (mode: 'hsv' | 'oklch') => void;
  setEditingIndex: (i: number | null) => void;
  toggleRampCollapse: (i: number) => void;
  hideShade: (i: number, j: number, rampLen: number) => void;
  setOverride: (i: number, j: number, style: string, hex: string) => void;
  clearOverride: (i: number, j: number, style: string) => void;
  pickCompareSwatch: (i: number, j: number, style: string, hex: string) => void;
  copyHex: (hex: string) => void;
  tagNextLabel: (label: string) => void;
  togglePinEditor: (i: number, j: number, style: string, hex: string) => void;
  setBaseColors: React.Dispatch<React.SetStateAction<string[]>>;
}

// PixelSprite: self-contained SVG pixel art renderer
export function PixelSprite({ palette, scale = 6, spriteKey = 'vase', spriteLibrary }: {
  palette: string[];
  scale?: number;
  spriteKey?: string;
  spriteLibrary?: SpriteLibrary;
}) {
  const lib = spriteLibrary || DEFAULT_SPRITE_LIBRARY;
  const sprite = (lib as SpriteLibrary)[spriteKey] || (lib as SpriteLibrary).vase || (DEFAULT_SPRITE_LIBRARY as SpriteLibrary).vase;
  if (!sprite) return null;
  const pattern = sprite.pattern;
  if (!pattern || pattern.length === 0) return null;
  const size = pattern[0].length;
  const spriteShades = sprite.numShades || 5;

  const mapIndex = (idx: number) => {
    if (spriteShades <= 1) return Math.floor(palette.length / 2);
    if (palette.length === 1) return 0;
    const ratio = idx / (spriteShades - 1);
    return Math.max(0, Math.min(palette.length - 1, Math.round(ratio * (palette.length - 1))));
  };

  const parseChar = (ch: string) => {
    if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
    if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 87;
    return 0;
  };

  return (
    <svg width={size * scale} height={pattern.length * scale} style={{ imageRendering: 'pixelated', display: 'block' }}>
      {pattern.map((row, y) =>
        (row as string).split('').map((ch, x) => {
          if (ch === '.') return null;
          const colorIdx = mapIndex(parseChar(ch));
          return <rect key={`${x}-${y}`} x={x * scale} y={y * scale} width={scale} height={scale} fill={palette[colorIdx]} />;
        })
      )}
    </svg>
  );
}

export function RampsPanel(props: RampsPanelProps) {
  const {
    theme,
    baseColors, aiColorNames, rampsPunchy, rampsBalanced, rampsMuted,
    rampsActive, activeStyleFor, rampStyleOverrides, setRampStyleOverride, setRampStyleOverrides,
    rampStyleScalars, setRampScalar,
    paletteDefaultStyle, setPaletteDefaultStyle,
    stylePresets, setStylePresets, activeHardware,
    collapsedRamps, anyRampExpanded, lockedRamps,
    hiddenShades, rampSizeOverrides, setRampSizeOverrides, rampSize,
    rampSatOverrides, setRampSatOverrides,
    editingIndex, editorHsv, editorOklch, editorMode, pinEditor, setPinEditor,
    advancedOpen, setAdvancedOpen, lightnessCurvePerRamp, setLightnessCurvePerRamp,
    satCurvePerRamp, setSatCurvePerRamp, gamutPerRamp, setGamutPerRamp,
    hueShiftStrengthPerRamp, setHueShiftStrengthPerRamp,
    spriteLibrary, spriteKey,
    copiedHex, compareAnchor, compareMode,
    highlightedRamp, confirmReset,
    makeRampDragHandlers, rampDropLine, rampGrip,
    labelsForRamp, filterHidden, resolveBaseForRamp,
    resolveSizeForRamp, resolveHueShiftForRamp, isShadePinned,
    toggleAllRampsCollapse, resetToDefaults, resetStylePresets,
    toggleRampLock, shuffleRamp, duplicateRamp,
    copyRampToClipboard, downloadSingleRampGpl, resetHiddenShades, removeRamp,
    toggleBaseEditor, updateEditorHex, updateEditorHsv, updateEditorOklch, updateEditorMode, setEditingIndex,
    toggleRampCollapse, hideShade, setOverride, clearOverride,
    pickCompareSwatch, copyHex, tagNextLabel, togglePinEditor, setBaseColors,
  } = props;

  const { t, themedAccent, accentTextGlow: _accentTextGlow } = useTheme();
  const accentTextGlow = _accentTextGlow as (hex: string, px?: number) => string;

  // Card-only comparison toggle (#69): default off shows one strip per ramp
  // at its active style; on restores the old stacked Punchy/Balanced/Muted
  // view. Not persisted - a plain useState, sticky across re-renders only.
  const [showAllStyles, setShowAllStyles] = useState(false);

  // #146: the OKLCH Chroma slider shows the raw dragged value, which can sit
  // outside sRGB gamut while the committed base color is silently clamped
  // (updateEditorOklch gamut-maps before writing hex; editorOklch itself
  // deliberately does not, so the drag stays continuous, see that hook).
  // This only surfaces the divergence visually; it doesn't change it.
  const oklchOutOfGamut = editorMode === 'oklch' && editingIndex !== null &&
    !isInGamut(oklabToLinearRgb(oklchToOklab(editorOklch)));
  const oklchClamped = oklchOutOfGamut ? gamutMap(editorOklch, 'auto') : null;

  // Internal Swatch component closes over RampsPanel props for copy/compare/pin
  const Swatch = ({
    hex, label, large = false,
    borderClass = 'border-cyan-400',
    shadowRgba = 'rgba(0, 255, 255, 0.3)',
    baseIndex = null,
    shadeIndex = null,
    style = null,
    onContextMenu = null,
    extraTooltip = null,
  }: {
    hex: string;
    label: string;
    large?: boolean;
    borderClass?: string;
    shadowRgba?: string;
    baseIndex?: number | null;
    shadeIndex?: number | null;
    style?: string | null;
    onContextMenu?: (() => void) | null;
    extraTooltip?: string | null;
  }) => {
    const isCopied = copiedHex === hex;
    const isFailed = copiedHex === 'FAIL:' + hex;
    const pinnable = baseIndex !== null && shadeIndex !== null && style !== null;
    const pinned = pinnable && isShadePinned(baseIndex!, shadeIndex!, style!);
    const pinEditorOpenHere = pinnable && pinEditor && pinEditor.baseIndex === baseIndex && pinEditor.shadeIndex === shadeIndex && pinEditor.style === style;
    const isAnchor = pinnable && compareAnchor
      && compareAnchor.baseIndex === baseIndex
      && compareAnchor.shadeIndex === shadeIndex
      && compareAnchor.style === style;
    const compareActive = compareMode && pinnable;
    const hintParts: string[] = [];
    if (compareActive) {
      if (!compareAnchor) hintParts.push(`Click to set ${hex} as anchor`);
      else if (isAnchor) hintParts.push(`Anchor (${hex}). Click again to unlock.`);
      else hintParts.push(`Compare ${hex} vs anchor (${compareAnchor.hex})`);
    } else {
      hintParts.push(`Click to copy ${hex}`);
      if (onContextMenu) hintParts.push('Right-click to hide this shade across all 3 styles');
    }
    if (extraTooltip) hintParts.push(extraTooltip);
    const hoverHint = hintParts.join(' | ');
    const handleClick = () => {
      if (compareActive) {
        pickCompareSwatch(baseIndex!, shadeIndex!, style!, hex);
      } else {
        copyHex(hex);
      }
    };
    return (
      <div className="flex flex-col items-center gap-1 w-full min-w-0">
        <div className="relative group">
          <button
            onClick={handleClick}
            onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu!(); } : undefined}
            className={`relative ${large ? 'w-16 h-16' : 'w-12 h-12'} rounded border-2 ${borderClass} hover:scale-110 transition-transform cursor-pointer flex-shrink-0 ${isAnchor ? 'ring-4 ring-yellow-300' : ''}`}
            style={{ backgroundColor: hex, boxShadow: isAnchor ? '0 0 14px #ffff00' : `0 0 8px ${shadowRgba}` }}
            title={hoverHint}
          >
            {isCopied && <div className="absolute inset-0 flex items-center justify-center bg-black/70 rounded text-cyan-200 text-[10px] font-bold">Copied!</div>}
            {isFailed && <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 rounded text-red-100 text-[10px] font-bold leading-tight text-center px-1">Copy<br/>failed</div>}
          </button>
          {pinnable && label !== 'base' && !baseColors.includes(hex) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                tagNextLabel('Add base from shade');
                setBaseColors(prev => [...prev, hex]);
              }}
              title={`Add ${hex.toUpperCase()} as a new base color`}
              className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full border flex items-center justify-center transition-all hover:scale-110 bg-cyan-300 text-purple-900 border-cyan-100 opacity-0 group-hover:opacity-100"
              style={{ boxShadow: '0 0 6px rgba(0, 255, 255, 0.7)' }}
            >
              <Plus size={12} strokeWidth={3} />
            </button>
          )}
          {pinnable && (label !== 'base' || pinned) && (
            <button
              onClick={(e) => { e.stopPropagation(); togglePinEditor(baseIndex!, shadeIndex!, style!, hex); }}
              title={pinned ? `Unpin this ${style} shade` : `Pin this ${style} shade`}
              className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border flex items-center justify-center transition-all hover:scale-110 ${pinned ? 'bg-yellow-300 text-purple-900 border-yellow-100' : `bg-purple-900/80 text-cyan-200 border-cyan-500/60 ${pinEditorOpenHere ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} ${pinEditorOpenHere ? 'ring-2 ring-yellow-200' : ''}`}
              style={pinned ? { boxShadow: '0 0 6px rgba(255, 255, 0, 0.7)' } : {}}
            >
              <Pin size={10} strokeWidth={pinned ? 3 : 2} />
            </button>
          )}
        </div>
        <span className="text-xs font-mono truncate w-full text-center" style={{ color: t.swatchHex }}>{hex.toUpperCase()}</span>
        {label && <span className="text-[10px] w-full text-center leading-tight break-words" style={{ color: t.swatchLabel }}>{label}</span>}
      </div>
    );
  };

  return (
    <div className="px-6 pb-6">
      <div className="flex items-center gap-2 flex-wrap justify-end mb-4">
        {baseColors.length > 1 && (
          <button onClick={toggleAllRampsCollapse} title={anyRampExpanded ? 'Collapse every ramp card to its icon previews' : 'Expand every ramp card to show all swatches'} className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${t.controlBtnDefault} ${t.controlBtnHover}`}>
            {anyRampExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {anyRampExpanded ? 'Collapse All' : 'Expand All'}
          </button>
        )}
        <button onClick={resetToDefaults} title={confirmReset ? 'Click again to confirm. Wipes pins, hidden shades, ramp locks, per-ramp sizes and saturations, hue shift strength, side-by-side slots, harmony anchor, and the AI prompt. Picks a new random base color. Preserves shade count, hardware lock, and theme.' : 'Reset all per-palette customizations and start from a new random base color. Asks for confirmation.'} className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${confirmReset ? 'bg-red-300 text-red-900 border-red-100 animate-pulse' : 'bg-pink-500 text-white border-pink-200 hover:bg-pink-400'}`}>
          <RotateCcw size={14} />
          {confirmReset ? 'Confirm?' : 'Reset to Defaults'}
        </button>
      </div>
      <div className="mb-4 p-3 rounded border-2 border-cyan-700/40 bg-black/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Style Tuning</span>
          {JSON.stringify(stylePresets) !== JSON.stringify(DEFAULT_STYLE_PRESETS) && (
            <button
              onClick={resetStylePresets}
              title="Restore Punchy/Balanced/Muted to their default reach and chroma falloff"
              className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${t.controlBtnDefault} ${t.controlBtnHover}`}
            >
              <RotateCcw size={14} /> Reset Styles
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['punchy', 'balanced', 'muted'] as const).map((sk) => (
            <div key={sk} className="p-2 rounded bg-purple-900/30 border border-purple-700/40">
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-100 mb-1">{sk}</div>
              <label className="block text-[10px] text-cyan-300 uppercase tracking-wider">Reach: {Math.round(stylePresets[sk].reach * 100)}%</label>
              <input
                type="range" min={0} max={100} value={Math.round(stylePresets[sk].reach * 100)}
                onChange={(e) => setStylePresets(prev => ({ ...prev, [sk]: { ...prev[sk], reach: Number(e.target.value) / 100 } }))}
                className="w-full"
              />
              <label className="block text-[10px] text-cyan-300 uppercase tracking-wider mt-1">Chroma falloff: {Math.round(stylePresets[sk].chromaFalloff * 100)}%</label>
              <input
                type="range" min={0} max={100} value={Math.round(stylePresets[sk].chromaFalloff * 100)}
                onChange={(e) => setStylePresets(prev => ({ ...prev, [sk]: { ...prev[sk], chromaFalloff: Number(e.target.value) / 100 } }))}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mb-4 p-3 rounded border-2 border-cyan-700/40 bg-black/60 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">Default Style</span>
        <div className="flex items-center rounded border-2 border-cyan-700/50 overflow-hidden text-[11px] font-bold uppercase tracking-wider">
          {(['punchy', 'balanced', 'muted'] as const).map((sk) => (
            <button
              key={sk}
              onClick={() => setPaletteDefaultStyle(sk)}
              title={`Set the palette default style to ${STYLE_LABEL[sk]}. Ramps without their own override use this.`}
              className={`px-3 py-1.5 transition-all ${paletteDefaultStyle === sk ? 'bg-cyan-400 text-purple-900' : 'bg-black/60 text-cyan-200 hover:bg-black/40'}`}
            >
              {STYLE_LABEL[sk]}
            </button>
          ))}
        </div>
        <button
          onClick={() => { tagNextLabel('Set all ramp styles'); setRampStyleOverrides({}); }}
          title="Clear every ramp's individual style override so all ramps fall back to the palette default style"
          className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${t.controlBtnDefault} ${t.controlBtnHover}`}
        >
          Set All Ramps → Default
        </button>
        <button
          onClick={() => setShowAllStyles(v => !v)}
          title={showAllStyles ? 'Show only each ramp\'s active style' : 'Show Punchy/Balanced/Muted stacked for every ramp, for comparison'}
          className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-1 ${showAllStyles ? 'bg-yellow-300 text-purple-900 border-yellow-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}
        >
          <Columns size={14} />
          {showAllStyles ? 'Comparing All 3' : 'Compare All 3 Styles'}
        </button>
      </div>
      {activeHardware && (
        <div className={`mb-4 p-2 rounded border-2 flex items-center gap-2 text-xs ${t.alertWarnBg} ${t.alertWarnBorder}`} style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.4)' }}>
          <Cpu size={14} className={`${t.alertWarnText} flex-shrink-0`} />
          <span className={t.alertWarnText}>
            <strong className={`${t.alertWarnText} uppercase tracking-wider`}>Locked to {(activeHardware as any).name}.</strong>
            {' '}Every generated shade snaps to one of the {activeHardware.colors.length} hardware-legal {activeHardware.colors.length === 1 ? 'color' : 'colors'}. Ramps with more requested shades than the palette supports will visually collapse to unique entries.
          </span>
        </div>
      )}
      {baseColors.map((_, i) => {
        const punchy = rampsPunchy[i];
        const balanced = rampsBalanced[i];
        const muted = rampsMuted[i];
        const effectiveBase = resolveBaseForRamp(baseColors[i], i);
        const labelsP = labelsForRamp(punchy, effectiveBase);
        const labelsB = labelsForRamp(balanced, effectiveBase);
        const labelsM = labelsForRamp(muted, effectiveBase);
        const labels = labelsP;
        const fPunchyTop = filterHidden(punchy, labelsP, i);
        const fBalancedTop = filterHidden(balanced, labelsB, i);
        const fMutedTop = filterHidden(muted, labelsM, i);
        const bgFromHex = (hex: string, alpha: number) => {
          const { r, g, b } = hexToRgb(hex);
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };
        const punchyBg = bgFromHex(fPunchyTop.hexes[fPunchyTop.hexes.length - 1] || punchy[punchy.length - 1], 0.7);
        const balancedBg = bgFromHex(fBalancedTop.hexes[fBalancedTop.hexes.length - 1] || balanced[balanced.length - 1], 0.7);
        const mutedBg = bgFromHex(fMutedTop.hexes[fMutedTop.hexes.length - 1] || muted[muted.length - 1], 0.7);
        const activeStyle = activeStyleFor(i);
        const active = rampsActive[i];
        const labelsActive = labelsForRamp(active, effectiveBase);
        const fActiveTop = filterHidden(active, labelsActive, i);
        const activeBg = bgFromHex(fActiveTop.hexes[fActiveTop.hexes.length - 1] || active[active.length - 1], 0.7);
        const baseHex = baseColors[i];
        const lumChannel = (c: number) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        };
        const relLum = ({ r, g, b }: { r: number; g: number; b: number }) => 0.2126 * lumChannel(r) + 0.7152 * lumChannel(g) + 0.0722 * lumChannel(b);
        const baseRgb = hexToRgb(baseHex);
        const cardBgLum = relLum({ r: 30, g: 5, b: 56 });
        const baseLum = relLum(baseRgb);
        const contrastRatio = (Math.max(baseLum, cardBgLum) + 0.05) / (Math.min(baseLum, cardBgLum) + 0.05);
        const useFallback = contrastRatio < 2.0;
        const borderHex = useFallback ? '#a8e0ff' : baseHex;
        const baseBorder = bgFromHex(borderHex, 0.85);
        const baseGlow = bgFromHex(borderHex, 0.45);
        const isLocked = lockedRamps.has(i);
        const cardBorder = isLocked ? 'rgba(255, 220, 0, 0.85)' : baseBorder;
        const cardGlow = isLocked ? 'rgba(255, 220, 0, 0.5)' : baseGlow;
        return (
          <div key={i} {...(makeRampDragHandlers(i) as any)} data-ramp-index={i} className="mb-4 last:mb-0 relative rounded-lg p-4" style={{ border: `2px solid ${cardBorder}`, boxShadow: [`0 0 14px ${cardGlow}`, rampDropLine(i), highlightedRamp === i ? '0 0 0 3px #ff2ec4, 0 0 22px rgba(255,46,196,0.6)' : null].filter(Boolean).join(', ') }}>
            <div className="absolute top-1/2 right-0 -translate-y-1/2 z-10">{rampGrip(i)}</div>
            <div className="absolute -top-2 right-2 flex gap-1 z-10">
              <button onClick={() => toggleBaseEditor(i)} data-tour-id={i === 0 ? 'ramp-edit-btn' : undefined} title={editingIndex === i ? 'Close editor' : 'Edit base color'} className={`w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center ${editingIndex === i ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-cyan-500 text-white border-cyan-200 hover:bg-cyan-400'}`} style={editingIndex === i ? { boxShadow: '0 0 10px #ffff00' } : { boxShadow: '0 0 8px rgba(0, 200, 255, 0.6)' }}>
                <Sliders size={14} />
              </button>
              {!isLocked && (
                <button onClick={() => shuffleRamp(i)} title="Reshuffle this ramp's jitter (does not affect other ramps)" className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-purple-600 text-cyan-100 border-cyan-400 hover:bg-purple-500" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }}>
                  <Shuffle size={12} />
                </button>
              )}
              <button
                onClick={() => toggleRampLock(i)}
                data-tour-id={i === 0 ? 'ramp-lock-btn' : undefined}
                title={isLocked
                  ? 'Unlock this ramp. Once unlocked, it will be affected by Generate, Shuffle, and Harmonize again.'
                  : 'Lock this ramp. The Generate/Shuffle buttons will skip it, and Harmonize will use it as a fixed reference. Pins and hidden shades are unaffected (they were per-ramp anyway).'}
                className={`w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center ${isLocked ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-600 text-cyan-100 border-cyan-400 hover:bg-purple-500'}`}
                style={isLocked ? { boxShadow: '0 0 10px rgba(255, 220, 0, 0.8)' } : { boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }}
              >
                {isLocked ? <Lock size={12} /> : <Unlock size={12} />}
              </button>
              <button
                onClick={() => duplicateRamp(i)}
                title="Duplicate this ramp at the end of the palette. Carries over pins, shade count, saturation multiplier, hidden shades, and shuffle offset. Does not carry over lock state. The duplicate is identical to the source."
                className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-purple-600 text-cyan-100 border-cyan-400 hover:bg-purple-500"
                style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }}
              >
                <CopyPlus size={12} />
              </button>
              <button
                onClick={() => copyRampToClipboard(i)}
                title={`Copy this ramp's hex values to clipboard at this ramp's active style. Hidden shades excluded.`}
                className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-cyan-500 text-white border-cyan-200 hover:bg-cyan-400"
                style={{ boxShadow: '0 0 8px rgba(0, 200, 255, 0.6)' }}
              >
                <Copy size={12} />
              </button>
              <button
                onClick={() => downloadSingleRampGpl(i)}
                title={`Download this ramp as a single-ramp .gpl file at this ramp's active style. Hidden shades excluded.`}
                className="w-7 h-7 rounded-full border-2 hover:scale-110 transition-all flex items-center justify-center bg-yellow-400 text-purple-900 border-yellow-200 hover:bg-yellow-300"
                style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }}
              >
                <Download size={12} />
              </button>
              {Array.isArray(hiddenShades[i]) && hiddenShades[i].length > 0 && (
                <button onClick={() => resetHiddenShades(i)} title={`Restore ${hiddenShades[i].length} hidden shade${hiddenShades[i].length === 1 ? '' : 's'}`} className="h-7 px-2 bg-yellow-400 text-purple-900 rounded-full border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-110 transition-all flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider" style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.6)' }}>
                  <Sparkles size={12} />Restore {hiddenShades[i].length}
                </button>
              )}
              {baseColors.length > 1 && (
                <button onClick={() => removeRamp(i)} title="Remove this ramp" className="w-7 h-7 bg-pink-500 text-white rounded-full border-2 border-pink-200 hover:bg-pink-400 hover:scale-110 transition-all flex items-center justify-center text-base font-bold" style={{ boxShadow: '0 0 8px rgba(255, 0, 110, 0.6)' }}>×</button>
              )}
            </div>

            {editingIndex === i && (
              <div className="mb-4 p-3 rounded border-2 border-yellow-500/60 bg-black/60" style={{ boxShadow: '0 0 12px rgba(255, 255, 0, 0.25)' }}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-xs font-bold text-yellow-200 uppercase tracking-wider">▸ Adjust Base</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={baseColors[i]} onChange={(e) => updateEditorHex(e.target.value)} title="Pick a new base color from the OS color picker" className="w-10 h-10 rounded border-2 border-yellow-400 cursor-pointer" style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.5)' }} />
                    <input type="text" value={baseColors[i]} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) updateEditorHex(v); }} title="Type a hex color (e.g. #ff6b35)" className="px-2 py-1 rounded bg-black/60 text-yellow-100 font-mono text-sm border-2 border-yellow-400 w-24 focus:outline-none" />
                  </div>
                  <div className="flex items-center rounded border-2 border-yellow-700/50 overflow-hidden text-[10px] font-bold uppercase tracking-wider">
                    <button onClick={() => updateEditorMode('hsv')} title="Edit with HSV sliders" className={`px-2 py-1 transition-all ${editorMode === 'hsv' ? 'bg-yellow-400 text-purple-900' : 'bg-black/60 text-yellow-200 hover:bg-black/40'}`}>HSV</button>
                    <button onClick={() => updateEditorMode('oklch')} title="Edit with perceptual OKLCH sliders (matches the ramp engine's color space)" className={`px-2 py-1 transition-all ${editorMode === 'oklch' ? 'bg-yellow-400 text-purple-900' : 'bg-black/60 text-yellow-200 hover:bg-black/40'}`}>OKLCH</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-yellow-200 uppercase tracking-wider">Style</span>
                    <div className="flex items-center rounded border-2 border-yellow-700/50 overflow-hidden text-[10px] font-bold uppercase tracking-wider">
                      {(['punchy', 'balanced', 'muted', 'custom'] as const).map((sk) => (
                        <button
                          key={sk}
                          onClick={() => { tagNextLabel('Change ramp style'); setRampStyleOverride(i, sk); }}
                          title={`Set this ramp's active style to ${STYLE_LABEL[sk]}${sk === 'custom' ? ' (opens the reach/chroma falloff sliders for this ramp)' : ''}`}
                          className={`px-2 py-1 transition-all ${activeStyleFor(i) === sk ? 'bg-yellow-400 text-purple-900' : 'bg-black/60 text-yellow-200 hover:bg-black/40'}`}
                        >
                          {sk === 'punchy' ? 'P' : sk === 'balanced' ? 'B' : sk === 'muted' ? 'M' : 'C'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="ml-auto">
                    <button onClick={() => setEditingIndex(null)} title="Close the base color editor" className="text-xs px-2 py-1 rounded font-bold bg-purple-700 text-cyan-100 border-2 border-cyan-500 hover:bg-purple-600 transition-all uppercase tracking-wider">Done</button>
                  </div>
                </div>
                {editorMode === 'hsv' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-yellow-200 w-12">Hue</span>
                      <input type="range" min={0} max={359} value={editorHsv.h} onChange={(e) => updateEditorHsv({ ...editorHsv, h: Number(e.target.value) })} title={`Hue: ${Math.round(editorHsv.h)}°`} className="flex-1 accent-yellow-400" />
                      <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{Math.round(editorHsv.h)}°</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-yellow-200 w-12">Sat</span>
                      <input type="range" min={0} max={100} value={editorHsv.s} onChange={(e) => updateEditorHsv({ ...editorHsv, s: Number(e.target.value) })} title={`Saturation: ${Math.round(editorHsv.s)}%`} className="flex-1 accent-yellow-400" />
                      <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{Math.round(editorHsv.s)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-yellow-200 w-12">Value</span>
                      <input type="range" min={0} max={100} value={editorHsv.v} onChange={(e) => updateEditorHsv({ ...editorHsv, v: Number(e.target.value) })} title={`Value: ${Math.round(editorHsv.v)}%`} className="flex-1 accent-yellow-400" />
                      <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{Math.round(editorHsv.v)}%</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-yellow-200 w-12">Light</span>
                      <input type="range" min={0} max={100} value={editorOklch.L * 100} onChange={(e) => updateEditorOklch({ ...editorOklch, L: Number(e.target.value) / 100 })} title={`Lightness: ${Math.round(editorOklch.L * 100)}%`} className="flex-1 accent-yellow-400" />
                      <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{Math.round(editorOklch.L * 100)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-yellow-200 w-12 flex items-center gap-1">
                        Chroma
                        {oklchOutOfGamut && (
                          <span
                            className="shrink-0 inline-flex"
                            title={`Out of sRGB gamut, the committed color is clamped to Chroma ${oklchClamped!.C.toFixed(3)} (L and Hue unchanged)`}
                          >
                            <AlertTriangle size={11} className="text-orange-400" />
                          </span>
                        )}
                      </span>
                      <input type="range" min={0} max={0.4} step={0.001} value={editorOklch.C} onChange={(e) => updateEditorOklch({ ...editorOklch, C: Number(e.target.value) })} title={oklchOutOfGamut ? `Chroma: ${editorOklch.C.toFixed(3)}, out of gamut, clamped to ${oklchClamped!.C.toFixed(3)}` : `Chroma: ${editorOklch.C.toFixed(3)} (out-of-gamut values are clamped)`} className={`flex-1 ${oklchOutOfGamut ? 'accent-orange-400' : 'accent-yellow-400'}`} />
                      <span className={`text-[11px] font-mono w-10 text-right ${oklchOutOfGamut ? 'text-orange-400' : 'text-yellow-100'}`} title={oklchOutOfGamut ? `Clamped to ${oklchClamped!.C.toFixed(3)}` : undefined}>{editorOklch.C.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-yellow-200 w-12">Hue</span>
                      <input type="range" min={0} max={359} value={editorOklch.H} onChange={(e) => updateEditorOklch({ ...editorOklch, H: Number(e.target.value) })} title={`Hue: ${Math.round(editorOklch.H)}°`} className="flex-1 accent-yellow-400" />
                      <span className="text-[11px] font-mono text-yellow-100 w-10 text-right">{Math.round(editorOklch.H)}°</span>
                    </div>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-yellow-500/30 flex flex-col gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-bold text-yellow-200 uppercase tracking-wider">Shades:</span>
                    <ShadeCountControl
                      value={resolveSizeForRamp(i)}
                      onCommit={(n) => setRampSizeOverrides(prev => ({ ...prev, [i]: n }))}
                      accentClassName="accent-yellow-400"
                      inputClassName="w-12 h-7 rounded text-xs font-bold text-center border-2 bg-purple-900/60 text-yellow-100 border-yellow-700/50 tabular-nums"
                      ariaLabel={`Shades for ramp ${i + 1}`}
                      title={rampSizeOverrides[i] !== undefined ? `Shade count for this ramp, 2-64 (overridden to ${resolveSizeForRamp(i)})` : `Shade count for this ramp, 2-64 (inheriting global ${rampSize}); changing it sets a per-ramp override`}
                    />
                    {rampSizeOverrides[i] !== undefined && (
                      <button onClick={() => setRampSizeOverrides(prev => { const n = { ...prev }; delete n[i]; return n; })} title={`Clear the per-ramp size override and use the global setting (${rampSize})`} className="text-[10px] px-2 py-1 rounded font-bold bg-purple-700 text-yellow-100 border-2 border-yellow-700/50 hover:bg-purple-600 transition-all uppercase tracking-wider">Inherit ({rampSize})</button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] font-bold text-yellow-200 uppercase tracking-wider w-12">Sat ×</span>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={5}
                      value={Math.round((rampSatOverrides[i] ?? 1) * 100)}
                      onChange={(e) => {
                        const pct = Number(e.target.value);
                        setRampSatOverrides(prev => ({ ...prev, [i]: pct / 100 }));
                      }}
                      className="flex-1 accent-yellow-400 min-w-[100px]"
                      title={`Saturation multiplier for this ramp: ${(rampSatOverrides[i] ?? 1).toFixed(2)}x (range 0.50x to 2.00x)`}
                    />
                    <span className="text-[11px] font-mono text-yellow-100 w-14 text-right">{(rampSatOverrides[i] ?? 1).toFixed(2)}x</span>
                    {rampSatOverrides[i] !== undefined && rampSatOverrides[i] !== 1 && (
                      <button onClick={() => setRampSatOverrides(prev => { const n = { ...prev }; delete n[i]; return n; })} title="Reset per-ramp saturation multiplier to 1.00x" className="text-[10px] px-2 py-1 rounded font-bold bg-purple-700 text-yellow-100 border-2 border-yellow-700/50 hover:bg-purple-600 transition-all uppercase tracking-wider">Reset</button>
                    )}
                  </div>
                  {(() => {
                    const scalars = resolveRampScalars({ style: activeStyleFor(i), baseIndex: i, stylePresets, rampStyleScalars });
                    return (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-yellow-200 uppercase tracking-wider">Custom tuning (switches this ramp to Custom)</span>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[11px] font-bold text-yellow-200 uppercase tracking-wider w-12">Reach</span>
                          <input
                            type="range" min={0} max={100}
                            value={Math.round(scalars.reach * 100)}
                            onChange={(e) => { tagNextLabel('Customize ramp style'); setRampScalar(i, 'reach', Number(e.target.value) / 100); }}
                            className="flex-1 accent-yellow-400 min-w-[100px]"
                            title={`Reach for this ramp: ${Math.round(scalars.reach * 100)}% (dragging switches this ramp to Custom)`}
                          />
                          <span className="text-[11px] font-mono text-yellow-100 w-14 text-right">{Math.round(scalars.reach * 100)}%</span>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[11px] font-bold text-yellow-200 uppercase tracking-wider w-12">Falloff</span>
                          <input
                            type="range" min={0} max={100}
                            value={Math.round(scalars.chromaFalloff * 100)}
                            onChange={(e) => { tagNextLabel('Customize ramp style'); setRampScalar(i, 'chromaFalloff', Number(e.target.value) / 100); }}
                            className="flex-1 accent-yellow-400 min-w-[100px]"
                            title={`Chroma falloff for this ramp: ${Math.round(scalars.chromaFalloff * 100)}% (dragging switches this ramp to Custom)`}
                          />
                          <span className="text-[11px] font-mono text-yellow-100 w-14 text-right">{Math.round(scalars.chromaFalloff * 100)}%</span>
                        </div>
                      </div>
                    );
                  })()}
                  <RampAdvancedPanel
                    dataTourId={i === 0 ? 'ramp-advanced-toggle' : undefined}
                    open={advancedOpen[String(i)] ?? false}
                    lightnessCurve={lightnessCurvePerRamp[String(i)] ?? LIGHTNESS_PRESETS.eased}
                    satCurve={satCurvePerRamp[String(i)] ?? SAT_PRESETS.flat}
                    gamut={gamutPerRamp[String(i)] ?? 'auto'}
                    hueShift={resolveHueShiftForRamp(i)}
                    hueShiftOverridden={hueShiftStrengthPerRamp[i] !== undefined}
                    onToggle={() => setAdvancedOpen(prev => ({ ...prev, [String(i)]: !prev[String(i)] }))}
                    onLightnessCurveChange={pts => setLightnessCurvePerRamp(prev => ({ ...prev, [String(i)]: pts }))}
                    onSatCurveChange={pts => setSatCurvePerRamp(prev => ({ ...prev, [String(i)]: pts }))}
                    onGamutChange={g => setGamutPerRamp(prev => ({ ...prev, [String(i)]: g }))}
                    onHueShiftChange={v => setHueShiftStrengthPerRamp(prev => ({ ...prev, [i]: v }))}
                    onHueShiftReset={() => setHueShiftStrengthPerRamp(prev => { const n = { ...prev }; delete n[i]; return n; })}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 items-start">
              <div onClick={() => toggleRampCollapse(i)} title={collapsedRamps.has(i) ? 'Expand this ramp card' : 'Collapse this ramp card to icons only'} className="flex flex-row gap-3 items-start flex-shrink-0 flex-wrap cursor-pointer select-none hover:opacity-90 transition-opacity">
                {showAllStyles ? (
                  <>
                    <div className="w-36 flex flex-col items-center gap-1 p-3 rounded border-2 border-pink-500/50" style={{ background: punchyBg, boxShadow: '0 0 12px rgba(255, 0, 255, 0.3)' }}>
                      <PixelSprite palette={fPunchyTop.hexes} scale={(() => { const w = spriteLibrary[spriteKey]?.pattern?.[0]?.length || 14; if (w >= 32) return 3; if (w >= 22) return 3; if (w >= 18) return 4; return 5; })()} spriteKey={spriteKey} spriteLibrary={spriteLibrary} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themedAccent('#ff00ff'), textShadow: accentTextGlow('#ff00ff', 6) }}>Punchy</span>
                      <span className="text-xs font-bold text-center uppercase tracking-wider break-words w-full leading-tight" style={{ color: t.colorNameText }}>{aiColorNames[i] || `Color ${i + 1}`}</span>
                    </div>
                    <div className="w-36 flex flex-col items-center gap-1 p-3 rounded border-2 border-cyan-500/50" style={{ background: balancedBg, boxShadow: '0 0 12px rgba(0, 255, 255, 0.3)' }}>
                      <PixelSprite palette={fBalancedTop.hexes} scale={(() => { const w = spriteLibrary[spriteKey]?.pattern?.[0]?.length || 14; if (w >= 32) return 3; if (w >= 22) return 3; if (w >= 18) return 4; return 5; })()} spriteKey={spriteKey} spriteLibrary={spriteLibrary} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themedAccent('#00ffff'), textShadow: accentTextGlow('#00ffff', 6) }}>Balanced</span>
                      <span className="text-xs font-bold text-center uppercase tracking-wider break-words w-full leading-tight" style={{ color: t.colorNameText }}>{aiColorNames[i] || `Color ${i + 1}`}</span>
                    </div>
                    <div className="w-36 flex flex-col items-center gap-1 p-3 rounded border-2 border-purple-400/60" style={{ background: mutedBg, boxShadow: '0 0 12px rgba(168, 85, 247, 0.3)' }}>
                      <PixelSprite palette={fMutedTop.hexes} scale={(() => { const w = spriteLibrary[spriteKey]?.pattern?.[0]?.length || 14; if (w >= 32) return 3; if (w >= 22) return 3; if (w >= 18) return 4; return 5; })()} spriteKey={spriteKey} spriteLibrary={spriteLibrary} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themedAccent('#a855f7'), textShadow: accentTextGlow('#a855f7', 6) }}>Muted</span>
                      <span className="text-xs font-bold text-center uppercase tracking-wider break-words w-full leading-tight" style={{ color: t.colorNameText }}>{aiColorNames[i] || `Color ${i + 1}`}</span>
                    </div>
                  </>
                ) : (
                  <div className={`w-36 flex flex-col items-center gap-1 p-3 rounded border-2 ${STYLE_BORDER[activeStyle]}`} style={{ background: activeBg, boxShadow: `0 0 12px ${STYLE_ACCENT[activeStyle]}4d` }}>
                    <PixelSprite palette={fActiveTop.hexes} scale={(() => { const w = spriteLibrary[spriteKey]?.pattern?.[0]?.length || 14; if (w >= 32) return 3; if (w >= 22) return 3; if (w >= 18) return 4; return 5; })()} spriteKey={spriteKey} spriteLibrary={spriteLibrary} />
                    <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: themedAccent(STYLE_ACCENT[activeStyle]), textShadow: accentTextGlow(STYLE_ACCENT[activeStyle], 6) }}>{STYLE_LABEL[activeStyle]}</span>
                    <span className="text-xs font-bold text-center uppercase tracking-wider break-words w-full leading-tight" style={{ color: t.colorNameText }}>{aiColorNames[i] || `Color ${i + 1}`}</span>
                  </div>
                )}
                <span className="self-center pl-1" style={{ color: themedAccent('#00ffff') }} aria-hidden="true">
                  {collapsedRamps.has(i) ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                </span>
              </div>
              {!collapsedRamps.has(i) && (() => {
                const fPunchy = fPunchyTop;
                const fBalanced = fBalancedTop;
                const fMuted = fMutedTop;
                const rampLen = showAllStyles ? punchy.length : active.length;
                const adjTip = (rampHexes: string[], rampLabels: string[], k: number) => {
                  if (rampHexes.length <= 1) return null;
                  const here = rampHexes[k];
                  const parts: string[] = [];
                  if (k > 0) {
                    const prev = rampHexes[k - 1];
                    const prevLabel = rampLabels[k - 1] || `shade ${k}`;
                    const ratio = wcagContrast(here, prev);
                    const tier = wcagAaTier(ratio);
                    parts.push(`vs ${prevLabel}: ${ratio.toFixed(2)}:1 ${tier}`);
                  }
                  if (k < rampHexes.length - 1) {
                    const next = rampHexes[k + 1];
                    const nextLabel = rampLabels[k + 1] || `shade ${k + 2}`;
                    const ratio = wcagContrast(here, next);
                    const tier = wcagAaTier(ratio);
                    parts.push(`vs ${nextLabel}: ${ratio.toFixed(2)}:1 ${tier}`);
                  }
                  return `Contrast: ${parts.join(', ')}`;
                };
                if (!showAllStyles) {
                  return (
                    <div className="flex flex-col gap-3 flex-1 min-w-0">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent(STYLE_ACCENT[activeStyle]), textShadow: accentTextGlow(STYLE_ACCENT[activeStyle], 6) }}>▸ {STYLE_LABEL[activeStyle]}</div>
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fActiveTop.hexes.length}, minmax(0, 100px))` }}>
                          {fActiveTop.hexes.map((hex, k) => {
                            const origJ = fActiveTop.originalIndices[k];
                            return <Swatch key={`a-${i}-${origJ}`} hex={hex} label={fActiveTop.labels[k] || ''} borderClass={STYLE_SWATCH_BORDER[activeStyle]} shadowRgba={`${STYLE_ACCENT[activeStyle]}4d`} baseIndex={i} shadeIndex={origJ} style={activeStyle} onContextMenu={() => hideShade(i, origJ, rampLen)} extraTooltip={adjTip(fActiveTop.hexes, fActiveTop.labels, k)} />;
                          })}
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div className="flex flex-col gap-3 flex-1 min-w-0">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent('#ff00ff'), textShadow: accentTextGlow('#ff00ff', 6) }}>▸ Punchy</div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fPunchy.hexes.length}, minmax(0, 100px))` }}>
                        {fPunchy.hexes.map((hex, k) => {
                          const origJ = fPunchy.originalIndices[k];
                          return <Swatch key={`p-${i}-${origJ}`} hex={hex} label={fPunchy.labels[k] || ''} borderClass="border-pink-400" shadowRgba="rgba(255, 0, 255, 0.3)" baseIndex={i} shadeIndex={origJ} style="punchy" onContextMenu={() => hideShade(i, origJ, rampLen)} extraTooltip={adjTip(fPunchy.hexes, fPunchy.labels, k)} />;
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent('#00ffff'), textShadow: accentTextGlow('#00ffff', 6) }}>▸ Balanced</div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fBalanced.hexes.length}, minmax(0, 100px))` }}>
                        {fBalanced.hexes.map((hex, k) => {
                          const origJ = fBalanced.originalIndices[k];
                          return <Swatch key={`b-${i}-${origJ}`} hex={hex} label={fBalanced.labels[k] || ''} borderClass="border-cyan-400" shadowRgba="rgba(0, 255, 255, 0.3)" baseIndex={i} shadeIndex={origJ} style="balanced" onContextMenu={() => hideShade(i, origJ, rampLen)} extraTooltip={adjTip(fBalanced.hexes, fBalanced.labels, k)} />;
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent('#a855f7'), textShadow: accentTextGlow('#a855f7', 6) }}>▸ Muted</div>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${fMuted.hexes.length}, minmax(0, 100px))` }}>
                        {fMuted.hexes.map((hex, k) => {
                          const origJ = fMuted.originalIndices[k];
                          return <Swatch key={`m-${i}-${origJ}`} hex={hex} label={fMuted.labels[k] || ''} borderClass="border-purple-400" shadowRgba="rgba(168, 85, 247, 0.3)" baseIndex={i} shadeIndex={origJ} style="muted" onContextMenu={() => hideShade(i, origJ, rampLen)} extraTooltip={adjTip(fMuted.hexes, fMuted.labels, k)} />;
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
            {pinEditor && pinEditor.baseIndex === i && (() => {
              const j = pinEditor.shadeIndex;
              const ps = pinEditor.style;
              const sourceRamp = ps === 'balanced' ? rampsBalanced[i] : ps === 'muted' ? rampsMuted[i] : ps === 'custom' ? rampsActive[i] : rampsPunchy[i];
              const currentHex = (sourceRamp && sourceRamp[j]) || baseColors[i];
              const pinned = isShadePinned(i, j, ps);
              const shadeLabel = labels[j] || `shade ${j + 1}`;
              const styleLabel = STYLE_LABEL[ps as RampStyle] || 'Punchy';
              const styleColor = STYLE_ACCENT[ps as RampStyle] || '#ff00ff';
              return (
                <div className="mt-4 p-3 rounded border-2 border-yellow-500/60 bg-black/60" style={{ boxShadow: '0 0 12px rgba(255, 255, 0, 0.25)' }}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold text-yellow-200 uppercase tracking-wider flex items-center gap-1">
                      <Pin size={12} /> Pin Shade: <span style={{ color: styleColor }}>{styleLabel}</span> / <span className="text-pink-200">{shadeLabel}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <input type="color" value={currentHex} onChange={(e) => setOverride(i, j, ps, e.target.value)} title="Pick the hex color this shade will be pinned to" className="w-10 h-10 rounded border-2 border-yellow-400 cursor-pointer" style={{ boxShadow: '0 0 8px rgba(255, 255, 0, 0.5)' }} />
                      <input type="text" value={currentHex} onChange={(e) => { const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) setOverride(i, j, ps, v); }} title="Type a hex color for this pin (e.g. #ff6b35)" className="px-2 py-1 rounded bg-black/60 text-yellow-100 font-mono text-sm border-2 border-yellow-400 w-24 focus:outline-none" />
                    </div>
                    <span className="text-[11px] text-yellow-100/70 italic">Affects only the {styleLabel} ramp</span>
                    <div className="ml-auto flex gap-2">
                      {pinned && (
                        <button onClick={() => { clearOverride(i, j, ps); setPinEditor(null); }} title="Remove this pin and close the editor" className="text-xs px-2 py-1 rounded font-bold bg-pink-500 text-white border-2 border-pink-200 hover:bg-pink-400 transition-all uppercase tracking-wider flex items-center gap-1">
                          <Trash2 size={12} />Unpin
                        </button>
                      )}
                      <button onClick={() => setPinEditor(null)} title="Close the pin editor (keeps the current pin)" className="text-xs px-2 py-1 rounded font-bold bg-purple-700 text-cyan-100 border-2 border-cyan-500 hover:bg-purple-600 transition-all uppercase tracking-wider">Close</button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
