// src/components/CrossAdjacencyMatrix.tsx
import React, { useEffect, useRef, useState } from 'react';
import { drawCrossAdjacencyMatrix } from '../lib/strip-export';
import { adjacencyDeltaE, closestCrossPair } from '../lib/viz-interaction';

interface CrossAdjacencyMatrixProps {
  rowColors: string[];   // palette A visible shades (rows)
  colColors: string[];   // palette B visible shades (columns)
  borderColor?: string;
}

// Rectangular cross-palette ΔE_OK heatmap: rows = slot A, columns = slot B.
// Only cross-set pairs are shown (within-palette pairs live in each slot's
// own square adjacency matrix). Dark cells are near-duplicates across the two
// palettes: the silhouette-loss clash signal.
export function CrossAdjacencyMatrix({ rowColors, colColors, borderColor }: CrossAdjacencyMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [readout, setReadout] = useState('');
  const nRows = rowColors.length;
  const nCols = colColors.length;
  const maxW = 340;
  const nMax = Math.max(nRows, nCols);
  const cell = nMax > 0 ? Math.max(4, Math.min(20, Math.floor(maxW / nMax))) : 8;
  const header = Math.max(6, Math.round(cell * 0.5));
  const width = header + nCols * cell;
  const height = header + nRows * cell;
  const colorKey = `${rowColors.join(',')}|${colColors.join(',')}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (nRows > 0 && nCols > 0) drawCrossAdjacencyMatrix(ctx, rowColors, colColors, { cell, header });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on colorKey like AdjacencyMatrix
  }, [colorKey, cell, header, width, height, nRows, nCols]);

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (nRows === 0 || nCols === 0) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * sx - header;
    const cy = (e.clientY - rect.top) * sy - header;
    if (cx < 0 || cy < 0) { setReadout(''); return; }
    const j = Math.floor(cx / cell);
    const i = Math.floor(cy / cell);
    if (i < 0 || j < 0 || i >= nRows || j >= nCols) { setReadout(''); return; }
    const d = adjacencyDeltaE(rowColors[i], colColors[j]);
    setReadout(`A ${rowColors[i].toUpperCase()} ↔ B ${colColors[j].toUpperCase()} · ΔE ${d === null ? 'n/a' : d.toFixed(3)}`);
  };

  if (nRows === 0 || nCols === 0) return null;
  const closest = closestCrossPair(rowColors, colColors);
  return (
    <div>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMove}
        onMouseLeave={() => setReadout('')}
        style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto', display: 'block', border: `1px solid ${borderColor ?? '#444'}` }}
      />
      <div className="text-[10px] text-cyan-100/70 font-mono mt-1 h-4" aria-live="polite">{readout || ' '}</div>
      {closest && (
        <div className="text-[10px] text-cyan-100/60 font-mono mt-0.5">
          Closest cross-pair: A {closest.a.toUpperCase()} ↔ B {closest.b.toUpperCase()} · ΔE {closest.dE.toFixed(3)}
        </div>
      )}
    </div>
  );
}
