// src/components/PaletteCycleEditor.tsx
//
// Palette Cycling designer: click-to-select a contiguous shade range inside
// one visible ramp, then preview the classic index-rotation animation (the
// water/lava/torch trick) in real time via requestAnimationFrame. Export
// writes a PIXEL.PAL-specific pixel-pal-cycle.json sidecar. Fully
// self-contained: no App.tsx wiring, no context, no persistence. The
// selection is ephemeral component-local UI state (issue #131).
import { useEffect, useRef, useState } from 'react';
import { rotateCycle } from '../lib/viz-interaction';
import { buildCycleJson } from '../lib/palette-export';
import { parseCycleJson } from '../lib/palette-import';
import { saveFile } from '../lib/save-file';
import { DEFAULT_SPRITE_LIBRARY } from '../lib/constants';

interface PaletteCycleEditorProps {
  rows: string[][];        // mosaicRamps hexes: one array per visible ramp, current viz style
  borderColor?: string;    // t.vizDataBorder passthrough
}

const FPS_OPTIONS = [2, 4, 6, 8, 10, 15, 30];
const STRIP_CELL_W = 24;
const STRIP_CELL_H = 32;
const SPRITE_SCALE = 4;

// Same index-mapping ratio as PixelSprite's mapIndex in RampsPanel.tsx,
// copied locally: this canvas renderer is independent of the SVG one.
function mapIndex(idx: number, spriteShades: number, paletteLen: number): number {
  if (spriteShades <= 1) return Math.floor(paletteLen / 2);
  if (paletteLen === 1) return 0;
  const ratio = idx / (spriteShades - 1);
  return Math.max(0, Math.min(paletteLen - 1, Math.round(ratio * (paletteLen - 1))));
}

function parseChar(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
  if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 87;
  return 0;
}

