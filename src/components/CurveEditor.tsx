import React, { useEffect, useRef, useState } from 'react';
import { evalCurve, activePreset } from '../lib/curve';
import type { CurvePoints } from '../lib/curve';

export interface CurveEditorProps {
  points: CurvePoints;
  onChange: (pts: CurvePoints) => void;
  presets: Record<string, CurvePoints>;
  color: string;
  yMin?: number;
  yMax?: number;
  fixedEndpoints?: boolean;
  height?: number;
}

const SAMPLES = 60;
const HIT_R   = 10;   // SVG units
const CLICK_D = 4;    // SVG units — squared = 16
const MAX_MID = 4;    // max interior (non-endpoint) anchors

export function CurveEditor({
  points,
  onChange,
  presets,
  color,
  yMin = 0,
  yMax = 1,
  fixedEndpoints = false,
  height = 80,
}: CurveEditorProps) {
  const svgRef  = useRef<SVGSVGElement>(null);
  const [svgW, setSvgW] = useState(200);
  const dragging = useRef<number | null>(null);
  const clickStart = useRef<{ sx: number; sy: number; t: number; v: number } | null>(null);

  const H      = height;
  const yRange = yMax - yMin;

  // Track actual rendered width to avoid viewBox distortion on anchor circles
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => setSvgW(entries[0].contentRect.width));
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  // Map curve coords → SVG pixel coords
  function toPx(t: number, v: number) {
    return { x: t * svgW, y: H - ((v - yMin) / yRange) * H };
  }

  // Map SVG pixel coords → curve coords
  function fromPx(sx: number, sy: number) {
    return {
      t: Math.max(0, Math.min(1, sx / svgW)),
      v: Math.max(yMin, Math.min(yMax, yMax - (sy / H) * yRange)),
    };
  }

  function clientToPx(clientX: number, clientY: number) {
    const r = svgRef.current!.getBoundingClientRect();
    return { sx: clientX - r.left, sy: clientY - r.top };
  }

  function hitTest(sx: number, sy: number): number {
    for (let i = 0; i < points.length; i++) {
      if (fixedEndpoints && (i === 0 || i === points.length - 1)) continue;
      const { x, y } = toPx(points[i].t, points[i].v);
      const dx = sx - x, dy = sy - y;
      if (dx * dx + dy * dy < HIT_R * HIT_R) return i;
    }
    return -1;
  }

  function buildPath(): string {
    return Array.from({ length: SAMPLES }, (_, i) => {
      const t      = i / (SAMPLES - 1);
      const v      = evalCurve(points, t, yMin, yMax);
      const { x, y } = toPx(t, v);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  function handlePointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.preventDefault();
    const { sx, sy } = clientToPx(e.clientX, e.clientY);
    const idx = hitTest(sx, sy);
    if (idx >= 0) {
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = idx;
      clickStart.current = null;
    } else {
      const { t, v } = fromPx(sx, sy);
      clickStart.current = { sx, sy, t, v };
    }
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (dragging.current === null) return;
    const { sx, sy } = clientToPx(e.clientX, e.clientY);
    const { t, v }   = fromPx(sx, sy);
    const idx        = dragging.current;
    const newPts     = [...points];
    const isEndpoint = idx === 0 || idx === points.length - 1;

    if (isEndpoint && !fixedEndpoints) {
      // Sat endpoints: v moves freely, t stays clamped to 0 or 1
      newPts[idx] = { t: idx === 0 ? 0 : 1, v };
    } else if (!isEndpoint) {
      // Off-edge drag → delete midpoint
      if (sy < -10 || sy > H + 10) {
        newPts.splice(idx, 1);
        dragging.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onChange(newPts);
        return;
      }
      // Stay sorted relative to neighbours
      const minT = points[idx - 1].t + 0.01;
      const maxT = points[idx + 1].t - 0.01;
      newPts[idx] = { t: Math.max(minT, Math.min(maxT, t)), v };
    }

    onChange(newPts);
    clickStart.current = null;
  }

  function handlePointerUp(e: React.PointerEvent<SVGSVGElement>) {
    dragging.current = null;
    if (clickStart.current) {
      const { sx, sy } = clientToPx(e.clientX, e.clientY);
      const dx = sx - clickStart.current.sx;
      const dy = sy - clickStart.current.sy;
      if (dx * dx + dy * dy < CLICK_D * CLICK_D) {
        // Click on empty canvas: add midpoint if under cap
        const midCount = points.length - 2;
        const { t, v } = clickStart.current;
        if (midCount < MAX_MID && t > 0.01 && t < 0.99) {
          onChange([...points, { t, v }].sort((a, b) => a.t - b.t));
        }
      }
      clickStart.current = null;
    }
  }

  function handleContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault();
    const { sx, sy } = clientToPx(e.clientX, e.clientY);
    const idx = hitTest(sx, sy);
    if (idx > 0 && idx < points.length - 1) {
      onChange(points.filter((_, i) => i !== idx));
    }
  }

  const currentPreset = activePreset(points, presets);
  const neutralSy     = H - ((1 - yMin) / yRange) * H; // y-position of v=1.0

  return (
    <div style={{ userSelect: 'none' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        style={{ display: 'block', background: '#0a0a0a', borderRadius: 3, border: '1px solid #333', cursor: 'crosshair', overflow: 'visible' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {/* Neutral reference line — only for sat curve (yMax > 1) */}
        {yMax > 1 && (
          <line x1={0} y1={neutralSy} x2={svgW} y2={neutralSy}
            stroke="#2a2a2a" strokeWidth={0.5} strokeDasharray="4 4" />
        )}

        {/* Curve */}
        <path d={buildPath()} stroke={color} strokeWidth={1.5} fill="none" />

        {/* Anchors */}
        {points.map((p, i) => {
          const { x, y } = toPx(p.t, p.v);
          const isFixed  = fixedEndpoints && (i === 0 || i === points.length - 1);
          return (
            <circle key={p.t.toFixed(4)} cx={x} cy={y}
              r={isFixed ? 3 : 6}
              fill={isFixed ? 'none' : '#fff'}
              stroke={color}
              strokeWidth={1.5}
              opacity={isFixed ? 0.35 : 1}
              style={{ cursor: isFixed ? 'default' : 'grab', pointerEvents: isFixed ? 'none' : 'auto' }}
            />
          );
        })}
      </svg>

      {/* Preset chips */}
      <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
        {Object.keys(presets).map(key => {
          const active = currentPreset === key;
          return (
            <span key={key} onClick={() => onChange(presets[key])} style={{
              background:  active ? `${color}22` : '#222',
              border:      `1px solid ${active ? `${color}66` : '#444'}`,
              padding:     '2px 5px',
              borderRadius: 3,
              color:       active ? color : '#777',
              fontSize:    11,
              cursor:      'pointer',
              fontFamily:  'monospace',
            }}>
              {key}{active ? ' ✓' : ''}
            </span>
          );
        })}
      </div>
    </div>
  );
}
