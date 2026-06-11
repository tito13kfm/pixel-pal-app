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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [basesKey, pattern, cell, header, size, n]);
}
