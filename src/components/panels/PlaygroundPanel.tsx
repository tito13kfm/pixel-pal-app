import { memo } from 'react';
import { PixelPlayground } from '../PixelPlayground';
import { useTheme } from '../../contexts';
import { recordRender } from '../../lib/renderCount';

export interface PlaygroundPanelProps {
  pgOpen: boolean;
  rampsActive: string[][];
  isDark: boolean;
}

function PlaygroundPanelImpl({
  pgOpen,
  rampsActive,
  isDark,
}: PlaygroundPanelProps) {
  recordRender('PlaygroundPanel');
  const { t } = useTheme();

  return (
    <div className="p-6 pt-2" style={{ display: pgOpen ? '' : 'none' }}>
      <PixelPlayground
        ramps={rampsActive}
        theme={{ dark: isDark, text: t.text }}
      />
    </div>
  );
}

export const PlaygroundPanel = memo(PlaygroundPanelImpl);
