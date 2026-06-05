// src/components/CrossRampDither.tsx
import React, { useEffect, useRef, useState } from 'react';
import { drawCrossRampDither } from '../lib/strip-export';
import { type DitherPattern } from '../lib/viz-interaction';

interface CrossRampDitherProps {
  bases: string[];          // one representative hue per ramp (base colors)
  names?: string[];         // optional per-base labels (aligned to bases)
  pattern: DitherPattern;
  compact: boolean;
  borderColor?: string;
}

// N×N grid of 50/50 dither blends between every pair of ramp base colors (#46).
// Mirrors AdjacencyMatrix: same header/cell sizing + hover-readout pattern, but
// each off-diagonal cell is a dither blend instead of a pair-split/heatmap cell.
export function CrossRampDither({
  bases, names, pattern, compact, borderColor,
}: CrossRampDitherProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [readout, setReadout] = useState('');
  const n = bases.length;
  const maxW = compact ? 180 : 340;
  const cell = n > 0 ? Math.max(8, Math.min(compact ? 18 : 40, Math.floor(maxW / n))) : 8;
  const header = Math.max(6, Math.round(cell * 0.4));
  const size = header + n * cell;
  const basesKey = bases.join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, size);
    canvas.height = Math.max(1, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (n > 0) drawCrossRampDither(ctx, bases, { cell, pattern, header });
  }, [basesKey, pattern, cell, header, size, n]);

  const label = (i: number) => (names && names[i]) || `Ramp ${i + 1}`;

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (compact || n === 0) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * sx - header;
    const cy = (e.clientY - rect.top) * sy - header;
    if (cx < 0 || cy < 0) { setReadout(''); return; }
    const j = Math.floor(cx / cell);
    const i = Math.floor(cy / cell);
    if (i < 0 || j < 0 || i >= n || j >= n) { setReadout(''); return; }
    if (i === j) { setReadout(`${label(i)} ${bases[i].toUpperCase()} (self)`); return; }
    setReadout(`${label(i)} ${bases[i].toUpperCase()} × ${label(j)} ${bases[j].toUpperCase()} (dither blend)`);
  };

  if (n === 0) return null;
  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setReadout('')}
        style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto', display: 'block', border: `1px solid ${borderColor ?? '#444'}` }}
      />
      {!compact && (
        <div className="text-[10px] text-cyan-100/70 font-mono mt-1 h-4" aria-live="polite">{readout || ' '}</div>
      )}
    </div>
  );
}