export function PaletteCycleEditor({ rows, borderColor }: PaletteCycleEditorProps) {
  const [sel, setSel] = useState<{ row: number; low: number; high: number } | null>(null);
  const [pending, setPending] = useState<{ row: number; idx: number } | null>(null);
  const [fps, setFps] = useState(8);
  const [playing, setPlaying] = useState(true);
  const [reverse, setReverse] = useState(false);
  const [spriteKey, setSpriteKey] = useState('vase');
  const [loadError, setLoadError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLCanvasElement>(null);
  const loadInputRef = useRef<HTMLInputElement>(null);

  const rowsKey = JSON.stringify(rows);

  useEffect(() => {
    if (!sel) return;
    if (sel.row >= rows.length || sel.high >= rows[sel.row].length) {
      setSel(null);
      setPending(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- defensive reset keyed on shape only
  }, [rowsKey]);

  useEffect(() => {
    if (!sel) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const draw = () => {
      const rotated = rotateCycle(rows[sel.row], sel.low, sel.high, offsetRef.current, reverse);

      const stripCanvas = stripRef.current;
      if (stripCanvas) {
        const ctx = stripCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, stripCanvas.width, stripCanvas.height);
          rotated.forEach((hex, i) => {
            ctx.fillStyle = hex;
            ctx.fillRect(i * STRIP_CELL_W, 0, STRIP_CELL_W, STRIP_CELL_H);
          });
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.strokeRect(sel.low * STRIP_CELL_W + 0.5, 0.5, (sel.high - sel.low + 1) * STRIP_CELL_W - 1, STRIP_CELL_H - 1);
        }
      }

      const spriteCanvas = spriteRef.current;
      if (spriteCanvas) {
        const ctx = spriteCanvas.getContext('2d');
        const lib = DEFAULT_SPRITE_LIBRARY as Record<string, { pattern: string[]; numShades?: number }>;
        const sprite = lib[spriteKey] || lib.vase;
        if (ctx && sprite && sprite.pattern.length > 0) {
          ctx.clearRect(0, 0, spriteCanvas.width, spriteCanvas.height);
          const spriteShades = sprite.numShades || 5;
          sprite.pattern.forEach((row, y) => {
            row.split('').forEach((ch, x) => {
              if (ch === '.') return;
              const colorIdx = mapIndex(parseChar(ch), spriteShades, rotated.length);
              ctx.fillStyle = rotated[colorIdx];
              ctx.fillRect(x * SPRITE_SCALE, y * SPRITE_SCALE, SPRITE_SCALE, SPRITE_SCALE);
            });
          });
        }
      }
    };

    const tick = (now: number) => {
      if (playing) {
        acc += now - last;
        const step = 1000 / fps;
        while (acc >= step) {
          acc -= step;
          offsetRef.current += 1;
        }
      }
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    };

    draw();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sel, playing, fps, reverse, spriteKey, rowsKey, rows]);

  if (rows.length === 0) return null;

  const handleSwatchClick = (row: number, idx: number) => {
    if (!pending || pending.row !== row) {
      setPending({ row, idx });
      setSel(null);
      return;
    }
    setSel({ row, low: Math.min(pending.idx, idx), high: Math.max(pending.idx, idx) });
    setPending(null);
    setPlaying(true);
    offsetRef.current = 0;
  };

  const handleDownload = () => {
    if (!sel) return;
    void saveFile({
      defaultName: 'pixel-pal-cycle.json',
      filters: [{ name: 'Palette cycle JSON', extensions: ['json'] }],
      data: { text: buildCycleJson(rows[sel.row], [{ low: sel.low, high: sel.high, rate: fps, reverse }]) },
      folderKey: 'json',
    });
  };

  // Reverse of handleDownload (issue #140): match the sidecar's palette
  // against the currently visible rows by exact hex sequence (case-
  // insensitive), since a sidecar carries no row index of its own, only the
  // colors it was exported from. Only the first cycle range is applied; a
  // sidecar can carry more, but the editor only ever holds one selection at
  // a time (see the "Multiple simultaneous cycle ranges" follow-up on #140).
  const handleLoadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCycleJson(text);
      if (!parsed) {
        setLoadError('Not a valid pixel-pal-cycle.json file.');
        return;
      }
      const row = rows.findIndex((r) => r.length === parsed.palette.length
        && r.every((hex, i) => hex.toLowerCase() === parsed.palette[i]));
      if (row === -1) {
        setLoadError('No visible ramp matches this file\'s colors. Its ramp may have changed since export.');
        return;
      }
      const cycle = parsed.cycles[0];
      // Snap to the nearest fixed FPS option: a hand-edited or future sidecar
      // could carry a rate outside FPS_OPTIONS, which would leave the <select>
      // with no matching value selected.
      const nearestFps = FPS_OPTIONS.reduce((best, opt) =>
        Math.abs(opt - cycle.rate) < Math.abs(best - cycle.rate) ? opt : best);
      setLoadError(null);
      setPending(null);
      setSel({ row, low: cycle.low, high: cycle.high });
      setFps(nearestFps);
      setReverse(cycle.reverse);
      setPlaying(true);
      offsetRef.current = 0;
    };
    reader.readAsText(file);
  };

  const stripWidth = sel ? rows[sel.row].length * STRIP_CELL_W : 0;
  const sprite = (DEFAULT_SPRITE_LIBRARY as Record<string, { pattern: string[] }>)[spriteKey];
  const spriteW = sprite ? sprite.pattern[0].length * SPRITE_SCALE : 0;
  const spriteH = sprite ? sprite.pattern.length * SPRITE_SCALE : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {rows.map((row, r) => (
          <div key={r} className="flex gap-px">
            {row.map((hex, i) => {
              const inRange = sel && sel.row === r && i >= sel.low && i <= sel.high;
              const isPending = pending && pending.row === r && pending.idx === i;
              return (
                <button
                  key={i}
                  onClick={() => handleSwatchClick(r, i)}
                  title={hex.toUpperCase()}
                  aria-label={`Ramp ${r + 1} shade ${i + 1}`}
                  style={{
                    background: hex,
                    width: 22,
                    height: 22,
                    outline: (inRange || isPending) ? '2px solid #fff' : 'none',
                    outlineOffset: -2,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => loadInputRef.current?.click()}
          title="Load a previously exported pixel-pal-cycle.json onto a matching visible ramp"
          className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider border-cyan-400 text-cyan-100 hover:bg-cyan-400/20"
        >
          Load Cycle JSON
        </button>
        <input
          ref={loadInputRef}
          type="file"
          accept=".json,application/json"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLoadFile(f); e.target.value = ''; }}
          className="hidden"
        />
      </div>
      {loadError && (
        <p className="text-[11px] text-red-300">{loadError}</p>
      )}

      {!sel && !pending && (
        <p className="text-[11px] text-cyan-100/70 italic">
          Click a swatch to set the cycle start, then a second swatch in the same row to set the end.
        </p>
      )}
      {pending && (
        <p className="text-[11px] text-cyan-100/70 italic">
          Now click the end shade in the same row.
        </p>
      )}

      {sel && (
        <>
          <div className="flex gap-3 flex-wrap items-start">
            <canvas
              ref={stripRef}
              width={stripWidth}
              height={STRIP_CELL_H}
              style={{
                imageRendering: 'pixelated',
                border: `1px solid ${borderColor ?? '#444'}`,
              }}
            />
            <canvas
              ref={spriteRef}
              width={spriteW}
              height={spriteH}
              style={{
                imageRendering: 'pixelated',
                border: `1px solid ${borderColor ?? '#444'}`,
              }}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setPlaying((p) => !p)}
              title={playing ? 'Pause the cycle preview' : 'Play the cycle preview'}
              className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider border-cyan-400 text-cyan-100 hover:bg-cyan-400/20"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <select
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              title="Cycle playback rate"
              className="px-2 py-1 rounded bg-black/60 text-cyan-100 border-2 border-cyan-400 focus:outline-none text-[11px] font-bold uppercase tracking-wider"
            >
              {FPS_OPTIONS.map((n) => <option key={n} value={n}>{n} fps</option>)}
            </select>
            <button
              onClick={() => setReverse((r) => !r)}
              title="Toggle cycle direction"
              className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider border-cyan-400 text-cyan-100 hover:bg-cyan-400/20"
            >
              {reverse ? 'Reverse' : 'Forward'}
            </button>
            <select
              value={spriteKey}
              onChange={(e) => setSpriteKey(e.target.value)}
              title="Sprite shown in the preview"
              className="px-2 py-1 rounded bg-black/60 text-cyan-100 border-2 border-cyan-400 focus:outline-none text-[11px] font-bold uppercase tracking-wider"
            >
              {Object.entries(DEFAULT_SPRITE_LIBRARY).map(([key, entry]) => (
                <option key={key} value={key}>{(entry as { name: string }).name}</option>
              ))}
            </select>
            <button
              onClick={() => { setSel(null); setPending(null); }}
              title="Clear the current selection"
              className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider border-cyan-400 text-cyan-100 hover:bg-cyan-400/20"
            >
              Clear
            </button>
            <button
              onClick={handleDownload}
              title="Download the cycle as a pixel-pal-cycle.json sidecar"
              className="px-2.5 py-1 rounded font-bold border-2 transition-all text-[11px] uppercase tracking-wider bg-cyan-400 text-purple-900 border-cyan-100 hover:bg-cyan-300"
            >
              Download JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
