import { useRef, useEffect } from 'react';
import { BarChart3, ChevronUp, ChevronDown, X, Upload, ImageIcon, Download } from 'lucide-react';
import { SectionCard } from '../SectionCard';
import { AdjacencyMatrix } from '../AdjacencyMatrix';
import { CrossAdjacencyMatrix } from '../CrossAdjacencyMatrix';
import { DitherBlend } from '../DitherBlend';
import { CrossRampDither } from '../CrossRampDither';
import { PaletteCycleEditor } from '../PaletteCycleEditor';
import { computeVizData, lightnessMarkers, LIGHTNESS_GRIDLINES } from '../../lib/strip-export';
import { buildRampsForSnapshot } from '../../lib/snapshot-ramps';
import { DITHER_PATTERNS, type DitherPattern } from '../../lib/viz-interaction';
import type { MatrixColorSet, MatrixView } from '../../lib/viz-interaction';
import { CLASSIC_PALETTES } from '../../lib/constants';
import { computeRemapScaleOptions, estimateRemapCost } from '../../lib/image-remap';
import type { RemapImage } from '../../lib/image-remap';
import { hexToHsl } from '../../lib/color';
import { useTheme } from '../../contexts';

type RemapDither = 'none' | 'floyd-steinberg' | 'atkinson' | 'stucki';

export interface VizComparePanelProps {
  // SectionCard
  sbsOpen: boolean;
  setSbsOpen: (fn: (prev: boolean) => boolean) => void;

  // Sub-section collapse state
  vizSubOpen: Record<string, boolean>;
  toggleVizSub: (key: string) => void;

  // Matrix controls
  matrixColorSet: MatrixColorSet;
  setMatrixColorSet: (fn: (s: MatrixColorSet) => MatrixColorSet) => void;
  matrixView: MatrixView;
  setMatrixView: (fn: (v: MatrixView) => MatrixView) => void;

  // Dither controls
  ditherPattern: DitherPattern;
  setDitherPattern: (p: DitherPattern) => void;
  ditherCrossRamp: boolean;
  setDitherCrossRamp: (fn: (v: boolean) => boolean) => void;
  ditherZoom: number;
  setDitherZoom: (z: number) => void;

  // SBS slots
  sbsLeft: string | null;
  setSbsLeft: (s: string) => void;
  sbsRight: string | null;
  setSbsRight: (s: string | null) => void;
  sbsLeftPayload: any;
  sbsRightPayload: any;
  sbsLeftError: string;
  sbsRightError: string;
  sbsLeftLoading: boolean;
  sbsRightLoading: boolean;

  // SBS remap
  sbsRemapSource: string | null;
  sbsLeftRemap: RemapImage | null;
  sbsRightRemap: RemapImage | null;
  sbsLeftRemapLoading: boolean;
  sbsRightRemapLoading: boolean;

  // Main remap
  remapImageDataUrl: string | null;
  remapImageNaturalSize: { w: number; h: number } | null;
  remapOutput: RemapImage | null;
  remapDither: RemapDither;
  setRemapDither: (d: RemapDither) => void;
  remapLoading: boolean;
  remapError: string;
  remapImageName: string;
  remapDownloadScale: number;
  setRemapDownloadScale: (v: number) => void;
  remapDownloadConfirmPending: boolean;
  setRemapDownloadConfirmPending: (v: boolean) => void;
  remapDragOver: boolean;
  setRemapDragOver: (v: boolean) => void;
  remapDownloadConfirmTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

  // Data
  savedPalettes: { slug: string; name: string }[];
  aiColorNames: string[] | null;

  // Callbacks
  getSnapshotForSlot: (slot: string | null, payload: any) => any;
  getSlotLabel: (slot: string | null, payload: any) => string;
  getActiveRemapPalette: () => string[];
  exportLightnessPng: (snap: any) => void;
  exportMosaicPng: (snap: any) => void;
  exportMatrixPng: (snap: any) => void;
  exportDitherPng: (snap: any) => void;
  downloadRemap: () => void;
  clearRemapImage: () => void;
  handleRemapImageUpload: (file: File) => void;
}

