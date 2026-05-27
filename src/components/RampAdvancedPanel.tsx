import React from 'react';
import type { CurvePresetSerialized, GamutStrategySerialized } from '../lib/palette';

interface RampAdvancedPanelProps {
  open: boolean;
  curve: CurvePresetSerialized;
  gamut: GamutStrategySerialized;
  sizeLocked?: boolean;
  onToggle: () => void;
  onCurveChange: (c: CurvePresetSerialized) => void;
  onGamutChange: (g: GamutStrategySerialized) => void;
}

const CURVES: CurvePresetSerialized[] = ['linear', 'eased', 's-curve', 'ease-in', 'ease-out'];
const GAMUTS: GamutStrategySerialized[] = ['auto', 'clip', 'chroma-preserve'];

export const RampAdvancedPanel: React.FC<RampAdvancedPanelProps> = ({
  open, curve, gamut, sizeLocked, onToggle, onCurveChange, onGamutChange,
}) => {
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: 6 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          background: 'transparent',
          color: open ? '#ffea00' : '#888',
          border: 'none',
          cursor: 'pointer',
          fontSize: 11,
          padding: 0,
          fontFamily: 'monospace',
        }}
      >
        {open ? '▾' : '▸'} Advanced
      </button>
      {open && (
        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', padding: 8, marginTop: 6, fontSize: 11, fontFamily: 'monospace' }}>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
            <span style={{ color: '#bbb' }}>Curve preset</span>
            <select value={curve} onChange={e => onCurveChange(e.target.value as CurvePresetSerialized)} style={{ minWidth: 120 }}>
              {CURVES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
            <span style={{ color: '#bbb' }}>Gamut strategy</span>
            <select value={gamut} onChange={e => onGamutChange(e.target.value as GamutStrategySerialized)} style={{ minWidth: 120 }}>
              {GAMUTS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          {sizeLocked && (
            <div style={{ fontSize: 10, color: '#ff9966', marginTop: 4 }}>
              Size locked while old-engine shades are pinned. Clear pins to unlock.
            </div>
          )}
          <div style={{ fontSize: 9, color: '#777', lineHeight: 1.3, marginTop: 6 }}>
            Curve shapes shadow→highlight transition. Gamut handles out-of-sRGB colors from saturated bases.
          </div>
        </div>
      )}
    </div>
  );
};
