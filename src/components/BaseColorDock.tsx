import { useRef } from 'react';
import { useBaseDock } from '../hooks/useBaseDock';

interface Props {
  baseColors: string[];
  onDelete: (index: number) => void;
  onJump: (index: number) => void;
}

const NEON = '#ff2ec4';
const PANEL = 'linear-gradient(180deg,#240a33,#16091f)';

export function BaseColorDock({ baseColors, onDelete, onJump }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const { pos, collapsed, setCollapsed, dragHandlers } = useBaseDock(ref);

  const shell: React.CSSProperties = {
    position: 'fixed', left: pos.x, top: pos.y, zIndex: 30,
    background: PANEL, border: `1px solid ${NEON}`, borderRadius: 9,
    boxShadow: '0 0 18px rgba(255,46,196,0.33)', userSelect: 'none',
  };
  const handle: React.CSSProperties = { touchAction: 'none', cursor: 'grab' };

  if (collapsed) {
    return (
      <div ref={ref} data-testid="base-dock" style={{ ...shell, padding: 6, borderRadius: 20 }}>
        <button
          data-testid="base-dock-expand"
          {...dragHandlers}
          onClick={() => setCollapsed(false)}
          aria-label="Expand base color dock"
          style={{ ...handle, display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 0, color: '#22e0ff', fontSize: 11 }}
        >
          {baseColors.slice(0, 4).map((c, i) => (
            <span key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
          ))}
          <span>{baseColors.length} bases</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} data-testid="base-dock" style={{ ...shell, width: 46, paddingBottom: 8 }}>
      <div style={{ position: 'relative' }}>
        <div
          data-testid="base-dock-grip"
          {...dragHandlers}
          title="Drag to move"
          style={{ ...handle, display: 'flex', justifyContent: 'center', gap: 3, padding: '5px 0', background: '#3a0f4d', borderBottom: `1px solid ${NEON}`, borderRadius: '9px 9px 0 0' }}
        >
          <span style={dot} /><span style={dot} /><span style={dot} />
        </div>
        <button
          data-testid="base-dock-collapse"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse base color dock"
          style={{ position: 'absolute', top: 2, right: 3, background: 'transparent', border: 0, color: '#22e0ff', fontSize: 10, cursor: 'pointer' }}
        >▢</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '9px 0 2px', alignItems: 'center' }}>
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
                style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: NEON, color: '#0a0612', fontSize: 10, lineHeight: '12px', border: '1px solid #fff', cursor: 'pointer', padding: 0, fontWeight: 700 }}
              >×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const dot: React.CSSProperties = { width: 3, height: 3, borderRadius: '50%', background: '#22e0ff' };
