import { useState, useRef, useEffect, useCallback } from 'react';
import { getStamp, applyStamp } from '../lib/pixel-brush';
import type { BrushShape, BrushSize } from '../lib/pixel-brush';

interface PixelPlaygroundProps {
  ramps: string[][];
  theme: { glowStrong: number; text: string };
}

const CANVAS_W = 64;
const CANVAS_H = 64;
const SCALE = 8;
const MAX_UNDO = 20;
const BLANK: (number | null)[] = Array(CANVAS_W * CANVAS_H).fill(null);

function encodeColor(r: number, s: number): number {
  return r * 256 + s;
}

function decodeColor(v: number): { r: number; s: number } {
  return { r: Math.floor(v / 256), s: v % 256 };
}

export function PixelPlayground({ ramps, theme }: PixelPlaygroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pixels, setPixels] = useState<(number | null)[]>(() => BLANK.slice());
  const [undoStack, setUndoStack] = useState<(number | null)[][]>([]);
  const [activeColor, setActiveColor] = useState<{ r: number; s: number }>({ r: 0, s: 0 });
  const [brushShape, setBrushShape] = useState<BrushShape>('circle');
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const isDrawing = useRef(false);
  const strokeStart = useRef<(number | null)[] | null>(null);

  // Render pixels to canvas whenever pixels or ramps change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W * SCALE, CANVAS_H * SCALE);
    for (let y = 0; y < CANVAS_H; y++) {
      for (let x = 0; x < CANVAS_W; x++) {
        const val = pixels[y * CANVAS_W + x];
        if (val === null) continue;
        const { r, s } = decodeColor(val);
        // Stale pixel: ramp deleted or shade count reduced -> transparent (skip)
        if (r >= ramps.length || s >= ramps[r].length) continue;
        ctx.fillStyle = ramps[r][s];
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
  }, [pixels, ramps]);

  const getCanvasPixel = useCallback((e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / SCALE);
    const y = Math.floor((e.clientY - rect.top) / SCALE);
    return { x: Math.max(0, Math.min(CANVAS_W - 1, x)), y: Math.max(0, Math.min(CANVAS_H - 1, y)) };
  }, []);

  const paint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPixel(e);
    const isErase = e.buttons === 2;
    const value = isErase ? null : encodeColor(activeColor.r, activeColor.s);
    const stamp = getStamp(brushShape, brushSize);
    setPixels(prev => applyStamp(prev, x, y, stamp, value, CANVAS_W, CANVAS_H));
  }, [activeColor, brushShape, brushSize, getCanvasPixel]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawing.current = true;
    strokeStart.current = pixels.slice();
    paint(e);
  }, [paint, pixels]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    paint(e);
  }, [paint]);

  const endStroke = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    if (strokeStart.current) {
      setUndoStack(prev => {
        const next = [...prev, strokeStart.current!];
        return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
      });
      strokeStart.current = null;
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setPixels(undoStack[undoStack.length - 1]);
    setUndoStack(s => s.slice(0, -1));
  }, [undoStack]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo]);

  const handleClear = useCallback(() => {
    setUndoStack(prev => {
      const next = [...prev, pixels.slice()];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
    setPixels(BLANK.slice());
  }, [pixels]);

  const canUndo = undoStack.length > 0;
  const buttonBase = `px-3 py-1 rounded text-xs font-medium transition-colors`;
  const isDark = theme.glowStrong > 0.5;
  const btnActive = isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-800';
  const btnSelected = isDark ? 'bg-cyan-500/30 text-cyan-200 ring-1 ring-cyan-400' : 'bg-cyan-500/20 text-cyan-700 ring-1 ring-cyan-500';

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-medium ${isDark ? 'text-white/50' : 'text-black/50'}`}>Shape:</span>
        {(['circle', 'square'] as BrushShape[]).map(s => (
          <button key={s} onClick={() => setBrushShape(s)}
            className={`${buttonBase} ${brushShape === s ? btnSelected : btnActive}`}>
            {s}
          </button>
        ))}
        <span className={`ml-2 text-xs font-medium ${isDark ? 'text-white/50' : 'text-black/50'}`}>Size:</span>
        {([1, 2, 4] as BrushSize[]).map(n => (
          <button key={n} onClick={() => setBrushSize(n)}
            className={`${buttonBase} ${brushSize === n ? btnSelected : btnActive}`}>
            {n}px
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={handleUndo} disabled={!canUndo}
          className={`${buttonBase} ${canUndo ? btnActive : `opacity-30 cursor-not-allowed ${btnActive}`}`}>
          Undo
        </button>
        <button onClick={handleClear} className={`${buttonBase} ${btnActive}`}>
          Clear
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W * SCALE}
        height={CANVAS_H * SCALE}
        style={{ imageRendering: 'pixelated', cursor: 'crosshair', display: 'block' }}
        className={`border ${isDark ? 'border-white/10' : 'border-black/10'} rounded`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endStroke}
        onMouseLeave={endStroke}
        onContextMenu={e => e.preventDefault()}
      />

      {/* Color picker: ramps as rows of swatches */}
      <div className="space-y-1">
        {ramps.map((ramp, rIdx) => (
          <div key={rIdx} className="flex gap-1">
            {ramp.map((hex, sIdx) => {
              const isActive = activeColor.r === rIdx && activeColor.s === sIdx;
              return (
                <button
                  key={sIdx}
                  onClick={() => setActiveColor({ r: rIdx, s: sIdx })}
                  title={`Ramp ${rIdx + 1}, shade ${sIdx + 1}: ${hex}`}
                  style={{ backgroundColor: hex, width: 20, height: 20 }}
                  className={`rounded-sm transition-all ${isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent' : 'hover:scale-110'}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
