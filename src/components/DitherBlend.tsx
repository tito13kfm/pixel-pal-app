// src/components/DitherBlend.tsx
import { useEffect, useRef } from 'react';
import { drawDitherBlend } from '../lib/strip-export';
import { type DitherPattern } from '../lib/viz-interaction';

interface DitherBlendProps {
  rows: string[][];
  pattern: DitherPattern;
  compact: boolean;
  borderColor?: string;
}

export function DitherBlend({ rows, pattern, compact, borderColor }: DitherBlendProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowH = compact ? 26 : 38;
  const solidW = compact ? 30 : 44;
  const blendW = compact ? 20 : 28;
  const sub = 8;
  const maxCells = rows.reduce((m, row) => Math.max(m, row.length), 0);
  const width = maxCells > 0 ? maxCells * solidW + Math.max(0, maxCells - 1) * blendW : 1;
  const height = rows.length > 0 ? rows.length * rowH : 1;
  const rowsKey = JSON.stringify(rows);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (rows.length > 0) drawDitherBlend(ctx, rows, { pattern, rowH, solidW, blendW, sub });
  }, [rowsKey, pattern, rowH, solidW, blendW, width, height]);

  if (rows.length === 0) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto', display: 'block', border: `1px solid ${borderColor ?? '#444'}` }}
    />
  );
}
