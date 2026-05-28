import { useState, useRef, useEffect, useCallback } from 'react';
import { Pencil, Eraser, PaintBucket, Pipette, Minus, Square, Circle, RotateCcw, Trash2 } from 'lucide-react';
import { getStamp, applyStamp } from '../lib/pixel-brush';
import type { BrushShape, BrushSize } from '../lib/pixel-brush';

type Tool = 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'ellipse';

interface PixelPlaygroundProps {
  ramps: string[][];
  theme: { glowStrong: number; text: string };
}

const CANVAS_W = 64;
const CANVAS_H = 64;
const SCALE = 8;
const MAX_UNDO = 20;
const BLANK: (number | null)[] = Array(CANVAS_W * CANVAS_H).fill(null);
const BG_COLOR = '#f5f5f0';

function encodeColor(r: number, s: number): number { return r * 256 + s; }
function decodeColor(v: number): { r: number; s: number } { return { r: Math.floor(v / 256), s: v % 256 }; }

function linePixels(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  for (;;) {
    pts.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
  return pts;
}

function rectPixels(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const xMin = Math.min(x0, x1), xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1), yMax = Math.max(y0, y1);
  const pts: { x: number; y: number }[] = [];
  for (let x = xMin; x <= xMax; x++) { pts.push({ x, y: yMin }); if (yMin !== yMax) pts.push({ x, y: yMax }); }
  for (let y = yMin + 1; y < yMax; y++) { pts.push({ x: xMin, y }); if (xMin !== xMax) pts.push({ x: xMax, y }); }
  return pts;
}

function ellipsePixels(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const xMin = Math.min(x0, x1), xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1), yMax = Math.max(y0, y1);
  const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
  const a = (xMax - xMin) / 2, b = (yMax - yMin) / 2;
  const seen = new Set<string>();
  const pts: { x: number; y: number }[] = [];
  const steps = Math.ceil(Math.max(a, b) * Math.PI * 4) + 8;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const px = Math.round(cx + a * Math.cos(t));
    const py = Math.round(cy + b * Math.sin(t));
    const key = `${px},${py}`;
    if (!seen.has(key)) { seen.add(key); pts.push({ x: px, y: py }); }
  }
  return pts;
}

