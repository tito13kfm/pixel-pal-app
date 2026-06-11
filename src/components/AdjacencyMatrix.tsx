// src/components/AdjacencyMatrix.tsx
import React, { useEffect, useRef, useState } from 'react';
import { drawAdjacencyMatrix } from '../lib/strip-export';
import { adjacencyDeltaE, matrixColors, type MatrixColorSet, type MatrixView } from '../lib/viz-interaction';

interface AdjacencyMatrixProps {
  allColors: string[];
  bases: string[];
  colorSet: MatrixColorSet;
  view: MatrixView;       // caller passes 'heatmap' for compact slots
  compact: boolean;
  borderColor?: string;
}

export function AdjacencyMatrix({
  allColors, bases, colorSet, view, compact, borderColor,
}: AdjacencyMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [readout, setReadout] = useState('');
  const colors = matrixColors(colorSet, allColors, bases);
  const n = colors.length;
  const maxW = compact ? 180 : 340;
  const cell = n > 0 ? Math.max(4, Math.min(compact ? 14 : 24, Math.floor(maxW / n))) : 8;
  const header = Math.max(6, Math.round(cell * 0.5));
  const size = header + n * cell;
  const colorKey = colors.join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, size);
    canvas.height = Math.max(1, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (n > 0) drawAdjacencyMatrix(ctx, colors, { cell, view, header });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [colorKey, view, cell, header, size, n]);
}
