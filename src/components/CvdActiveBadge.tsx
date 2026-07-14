import { useTheme } from '../contexts';

const CVD_LABELS: Record<string, string> = {
  protan: 'Protanopia',
  deutan: 'Deuteranopia',
  tritan: 'Tritanopia',
};

/**
 * Persistent viewport-pinned badge shown whenever a CVD simulation mode is
 * active. Fixed positioning (not an inline banner) so it stays visible while
 * scrolling past the header's Pro/Deu/Tri buttons, which is the only other
 * "sim is on" cue and disappears off-screen otherwise. Bottom-left: the only
 * corner with no other fixed overlay (update notice owns bottom-right, the
 * WCAG Check panel owns top-right, and the header's own controls sit at
 * top-left/top-right while scrolled to the top).
 */
export function CvdActiveBadge({ cvdMode }: { cvdMode: string }) {
  const { t, themedAccentBorder, sectionHeadColor, accentTextGlow } = useTheme();

  if (cvdMode === 'none') return null;
  const label = CVD_LABELS[cvdMode] ?? cvdMode;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-40 pointer-events-none rounded-lg px-3 py-2 border-2 text-xs font-bold uppercase tracking-wider"
      style={{
        background: t.panelBg,
        borderColor: themedAccentBorder('#f59e0b'),
        color: sectionHeadColor('#f59e0b'),
        textShadow: accentTextGlow('#f59e0b'),
      }}
    >
      CVD Sim Active: {label}
    </div>
  );
}