export function VizComparePanel({
  sbsOpen, setSbsOpen,
  vizSubOpen, toggleVizSub,
  matrixColorSet, setMatrixColorSet, matrixView, setMatrixView,
  ditherPattern, setDitherPattern, ditherCrossRamp, setDitherCrossRamp, ditherZoom, setDitherZoom,
  sbsLeft, setSbsLeft, sbsRight, setSbsRight,
  sbsLeftPayload, sbsRightPayload, sbsLeftError, sbsRightError, sbsLeftLoading, sbsRightLoading,
  sbsRemapSource, sbsLeftRemap, sbsRightRemap, sbsLeftRemapLoading, sbsRightRemapLoading,
  remapImageDataUrl, remapImageNaturalSize, remapOutput, remapDither, setRemapDither,
  remapLoading, remapError, remapImageName, remapDownloadScale, setRemapDownloadScale,
  remapDownloadConfirmPending, setRemapDownloadConfirmPending, remapDragOver, setRemapDragOver,
  remapDownloadConfirmTimerRef,
  savedPalettes, aiColorNames,
  getSnapshotForSlot, getSlotLabel, getActiveRemapPalette,
  exportLightnessPng, exportMosaicPng, exportMatrixPng, exportDitherPng,
  downloadRemap, clearRemapImage, handleRemapImageUpload,
}: VizComparePanelProps) {
  const { t, themedAccent } = useTheme();

  const remapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sbsLeftRemapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sbsRightRemapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = remapCanvasRef.current;
    if (!canvas) return;
    if (!remapOutput || remapOutput.width === 0) return;
    canvas.width = remapOutput.width;
    canvas.height = remapOutput.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(remapOutput.width, remapOutput.height);
    imgData.data.set(remapOutput.data);
    ctx.putImageData(imgData, 0, 0);
  }, [remapOutput]);

  useEffect(() => {
    const canvas = sbsLeftRemapCanvasRef.current;
    if (!canvas) return;
    if (!sbsLeftRemap || sbsLeftRemap.width === 0) return;
    canvas.width = sbsLeftRemap.width;
    canvas.height = sbsLeftRemap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(sbsLeftRemap.width, sbsLeftRemap.height);
    imgData.data.set(sbsLeftRemap.data);
    ctx.putImageData(imgData, 0, 0);
  }, [sbsLeftRemap]);

  useEffect(() => {
    const canvas = sbsRightRemapCanvasRef.current;
    if (!canvas) return;
    if (!sbsRightRemap || sbsRightRemap.width === 0) return;
    canvas.width = sbsRightRemap.width;
    canvas.height = sbsRightRemap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.createImageData(sbsRightRemap.width, sbsRightRemap.height);
    imgData.data.set(sbsRightRemap.data);
    ctx.putImageData(imgData, 0, 0);
  }, [sbsRightRemap]);

  // Fixed accent now that style is per-ramp (no global vizStyle to tint by).
  const styleAccent = '#ff00ff';
  const leftSnap = getSnapshotForSlot(sbsLeft, sbsLeftPayload);
  const rightSnap = getSnapshotForSlot(sbsRight, sbsRightPayload);
  const isTwoColumn = sbsRight !== null;

  const vizSub = (subKey: string, title: string, controls: React.ReactNode, compact: boolean, body: React.ReactNode) => {
    if (compact) {
      return (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: themedAccent('#00ffff') }}>{title}</h4>
          {body}
        </div>
      );
    }
    const open = vizSubOpen[subKey] !== false;
    return (
      <div className="rounded border-2 border-cyan-700/40 bg-black/60 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <button onClick={() => toggleVizSub(subKey)} title={open ? `Collapse ${title}` : `Expand ${title}`} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            <span className="text-cyan-200 shrink-0">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
            <h4 className="text-sm font-bold text-cyan-200 uppercase tracking-widest truncate">{title}</h4>
          </button>
          {controls && <div className="flex items-center gap-2 flex-wrap justify-end">{controls}</div>}
        </div>
        {open && <div className="px-3 pb-3">{body}</div>}
      </div>
    );
  };

  const renderSlotViz = (snap: any, label: string, slotKey: 'left' | 'right', compact: boolean) => {
    const slotValue = slotKey === 'left' ? sbsLeft : sbsRight;
    const loading = slotKey === 'left' ? sbsLeftLoading : sbsRightLoading;
    const error = slotKey === 'left' ? sbsLeftError : sbsRightError;
    if (loading) {
      return (
        <div className="text-center text-cyan-100/70 italic text-sm py-12 border-2 border-dashed border-cyan-700/40 rounded bg-black/60">
          Loading {label}...
        </div>
      );
    }
    if (error) {
      return (
        <div className={`text-xs rounded p-3 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>
          {error}
        </div>
      );
    }
    if (!snap || !Array.isArray(snap.baseColors) || snap.baseColors.length === 0) {
      return (
        <div className="text-center text-cyan-100/50 italic text-sm py-12 border-2 border-dashed border-cyan-700/40 rounded bg-black/60">
          {slotValue === null ? 'Pick a palette above to compare' : 'No colors to show'}
        </div>
      );
    }
    const ramps = buildRampsForSnapshot(snap);
    const { allColors, sortedByL, mosaicRamps } = computeVizData(ramps);
    const namesSource = Array.isArray(snap.aiColorNames) ? snap.aiColorNames : aiColorNames;
    const plotSize = compact ? 200 : 280;
    const mosaicH = compact ? '28px' : '40px';
    const lightnessH = compact ? '22px' : '32px';
    return (
      <div className="flex flex-col gap-4">
        {compact && sbsRemapSource && (() => {
          const slotRemap = slotKey === 'left' ? sbsLeftRemap : sbsRightRemap;
          const slotRemapLoading = slotKey === 'left' ? sbsLeftRemapLoading : sbsRightRemapLoading;
          const canvasRef = slotKey === 'left' ? sbsLeftRemapCanvasRef : sbsRightRemapCanvasRef;
          const slotPayload = slotKey === 'left' ? sbsLeftPayload : sbsRightPayload;
          const slotLetter = slotKey === 'left' ? 'A' : 'B';
          return vizSub('image', 'Image Preview', null, compact, (
            <>
              <div className="flex justify-center bg-black/60 rounded border" style={{ borderColor: t.vizDataBorder, minHeight: '64px' }}>
                {slotRemapLoading && !slotRemap && (
                  <div className="text-[11px] text-cyan-100/70 italic py-6">Computing...</div>
                )}
                {slotRemap && (
                  <canvas
                    ref={canvasRef}
                    style={{ imageRendering: 'pixelated', width: `${slotRemap.width * remapDownloadScale}px`, maxWidth: '100%', height: 'auto', display: 'block' }}
                    title={`Uploaded image remapped to this slot's palette (${slotRemap.width}x${slotRemap.height}, ${remapDither === 'none' ? 'no dither' : `${remapDither} dither`})`}
                  />
                )}
                {!slotRemap && !slotRemapLoading && (
                  <div className="text-[11px] text-cyan-100/40 italic py-6">No preview</div>
                )}
              </div>
              <div className="text-[10px] text-cyan-100/60 italic text-center mt-1 font-mono truncate bg-black/60 rounded px-1" title={`Slot ${slotLetter}: ${getSlotLabel(slotValue, slotPayload)}`}>
                Slot {slotLetter}: {getSlotLabel(slotValue, slotPayload)}
              </div>
            </>
          ));
        })()}
        {vizSub('chromatic', 'Chromatic Plot', null, compact, (
          <>
          {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">Each color positioned by hue (angle) and saturation (distance from center). Tight clusters = cohesive palette.</p>}
          <div className="flex justify-center">
            <svg width={plotSize} height={plotSize} viewBox="0 0 280 280">
              <circle cx="140" cy="140" r="125" fill="none" stroke={t.vizRingStroke} strokeWidth="1" />
              <circle cx="140" cy="140" r="83" fill="none" stroke={t.vizRingStroke} strokeWidth="1" />
              <circle cx="140" cy="140" r="42" fill="none" stroke={t.vizRingStroke} strokeWidth="1" />
              {[0, 60, 120, 180, 240, 300].map(deg => {
                const rad = (deg - 90) * Math.PI / 180;
                const x2 = 140 + Math.cos(rad) * 125;
                const y2 = 140 + Math.sin(rad) * 125;
                return <line key={deg} x1="140" y1="140" x2={x2} y2={y2} stroke={t.vizSpokeStroke} strokeWidth="1" />;
              })}
              {allColors.map((hex, i) => {
                const { h = 0, s = 0, l = 0 } = hexToHsl(hex) as { h: number; s: number; l: number };
                const rad = (h - 90) * Math.PI / 180;
                const dist = (s / 100) * 125;
                const cx = 140 + Math.cos(rad) * dist;
                const cy = 140 + Math.sin(rad) * dist;
                const strokeColor = l > 50 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
                return <circle key={i} cx={cx} cy={cy} r="6" fill={hex} stroke={strokeColor} strokeWidth="1.5">
                  <title>{hex.toUpperCase()} H={h.toFixed(0)}{compact ? '' : '°'} S={s.toFixed(0)}{compact ? '' : '%'} L={l.toFixed(0)}{compact ? '' : '%'}</title>
                </circle>;
              })}
              {!compact && (
                <>
                  <text x="140" y="14" textAnchor="middle" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">0°</text>
                  <text x="271" y="144" textAnchor="end" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">90°</text>
                  <text x="140" y="274" textAnchor="middle" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">180°</text>
                  <text x="9" y="144" textAnchor="start" fontSize="9" fill={t.vizAxisLabel} fontFamily="monospace">270°</text>
                </>
              )}
            </svg>
          </div>
          </>
        ))}
        {vizSub('lightness', 'Lightness Distribution', (
          <button onClick={() => exportLightnessPng(snap)} title="Download the Lightness Distribution strip as a PNG (current style)" className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 flex items-center gap-1.5"><Download size={13} />PNG</button>
        ), compact, (
          <>
          {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">All colors placed on a 0→100 lightness axis (left = darkest). Blank stretches are missing tonal ranges.</p>}
          <div className="relative w-full rounded overflow-hidden border" style={{ height: lightnessH, borderColor: t.vizDataBorder, background: '#15151f' }}>
            {LIGHTNESS_GRIDLINES.map((p) => (
              <div key={`g${p}`} className="absolute top-0 bottom-0" style={{ left: `${p}%`, width: 1, background: 'rgba(255,255,255,0.18)' }} />
            ))}
            {lightnessMarkers(sortedByL).map(({ hex, l }, i) => (
              <div key={i} className="absolute top-0 bottom-0" style={{ left: `${l}%`, width: 6, transform: 'translateX(-50%)', background: hex, boxShadow: '0 0 0 1px rgba(0,0,0,0.45)' }} title={`${hex.toUpperCase()} L=${l.toFixed(0)}`} />
            ))}
          </div>
          </>
        ))}
        {vizSub('mosaic', 'Mosaic', (
          <button onClick={() => exportMosaicPng(snap)} title="Download the Mosaic as a PNG (current style)" className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 flex items-center gap-1.5"><Download size={13} />PNG</button>
        ), compact, (
          <>
          {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">All ramps side-by-side. Look for adjacent colors that clash or harmonize.</p>}
          <div className="flex flex-col gap-1">
            {mosaicRamps.map(({ hexes, originalIdx }) => (
              <div key={originalIdx} className="flex w-full rounded overflow-hidden border" style={{ height: mosaicH, borderColor: t.vizDataBorder }}>
                {hexes.map((hex, j) => (
                  <div key={`${originalIdx}-${j}`} className="flex-1" style={{ background: hex }} title={`${(namesSource && namesSource[originalIdx]) || `Color ${originalIdx + 1}`} ${hex.toUpperCase()}`} />
                ))}
              </div>
            ))}
          </div>
          </>
        ))}
        {vizSub('adjacency', compact ? 'Adjacency' : 'Adjacency Matrix', (
          <>
            <button onClick={() => setMatrixColorSet(s => s === 'unique' ? 'bases' : 'unique')} title="Toggle matrix colors between all unique shades and ramp bases" className={`px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}>{matrixColorSet === 'unique' ? 'All colors' : 'Bases'}</button>
            <button onClick={() => setMatrixView(v => v === 'pair' ? 'heatmap' : 'pair')} title="Toggle matrix between pair-split and ΔE_OK heatmap" className={`px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}>{matrixView === 'pair' ? 'Pair' : 'Heatmap'}</button>
            <button onClick={() => exportMatrixPng(snap)} title="Download the Adjacency Matrix as a PNG (current style)" className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 flex items-center gap-1.5"><Download size={13} />PNG</button>
          </>
        ), compact, (
          <>
          {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">Every color paired with every other. Pair mode shows the two together; heatmap shades each cell by perceptual distance (ΔE_OK): dark = near-duplicate pair, bright = outlier. Hover for the exact pair. (Compare slots use heatmap.)</p>}
          <div className="flex justify-center overflow-x-auto">
            <AdjacencyMatrix
              allColors={allColors}
              bases={Array.isArray(snap.baseColors) ? snap.baseColors : []}
              colorSet={matrixColorSet}
              view={compact ? 'heatmap' : matrixView}
              compact={compact}
              borderColor={t.vizDataBorder}
            />
          </div>
          </>
        ))}
        {vizSub('dither', compact ? 'Dither Blend' : 'Dither-Blend Preview', (
          <>
            <button onClick={() => setDitherCrossRamp(v => !v)} title={ditherCrossRamp ? 'Switch to the per-ramp blend (consecutive shades within each ramp)' : 'Switch to the cross-ramp grid (every ramp base dithered against every other)'} className={`px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}>{ditherCrossRamp ? 'Cross-ramp' : 'Per-ramp'}</button>
            <select value={ditherPattern} onChange={(e) => setDitherPattern(e.target.value as DitherPattern)} title="Ordered-dither pattern for the blend preview. Bayer 2×2/4×4/8×8 give progressively smoother ramps (4/16/64 levels); clustered dot, scanline and cross-hatch are hand-placeable sprite textures." className="px-2 py-1 rounded bg-black/60 text-cyan-100 border-2 border-cyan-400 focus:outline-none text-[11px] font-bold uppercase tracking-wider">
              {DITHER_PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            {!ditherCrossRamp && <div className="flex items-center gap-px" title="Magnify the dither preview (display only, stays pixel-crisp, does not affect the PNG export)">
              {[1, 2, 4].map((z) => (
                <button key={z} onClick={() => setDitherZoom(z)} className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${ditherZoom === z ? 'bg-cyan-400 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}>{z}×</button>
              ))}
            </div>}
            {!ditherCrossRamp && <button onClick={() => exportDitherPng(snap)} title="Download the Dither-Blend preview as a PNG (current style)" className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300 flex items-center gap-1.5"><Download size={13} />PNG</button>}
          </>
        ), compact, (
          <>
          {!compact && <p className="text-[11px] text-cyan-100/70 italic mb-2">{ditherCrossRamp ? 'Every ramp base dithered against every other, preview the perceived in-between hue of two ramps (e.g. red × blue reads as purple) without spending a slot. Diagonal is the solid base.' : 'Between each pair of consecutive ramp shades, an ordered-dither ramp from one shade to the next, how the two mix when dithered at sprite scale. Pick a pattern: Bayer 2×2/4×4/8×8 grow smoother (4/16/64 levels); clustered dot, scanline and cross-hatch are hand-placeable textures.'}</p>}
          <div className="flex justify-center overflow-x-auto">
            {ditherCrossRamp ? (
              <CrossRampDither
                bases={Array.isArray(snap.baseColors) ? snap.baseColors : []}
                names={namesSource}
                pattern={ditherPattern}
                compact={compact}
                borderColor={t.vizDataBorder}
              />
            ) : (
              <DitherBlend
                rows={mosaicRamps.map((r) => r.hexes)}
                pattern={ditherPattern}
                compact={compact}
                borderColor={t.vizDataBorder}
                zoom={compact ? 1 : ditherZoom}
              />
            )}
          </div>
          </>
        ))}
        {!compact && vizSub('cycle', 'Palette Cycling', null, compact, (
          <>
          <p className="text-[11px] text-cyan-100/70 italic mb-2">Classic index-rotation animation: mark a contiguous shade range, then the range's colors rotate in place at the chosen rate, how water, lava and torch ramps are animated on indexed hardware. Smooth motion means the range cycles cleanly; a visible "pop" means the ramp ends don't meet. Export writes a PIXEL.PAL JSON sidecar (range + rate) alongside the palette files.</p>
          <PaletteCycleEditor rows={mosaicRamps.map((r) => r.hexes)} borderColor={t.vizDataBorder} />
          </>
        ))}
        {compact && <div className="text-[10px] text-cyan-100/50 text-center font-mono bg-black/60 rounded px-1">{ramps.length} ramps, {allColors.length} unique colors</div>}
      </div>
    );
  };

  const slotClassicOptions = CLASSIC_PALETTES.map(c => ({ value: `classic:${c.id}`, label: c.name }));
  const slotSavedOptions = savedPalettes.map(p => ({ value: p.slug, label: p.name }));
  const parseSlot = (raw: string) => (raw === '' ? null : raw);

  const renderSlotAOptions = () => (
    <>
      <option value="working">Current working palette (live)</option>
      {slotClassicOptions.length > 0 && (
        <optgroup label="Classic palettes">
          {slotClassicOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </optgroup>
      )}
      {slotSavedOptions.length > 0 && (
        <optgroup label="Saved palettes">
          {slotSavedOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </optgroup>
      )}
    </>
  );

  const renderSlotBOptions = () => (
    <>
      <option value="">(empty)</option>
      <option value="working">Current working palette (live)</option>
      {slotClassicOptions.length > 0 && (
        <optgroup label="Classic palettes">
          {slotClassicOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </optgroup>
      )}
      {slotSavedOptions.length > 0 && (
        <optgroup label="Saved palettes">
          {slotSavedOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </optgroup>
      )}
    </>
  );

  return (
    <SectionCard
      sectionKey="viz" accent={styleAccent} bg={t.cardBgViz} glow={0.4}
      headerTourId="viz-header"
      open={sbsOpen} onToggle={() => setSbsOpen(o => !o)}
      headerTitle={sbsOpen ? "Collapse the Visualize & Compare section" : "Expand the Visualize & Compare section"}
      chevronColor="#a5f3fc"
      icon={<BarChart3 size={22} />} title="Visualize & Compare"
    >
      <div className="p-6 pt-2 flex flex-col gap-6">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: themedAccent('#00ffff') }}>▸ Image Preview</h3>
          <p className="text-[11px] text-cyan-100/70 italic mb-2 bg-black/60 rounded px-2 py-1">Upload an image. Every pixel snaps to the nearest color in the active palette (current style, hidden shades excluded, hardware lock honored). Auto-updates as you edit; 300ms debounce.</p>
          {!remapImageDataUrl && (
            <div
              data-tour-id="remap-dropzone"
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setRemapDragOver(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!remapDragOver) setRemapDragOver(true); }}
              onDragLeave={(e) => {
                e.preventDefault(); e.stopPropagation();
                const related = e.relatedTarget as Node | null;
                if (!related || !e.currentTarget.contains(related)) {
                  setRemapDragOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault(); e.stopPropagation();
                setRemapDragOver(false);
                const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (f) handleRemapImageUpload(f);
              }}
              className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded p-6 transition-colors ${remapDragOver ? 'border-cyan-300 bg-cyan-900/40' : 'border-cyan-500/50 bg-black/60'}`}
              style={remapDragOver ? { boxShadow: '0 0 12px rgba(0, 255, 255, 0.5)' } : {}}
            >
              <ImageIcon size={28} className={remapDragOver ? 'text-cyan-200' : 'text-cyan-300/60'} />
              <p className="text-xs text-cyan-100/70 text-center">{remapDragOver ? 'Release to upload' : 'Drop an image here, or browse for a file, to remap against the palette.'}</p>
              <label className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all flex items-center gap-1 uppercase tracking-wider text-xs cursor-pointer" style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.4)' }}>
                <Upload size={14} />Browse files
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) handleRemapImageUpload(f); e.target.value = ''; }} className="hidden" />
              </label>
              {remapError && (
                <p className="text-xs text-red-300 mt-1">{remapError}</p>
              )}
            </div>
          )}
          {remapImageDataUrl && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs bg-black/60 rounded px-2 py-1">
                <span className="text-cyan-100/80 truncate" title={remapImageName}>
                  Source: <span className="text-cyan-200 font-bold">{remapImageName || 'image'}</span>
                  {remapImageNaturalSize && (
                    <span className="text-cyan-100/50 ml-2">{remapImageNaturalSize.w}x{remapImageNaturalSize.h}</span>
                  )}
                </span>
                <button onClick={clearRemapImage} title="Remove the uploaded image" className={`px-2 py-1 rounded font-bold border-2 transition-all flex items-center gap-1 uppercase tracking-wider text-[11px] ${t.controlBtnDefault} ${t.controlBtnHover}`}>
                  <X size={12} />Clear
                </button>
              </div>
              {remapLoading && (
                <div className={`px-2 py-1 rounded border-2 text-[11px] font-bold uppercase tracking-wider ${t.alertInfoBg} ${t.alertInfoText} ${t.alertInfoBorder}`}>
                  Computing...
                </div>
              )}
              {remapError && (
                <p className="text-xs text-red-300">{remapError}</p>
              )}
              {!isTwoColumn && (
                <div className="flex justify-center bg-black/60 rounded border-2 border-cyan-700/40 p-2">
                  {!remapOutput && (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <img src={remapImageDataUrl} alt="source" style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '320px', height: 'auto' }} />
                      <p className="text-[11px] text-cyan-100/60 italic">Remapping...</p>
                    </div>
                  )}
                  {remapOutput && (
                    <canvas ref={remapCanvasRef} style={{ imageRendering: 'pixelated', width: `${remapOutput.width * remapDownloadScale}px`, maxWidth: '100%', height: 'auto' }} />
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 bg-black/60 rounded border-2 border-cyan-700/40 px-3 py-2">
                <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">Dither:</span>
                <button onClick={() => setRemapDither('none')} title="No dithering: every source pixel maps to its single nearest palette color" className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${remapDither === 'none' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}>None</button>
                <button onClick={() => setRemapDither('floyd-steinberg')} title="Floyd-Steinberg error diffusion: better gradient handling at the cost of a busier image" className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${remapDither === 'floyd-steinberg' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}>Floyd-Steinberg</button>
                <button onClick={() => setRemapDither('atkinson')} title="Atkinson error diffusion: diffuses only 6/8 of the error, giving cleaner flat areas and less smearing than Floyd-Steinberg (classic Mac dither)" className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${remapDither === 'atkinson' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}>Atkinson</button>
                <button onClick={() => setRemapDither('stucki')} title="Stucki error diffusion: a wider, smoother kernel than Floyd-Steinberg for finer gradients (slower)" className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider ${remapDither === 'stucki' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}>Stucki</button>
              </div>
              {!isTwoColumn && remapOutput && remapImageNaturalSize && (() => {
                const scaleOpts = computeRemapScaleOptions(remapImageNaturalSize.w, remapImageNaturalSize.h, 8192);
                if (scaleOpts.length === 0) {
                  return (
                    <div className={`flex items-center gap-2 rounded border-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider ${t.alertWarnBg} ${t.alertWarnText} ${t.alertWarnBorder}`}>
                      ▲ Source image exceeds 8192px on at least one axis. Resize the upload to enable export.
                    </div>
                  );
                }
                const fmtScale = (s: number) => (Number.isInteger(s) ? s + 'x' : s + 'x');
                const projectedCost = estimateRemapCost(
                  Math.max(1, Math.floor(remapImageNaturalSize.w * remapDownloadScale)),
                  Math.max(1, Math.floor(remapImageNaturalSize.h * remapDownloadScale)),
                  getActiveRemapPalette().length,
                  remapDither
                );
                const willWarn = projectedCost > 50000000;
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between bg-black/60 rounded border-2 border-cyan-700/40 px-3 py-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">Export scale:</span>
                        <select
                          value={remapDownloadScale}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setRemapDownloadScale(Number.isFinite(v) && v > 0 ? v : 1);
                            setRemapDownloadConfirmPending(false);
                            if (remapDownloadConfirmTimerRef.current) { clearTimeout(remapDownloadConfirmTimerRef.current); remapDownloadConfirmTimerRef.current = null; }
                          }}
                          title="Multiplier applied to the upload's natural size at export. Nearest-neighbor sampling preserves pixel-art aesthetics."
                          className={`px-2 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider cursor-pointer ${t.controlBtnDefault} ${t.controlBtnHover}`}
                        >
                          {scaleOpts.map((s) => {
                            const w = Math.max(1, Math.floor(remapImageNaturalSize!.w * s));
                            const h = Math.max(1, Math.floor(remapImageNaturalSize!.h * s));
                            return <option key={s} value={s}>{fmtScale(s)} ({w}x{h})</option>;
                          })}
                        </select>
                      </div>
                      <button
                        onClick={downloadRemap}
                        disabled={remapLoading}
                        title={remapDownloadConfirmPending ? "Click again within 5 seconds to commit this slow export" : (willWarn ? "Heavy export: clicking will prompt for confirmation first" : "Download the remapped image as PNG at the selected scale")}
                        className={`px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 uppercase tracking-wider text-[11px] ${
                          remapLoading
                            ? 'bg-purple-900/60 text-cyan-200/50 border-cyan-700/30 cursor-not-allowed'
                            : remapDownloadConfirmPending
                              ? 'bg-yellow-300 text-purple-900 border-yellow-100 hover:bg-yellow-200'
                              : 'bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300'
                        }`}
                        style={!remapLoading ? { boxShadow: remapDownloadConfirmPending ? '0 0 8px rgba(255, 230, 0, 0.5)' : '0 0 8px rgba(0, 255, 255, 0.4)' } : {}}
                      >
                        <Download size={12} />
                        {remapDownloadConfirmPending ? 'Click to confirm' : 'Download PNG'}
                      </button>
                    </div>
                    {remapDownloadConfirmPending && (
                      <div className={`px-2 py-1 rounded border-2 text-[11px] font-bold uppercase tracking-wider ${t.alertWarnBg} ${t.alertWarnText} ${t.alertWarnBorder}`}>
                        ▲ This export will take a while (an estimated {(projectedCost / 1000000).toFixed(0)}M pixel operations). The browser tab may freeze during the work. Click Download again within 5 seconds to proceed, or change the scale or dither setting.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: themedAccent('#00ffff') }}>Slot A</span>
            <select
              value={sbsLeft === null ? 'working' : sbsLeft}
              onChange={(e) => setSbsLeft(e.target.value)}
              title="Pick the palette to visualize (or compare in the left column)"
              className="w-full px-2 py-1.5 rounded bg-black/60 text-cyan-100 border-2 border-cyan-400 focus:outline-none text-sm font-mono"
            >
              {renderSlotAOptions()}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: themedAccent('#00ffff') }}>Slot B</span>
              {sbsRight && (
                <button onClick={() => setSbsRight(null)} title="Clear slot B to return to single-column view" className="px-2 py-0.5 rounded text-[10px] font-bold bg-pink-500 text-white border border-pink-200 hover:bg-pink-400 uppercase tracking-wider">Clear</button>
              )}
            </div>
            <select
              value={sbsRight === null ? '' : sbsRight}
              onChange={(e) => setSbsRight(parseSlot(e.target.value))}
              data-tour-id="sbs-right-select"
              title="Pick a second palette to compare side-by-side (empty = single-column view)"
              className="w-full px-2 py-1.5 rounded bg-black/60 text-cyan-100 border-2 border-cyan-400 focus:outline-none text-sm font-mono"
            >
              {renderSlotBOptions()}
            </select>
          </div>
        </div>
        {isTwoColumn ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3 bg-black/60 rounded border-2 border-cyan-500/40 p-3">
              <div className="text-[10px] text-cyan-100/60 font-mono truncate" title={getSlotLabel(sbsLeft, sbsLeftPayload)}>{getSlotLabel(sbsLeft, sbsLeftPayload)}</div>
              {renderSlotViz(leftSnap, 'Slot A', 'left', true)}
            </div>
            <div className="flex flex-col gap-3 bg-black/60 rounded border-2 border-cyan-500/40 p-3">
              <div className="text-[10px] text-cyan-100/60 font-mono truncate" title={getSlotLabel(sbsRight, sbsRightPayload)}>{getSlotLabel(sbsRight, sbsRightPayload)}</div>
              {renderSlotViz(rightSnap, 'Slot B', 'right', true)}
            </div>
          </div>
        ) : (
          <div>
            {renderSlotViz(leftSnap, 'Slot A', 'left', false)}
          </div>
        )}
        {isTwoColumn && (() => {
          const okA = leftSnap && Array.isArray(leftSnap.baseColors) && leftSnap.baseColors.length > 0;
          const okB = rightSnap && Array.isArray(rightSnap.baseColors) && rightSnap.baseColors.length > 0;
          if (!okA || !okB) return null;
          const colorsA = computeVizData(buildRampsForSnapshot(leftSnap)).allColors;
          const colorsB = computeVizData(buildRampsForSnapshot(rightSnap)).allColors;
          if (colorsA.length === 0 || colorsB.length === 0) return null;
          return vizSub('crossAdjacency', 'Cross-Palette Adjacency (A × B)', null, false, (
            <>
              <p className="text-[11px] text-cyan-100/70 italic mb-2">Every slot-A shade paired with every slot-B shade (rows = A, columns = B). Dark cells are near-duplicates across the two palettes (e.g. a character outline melting into a background midtone). Within-palette pairs live in each slot&apos;s own Adjacency view. Hover for the exact pair.</p>
              <div className="flex justify-center overflow-x-auto">
                <CrossAdjacencyMatrix rowColors={colorsA} colColors={colorsB} borderColor={t.vizDataBorder} />
              </div>
              <div className="text-[10px] text-cyan-100/50 text-center font-mono mt-2 bg-black/60 rounded px-1">
                A: {getSlotLabel(sbsLeft, sbsLeftPayload)} · B: {getSlotLabel(sbsRight, sbsRightPayload)}
              </div>
            </>
          ));
        })()}
        <p className="text-[10px] text-cyan-100/40 italic text-center bg-black/60 rounded px-2 py-1">Each ramp renders at its own active style. Hidden shades are filtered out.</p>
      </div>
    </SectionCard>
  );
}
