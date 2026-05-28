import React from 'react';
import { CurveEditor } from './CurveEditor';
import { LIGHTNESS_PRESETS, SAT_PRESETS } from '../lib/curve';
import type { CurvePoints } from '../lib/curve';
import type { GamutStrategySerialized } from '../lib/palette';

interface RampAdvancedPanelProps {
  open: boolean;
  lightnessCurve: CurvePoints;
  satCurve: CurvePoints;
  gamut: GamutStrategySerialized;
  sizeLocked?: boolean;
  onToggle: () => void;
  onLightnessCurveChange: (pts: CurvePoints) => void;
  onSatCurveChange: (pts: CurvePoints) => void;
  onGamutChange: (g: GamutStrategySerialized) => void;
}

const GAMUTS: GamutStrategySerialized[] = ['auto', 'clip', 'chroma-preserve'];

export const RampAdvancedPanel: React.FC<RampAdvancedPanelProps> = ({
  open, lightnessCurve, satCurve, gamut, sizeLocked,
  onToggle, onLightnessCurveChange, onSatCurveChange, onGamutChange,
}) => {
  return (
    <div style={{ marginTop: 8, borderTop: '1px dashed rgba(255,255,255,0.15)', paddingTop: 6 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ background: 'transparent', color: open ? '#ffea00' : '#888', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'monospace' }}
      >
        {open ? '▾' : '▸'} Advanced
      </button>

      {open && (
        <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.1)', padding: 8, marginTop: 6, fontSize: 12, fontFamily: 'monospace' }}>

          <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>LIGHTNESS CURVE</div>
          <CurveEditor
            points={lightnessCurve}
            onChange={onLightnessCurveChange}
            presets={LIGHTNESS_PRESETS}
            color="#ffea00"
            yMin={0}
            yMax={1}
            fixedEndpoints={true}
            height={120}
          />

          <div style={{ color: '#666', fontSize: 11, marginBottom: 4, marginTop: 12 }}>SATURATION CURVE</div>
          <CurveEditor
            points={satCurve}
            onChange={onSatCurveChange}
            presets={SAT_PRESETS}
            color="#ff9966"
            yMin={0}
            yMax={2}
            fixedEndpoints={false}
            height={100}
          />

          <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#bbb' }}>Gamut strategy</span>
              <select value={gamut} onChange={e => onGamutChange(e.target.value as GamutStrategySerialized)} style={{ minWidth: 120 }}>
                {GAMUTS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>

          {sizeLocked && (
            <div style={{ fontSize: 11, color: '#ff9966', marginTop: 4 }}>
              Size locked while old-engine shades are pinned. Clear pins to unlock.
            </div>
          )}
          <div style={{ fontSize: 11, color: '#777', lineHeight: 1.3, marginTop: 6 }}>
            Drag curve anchors. Click empty area to add. Right-click or drag off-edge to delete.
          </div>
        </div>
      )}
    </div>
  );
};
