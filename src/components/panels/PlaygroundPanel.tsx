import { memo } from 'react';
import { PixelPlayground } from '../PixelPlayground';
import { useTheme } from '../../contexts';
import { recordRender } from '../../lib/renderCount';

type VizStyle = 'punchy' | 'balanced' | 'muted';

export interface PlaygroundPanelProps {
  pgOpen: boolean;
  vizStyle: VizStyle;
  setVizStyle: (s: VizStyle) => void;
  rampsBalanced: string[][];
  rampsMuted: string[][];
  rampsPunchy: string[][];
  isDark: boolean;
}

function PlaygroundPanelImpl({
  pgOpen,
  vizStyle,
  setVizStyle,
  rampsBalanced,
  rampsMuted,
  rampsPunchy,
  isDark,
}: PlaygroundPanelProps) {
  recordRender('PlaygroundPanel');
  const { t, sectionHeadColor } = useTheme();

  return (
    <div className="p-6 pt-2" style={{ display: pgOpen ? '' : 'none' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: sectionHeadColor('#00ff88') }}>Palette style</span>
        {(['punchy', 'balanced', 'muted'] as const).map(s => (
          <button
            key={s}
            onClick={() => setVizStyle(s)}
            title={`Paint with ${s.charAt(0).toUpperCase() + s.slice(1)} ramps (synced with Visualize & Compare)`}
            className={`px-3 py-1 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider ${vizStyle === s ? 'bg-emerald-300 text-emerald-950 border-emerald-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`}
            style={vizStyle === s ? { boxShadow: '0 0 10px #00ff88' } : {}}
          >
            {s}
          </button>
        ))}
      </div>
      <PixelPlayground
        ramps={vizStyle === 'balanced' ? rampsBalanced : vizStyle === 'muted' ? rampsMuted : rampsPunchy}
        theme={{ dark: isDark, text: t.text }}
      />
    </div>
  );
}

export const PlaygroundPanel = memo(PlaygroundPanelImpl);
