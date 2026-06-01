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
  }, [colorKey, view, cell, header, size, n]);

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
    if (i === j) { setReadout(`${colors[i].toUpperCase()} (self)`); return; }
    const d = adjacencyDeltaE(colors[i], colors[j]);
    setReadout(`${colors[i].toUpperCase()} ↔ ${colors[j].toUpperCase()} · ΔE ${d === null ? 'n/a' : d.toFixed(3)}`);
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
        <div className="text-[10px] text-cyan-100/70 font-mono mt-1 h-4" aria-live="polite">{readout || ' '}</div>
      )}
    </div>
  );
}
