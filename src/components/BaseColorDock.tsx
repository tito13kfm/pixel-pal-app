import { useRef } from 'react';
import type React from 'react';
import { useBaseDock } from '../hooks/useBaseDock';
import { gridColumns } from '../lib/base-dock';
import { useTheme } from '../contexts';

interface Props {
  baseColors: string[];
  onDelete: (index: number) => void;
  onJump: (index: number) => void;
  cvdMode?: string;
}

// Distinct accent seed so the floating dock keeps a recognizable identity
// against the themed chrome, mirroring the accent pattern used by
// SectionCard / InputPanel (themedAccentBorder + accentGlow around a fixed
// hex seed) rather than reusing raw neon hardcodes.
const ACCENT = '#ff2ec4';

export function BaseColorDock({ baseColors, onDelete, onJump, cvdMode = 'none' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { pos, collapsed, setCollapsed, didDrag, dragHandlers } = useBaseDock(ref);
  const { t, themedAccentBorder, accentGlow } = useTheme();
  const cols = gridColumns(baseColors.length);
  const cvdFilter = cvdMode === 'none' ? 'none' : `url(#cvd-${cvdMode})`;

  const shell: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 30,
    background: t.panelBg, border: `1px solid ${themedAccentBorder(ACCENT)}`, borderRadius: 9,
    boxShadow: accentGlow(ACCENT, 0.33), userSelect: 'none',
  };
  const handle: React.CSSProperties = { touchAction: 'none', cursor: 'grab' };

  if (collapsed) {
    return (
      <div ref={ref} data-testid="base-dock" style={{ ...shell, padding: 6, borderRadius: 20 }}>
        <button
          data-testid="base-dock-expand"
          {...dragHandlers}
          onClick={() => { if (!didDrag.current) setCollapsed(false); }}
          aria-label="Expand base color dock"
          className={t.bodyText}
          style={{ ...handle, display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 0, fontSize: 11 }}
        >
          <div data-testid="base-dock-swatch-grid" style={{ display: 'flex', gap: 5, filter: cvdFilter }}>
            {baseColors.slice(0, 4).map((c, i) => (
              <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c, border: `1px solid ${t.panelBorder}` }} />
            ))}
          </div>
          <span>{baseColors.length} bases</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} data-testid="base-dock" style={{ ...shell, minWidth: 46, paddingBottom: 8 }}>
      <div style={{ position: 'relative' }}>
        <div
          data-testid="base-dock-grip"
          {...dragHandlers}
          title="Drag to move"
          aria-hidden="true"
          style={{ ...handle, display: 'flex', justifyContent: 'center', gap: 3, padding: '5px 0', background: t.panelBgStrong, borderBottom: `1px solid ${themedAccentBorder(ACCENT)}`, borderRadius: '9px 9px 0 0' }}
        >
          <span className={t.panelTextInactive} style={dot()} /><span className={t.panelTextInactive} style={dot()} /><span className={t.panelTextInactive} style={dot()} />
        </div>
        <button
          data-testid="base-dock-collapse"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse base color dock"
          className={t.bodyText}
          style={{ position: 'absolute', top: 2, right: 3, background: 'transparent', border: 0, fontSize: 10, cursor: 'pointer' }}
        >▢</button>
      </div>
      <div data-testid="base-dock-swatch-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, auto)`, gap: 9, padding: '9px 8px 2px', justifyItems: 'center', filter: cvdFilter }}>
        {baseColors.map((hex, i) => (
          <div key={i} data-testid={`swatch-${i}`} title={hex.toUpperCase()} style={{ position: 'relative' }}>
            <button
              data-testid={`jump-${i}`}
              onClick={() => onJump(i)}
              aria-label={`Go to ramp ${i + 1} (${hex.toUpperCase()})`}
              style={{ width: 22, height: 22, borderRadius: 4, background: hex, border: '1px solid rgba(0,0,0,0.5)', cursor: 'pointer', padding: 0 }}
            />
            {baseColors.length > 1 && (
              <button
                data-testid={`delete-${i}`}
                onClick={() => onDelete(i)}
                aria-label={`Remove base color ${i + 1}`}
                style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: ACCENT, color: '#0a0612', fontSize: 10, lineHeight: '12px', border: '1px solid #fff', cursor: 'pointer', padding: 0, fontWeight: 700 }}
              >×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const dot = (): React.CSSProperties => ({ width: 3, height: 3, borderRadius: '50%', background: 'currentColor' });