function floodFill(
  pixels: (number | null)[],
  startX: number, startY: number,
  value: number | null,
  w: number, h: number
): (number | null)[] {
  const target = pixels[startY * w + startX];
  if (target === value) return pixels;
  const result = pixels.slice();
  const visited = new Uint8Array(w * h);
  const stack = [startY * w + startX];
  while (stack.length) {
    const idx = stack.pop()!;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (result[idx] !== target) continue;
    result[idx] = value;
    const x = idx % w, y = Math.floor(idx / w);
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  return result;
}

export function PixelPlayground({ ramps, theme }: PixelPlaygroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pixels, setPixels] = useState<(number | null)[]>(() => BLANK.slice());
  const [undoStack, setUndoStack] = useState<(number | null)[][]>([]);
  const [activeColor, setActiveColor] = useState<{ r: number; s: number }>({ r: 0, s: 0 });
  const [brushShape, setBrushShape] = useState<BrushShape>('circle');
  const [brushSize, setBrushSize] = useState<BrushSize>(1);
  const [tool, setTool] = useState<Tool>('pencil');

  const isDrawing = useRef(false);
  const strokeStart = useRef<(number | null)[] | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<{ x: number; y: number }[]>([]);
  const [draft, setDraftState] = useState<{ x: number; y: number }[]>([]);

  const setDraft = useCallback((pts: { x: number; y: number }[]) => {
    draftRef.current = pts;
    setDraftState(pts);
  }, []);

  // Clamp activeColor when ramps shrink
  useEffect(() => {
    if (ramps.length === 0) return;
    setActiveColor(prev => {
      const r = Math.min(prev.r, ramps.length - 1);
      const s = Math.min(prev.s, ramps[r].length - 1);
      return prev.r === r && prev.s === s ? prev : { r, s };
    });
  }, [ramps]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, CANVAS_W * SCALE, CANVAS_H * SCALE);
    for (let y = 0; y < CANVAS_H; y++) {
      for (let x = 0; x < CANVAS_W; x++) {
        const val = pixels[y * CANVAS_W + x];
        if (val === null) continue;
        const { r, s } = decodeColor(val);
        if (r >= ramps.length || s >= ramps[r].length) continue;
        ctx.fillStyle = ramps[r][s];
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    if (draft.length > 0 && ramps[activeColor.r]) {
      const hex = ramps[activeColor.r][activeColor.s];
      if (hex) {
        ctx.fillStyle = hex;
        for (const { x, y } of draft) {
          if (x >= 0 && x < CANVAS_W && y >= 0 && y < CANVAS_H)
            ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
    }
  }, [pixels, ramps, draft, activeColor]);

  const getCanvasPixel = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / SCALE);
    const y = Math.floor((e.clientY - rect.top) / SCALE);
    return { x: Math.max(0, Math.min(CANVAS_W - 1, x)), y: Math.max(0, Math.min(CANVAS_H - 1, y)) };
  }, []);

  const applyStroke = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasPixel(e);
    const isErase = tool === 'eraser' || e.buttons === 2;
    const value = isErase ? null : encodeColor(activeColor.r, activeColor.s);
    setPixels(prev => applyStamp(prev, x, y, getStamp(brushShape, brushSize), value, CANVAS_W, CANVAS_H));
  }, [tool, activeColor, brushShape, brushSize, getCanvasPixel]);

  const pushUndo = useCallback((snapshot: (number | null)[]) => {
    setUndoStack(prev => {
      const next = [...prev, snapshot];
      return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getCanvasPixel(e);
    const isRightClick = e.button === 2;

    if (isRightClick || tool === 'pencil' || tool === 'eraser') {
      isDrawing.current = true;
      strokeStart.current = pixels.slice();
      applyStroke(e);
    } else if (tool === 'fill') {
      pushUndo(pixels.slice());
      setPixels(prev => floodFill(prev, x, y, encodeColor(activeColor.r, activeColor.s), CANVAS_W, CANVAS_H));
    } else if (tool === 'eyedropper') {
      const val = pixels[y * CANVAS_W + x];
      if (val !== null) {
        const { r, s } = decodeColor(val);
        if (r < ramps.length && s < ramps[r].length) setActiveColor({ r, s });
      }
    } else {
      dragStart.current = { x, y };
      const pts = tool === 'line' ? linePixels(x, y, x, y)
        : tool === 'rect' ? rectPixels(x, y, x, y)
        : ellipsePixels(x, y, x, y);
      setDraft(pts);
    }
  }, [tool, pixels, activeColor, ramps, getCanvasPixel, applyStroke, pushUndo, setDraft]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing.current) {
      applyStroke(e);
    } else if (dragStart.current) {
      const { x, y } = getCanvasPixel(e);
      const { x: sx, y: sy } = dragStart.current;
      const pts = tool === 'line' ? linePixels(sx, sy, x, y)
        : tool === 'rect' ? rectPixels(sx, sy, x, y)
        : ellipsePixels(sx, sy, x, y);
      setDraft(pts);
    }
  }, [tool, getCanvasPixel, applyStroke, setDraft]);

  const endStroke = useCallback(() => {
    if (dragStart.current !== null) {
      const pts = draftRef.current;
      if (pts.length > 0) {
        pushUndo(pixels.slice());
        const value = encodeColor(activeColor.r, activeColor.s);
        setPixels(prev => {
          const next = prev.slice();
          for (const { x, y } of pts) {
            if (x >= 0 && x < CANVAS_W && y >= 0 && y < CANVAS_H)
              next[y * CANVAS_W + x] = value;
          }
          return next;
        });
      }
      setDraft([]);
      dragStart.current = null;
    } else if (isDrawing.current) {
      isDrawing.current = false;
      if (strokeStart.current) {
        pushUndo(strokeStart.current);
        strokeStart.current = null;
      }
    }
  }, [pixels, activeColor, pushUndo, setDraft]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setPixels(undoStack[undoStack.length - 1]);
    setUndoStack(s => s.slice(0, -1));
  }, [undoStack]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo]);

  const handleClear = useCallback(() => {
    pushUndo(pixels.slice());
    setPixels(BLANK.slice());
  }, [pixels, pushUndo]);

  const canUndo = undoStack.length > 0;
  const isDark = theme.glowStrong > 0.5;
  const iconBtn = `p-2 rounded transition-colors flex items-center justify-center`;
  const iconBtnOff = isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/10 hover:bg-black/20 text-gray-800';
  const iconBtnOn = isDark ? 'bg-cyan-500/30 text-cyan-200 ring-1 ring-cyan-400' : 'bg-cyan-500/20 text-cyan-700 ring-1 ring-cyan-500';
  const textBtn = `px-3 py-1.5 rounded text-sm font-medium transition-colors w-full text-left`;
  const labelCls = `text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-white/40' : 'text-black/40'}`;
  const divider = `border-t my-2 ${isDark ? 'border-white/10' : 'border-black/10'}`;

  const toolDefs: { id: Tool; icon: React.ReactNode; title: string }[] = [
    { id: 'pencil',     icon: <Pencil size={15} />,     title: 'Pencil' },
    { id: 'eraser',     icon: <Eraser size={15} />,     title: 'Eraser' },
    { id: 'fill',       icon: <PaintBucket size={15} />, title: 'Fill' },
    { id: 'eyedropper', icon: <Pipette size={15} />,    title: 'Eyedropper' },
    { id: 'line',       icon: <Minus size={15} />,      title: 'Line' },
    { id: 'rect',       icon: <Square size={15} />,     title: 'Rectangle' },
    { id: 'ellipse',    icon: <Circle size={15} />,     title: 'Ellipse' },
  ];

  const showBrush = tool === 'pencil' || tool === 'eraser';

  return (
    <div className="flex gap-4 items-start">

      {/* Left: Tools */}
      <div className="flex flex-col gap-1" style={{ minWidth: 88 }}>
        <div className={labelCls}>Tools</div>
        <div className="grid grid-cols-2 gap-1">
          {toolDefs.map(({ id, icon, title }) => (
            <button key={id} onClick={() => setTool(id)} title={title}
              className={`${iconBtn} ${tool === id ? iconBtnOn : iconBtnOff}`}>
              {icon}
            </button>
          ))}
        </div>

        {showBrush && (<>
          <div className={divider} />
          <div className={labelCls}>Size</div>
          {([1, 2, 4] as BrushSize[]).map(n => (
            <button key={n} onClick={() => setBrushSize(n)}
              className={`${textBtn} ${brushSize === n ? iconBtnOn : iconBtnOff}`}>
              {n}px
            </button>
          ))}
          <div className={divider} />
          <div className={labelCls}>Shape</div>
          {(['circle', 'square'] as BrushShape[]).map(s => (
            <button key={s} onClick={() => setBrushShape(s)}
              className={`${textBtn} ${brushShape === s ? iconBtnOn : iconBtnOff}`}>
              {s}
            </button>
          ))}
        </>)}

        <div className={divider} />
        <button onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)"
          className={`${iconBtn} gap-1.5 text-sm ${canUndo ? iconBtnOff : `opacity-30 cursor-not-allowed ${iconBtnOff}`}`}>
          <RotateCcw size={14} /> Undo
        </button>
        <button onClick={handleClear} title="Clear canvas"
          className={`${iconBtn} gap-1.5 text-sm ${iconBtnOff}`}>
          <Trash2 size={14} /> Clear
        </button>
      </div>

      {/* Center: Canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_W * SCALE}
        height={CANVAS_H * SCALE}
        style={{ imageRendering: 'pixelated', cursor: tool === 'eyedropper' ? 'crosshair' : 'crosshair', display: 'block', flexShrink: 0 }}
        className="border border-black/30 rounded"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endStroke}
        onMouseLeave={endStroke}
        onContextMenu={e => e.preventDefault()}
      />

      {/* Right: Palette - ramps as vertical columns */}
      <div className="flex flex-col gap-1 flex-1">
        <div className={labelCls}>Palette</div>
        <div className="flex gap-1 flex-wrap">
          {ramps.map((ramp, rIdx) => (
            <div key={rIdx} className="flex flex-col gap-0.5">
              {ramp.map((hex, sIdx) => {
                const isActive = activeColor.r === rIdx && activeColor.s === sIdx;
                return (
                  <button
                    key={sIdx}
                    onClick={() => { setActiveColor({ r: rIdx, s: sIdx }); if (tool === 'eyedropper') setTool('pencil'); }}
                    title={`Ramp ${rIdx + 1}, shade ${sIdx + 1}: ${hex}`}
                    style={{ backgroundColor: hex, width: 26, height: 26 }}
                    className={`rounded-sm transition-all ${isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-transparent scale-110' : 'hover:scale-110'}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
