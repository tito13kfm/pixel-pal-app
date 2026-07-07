import { Monitor, MonitorOff, Moon, Contrast, Sun, Eye } from 'lucide-react';
import { useTheme } from '../../contexts';
import { IS_WEB } from '../../lib/env';
import { DesktopAppLink } from '../DesktopAppLink';

interface HeaderControlsProps {
  setLauncherOpen: React.Dispatch<React.SetStateAction<boolean>>;
  theme: string;
  setTheme: (theme: string) => void;
  crtEnabled: boolean;
  setCrtEnabled: (enabled: boolean) => void;
  cvdMode: string;
  setCvdMode: (mode: string) => void;
}

export function HeaderControls(props: HeaderControlsProps) {
  const {
    setLauncherOpen, theme, setTheme, crtEnabled, setCrtEnabled, cvdMode, setCvdMode,
  } = props;
  const { t } = useTheme();

  return (
    <div className="text-center mb-6 relative">
      <div className="absolute top-0 left-0 z-20">
        <button
          onClick={() => setLauncherOpen(o => !o)}
          title="Open guides"
          className={`px-3 py-2 rounded font-bold border-2 transition-all uppercase tracking-wider text-xs ${t.controlBtnDefault} ${t.controlBtnHover}`}
        >?</button>
      </div>
      <h1 className="text-5xl font-bold mb-2" style={{ color: t.titleColor, textShadow: t.titleGlow, letterSpacing: '0.15em' }}>PIXEL.PAL</h1>
      <p className="text-sm tracking-widest" style={{ color: t.subtitleColor, textShadow: t.subtitleGlow }}>▓▒░ PIXEL ART PALETTE GENERATOR ░▒▓</p>
      <p className="text-[10px] mt-1 opacity-40 tracking-widest font-mono" style={{ color: t.subtitleColor }}>
        v{__APP_VERSION__} &middot; {__BUILD_DATE__}
      </p>
      {IS_WEB && (
        <p className="mt-1">
          <DesktopAppLink
            textClassName={t.bodyText}
            hoverClassName={theme === 'light' ? 'hover:text-pink-600' : 'hover:text-cyan-300'}
          />
        </p>
      )}
      {/* Top-right control cluster: CRT toggle on top, three theme
          icon buttons in a horizontal row directly below, sized to
          match the CRT button's overall width.

          The CRT button has fixed-width content so toggling ON/OFF
          doesn't change its width (and therefore doesn't reflow the
          theme switcher below it, which stretches to match). Both
          icons (Monitor/MonitorOff) and the longer label ("CRT OFF",
          7 chars) are ALWAYS rendered; the inactive icon and the
          "missing" trailing character are made `invisible` so they
          still take up layout space. The visible state reads cleanly
          while width stays byte-stable across toggles. */}
      <div className="absolute top-0 right-0 z-20 flex flex-col gap-2 items-stretch">
        <button onClick={() => setCrtEnabled(!crtEnabled)} title={crtEnabled ? "Turn off CRT scanline overlay" : "Turn on CRT scanline overlay"} className={`px-3 py-2 rounded font-bold border-2 transition-all flex items-center justify-center gap-2 uppercase tracking-wider text-xs ${crtEnabled ? (t.glowStrong > 0.5 ? 'bg-green-400/30 text-green-300 border-green-400 hover:bg-green-400/50' : 'bg-green-200 text-green-900 border-green-600 hover:bg-green-300') : (t.glowStrong > 0.5 ? `${t.controlBtnDefault} ${t.controlBtnHover}` : 'bg-white/60 text-zinc-700 border-zinc-400 hover:bg-white/80')}`} style={crtEnabled && t.glowStrong > 0.5 ? { boxShadow: '0 0 10px rgba(0, 255, 100, 0.5)' } : {}}>
          {/* Both icons rendered, with the inactive one invisible.
              Stack them in the same grid cell so they share the
              layout slot. */}
          <span className="relative inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
            <Monitor size={16} className={`absolute ${crtEnabled ? '' : 'invisible'}`} />
            <MonitorOff size={16} className={`absolute ${crtEnabled ? 'invisible' : ''}`} />
          </span>
          {/* Label: stack "ON" and "OFF" in the same grid cell so the
              containing button's width is always the wider of the two
              ("CRT OFF"). The inactive label is `invisible` so it
              still claims layout space but renders blank. The
              visible label is centered in the cell, matching the
              visible icon's centering. Hidden below sm breakpoint
              to match prior responsive behavior. */}
          <span className="hidden sm:grid tabular-nums" style={{ gridTemplateAreas: '"stack"' }}>
            <span className={`${crtEnabled ? '' : 'invisible'} text-center`} style={{ gridArea: 'stack' }}>CRT ON</span>
            <span className={`${crtEnabled ? 'invisible' : ''} text-center`} style={{ gridArea: 'stack' }}>CRT OFF</span>
          </span>
        </button>
        {/* Theme selector: three icon buttons in a row. Icons follow the
            screen-brightness convention: moon=dark, half-filled
            circle=neutral (18% gray is also the photography reference
            for contrast/exposure), sun=light. flex with equal-width
            children stretches to match the CRT button's width above. */}
        <div className="flex gap-1 rounded border-2 p-1" style={{ borderColor: t.panelBorder, background: t.panelBg }}>
          {[
            { id: 'dark',    Icon: Moon,     hint: 'Dark: original vaporwave look' },
            { id: 'neutral', Icon: Contrast, hint: '18% gray: neutral background for unbiased color judgment' },
            { id: 'light',   Icon: Sun,      hint: 'Light: off-white background' },
          ].map(opt => {
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                onClick={() => setTheme(opt.id)}
                title={opt.hint}
                aria-label={opt.hint}
                className={`flex-1 flex items-center justify-center py-1 rounded transition-all ${theme === opt.id ? (t.glowStrong > 0.5 ? 'bg-cyan-300 text-purple-900' : 'bg-zinc-800 text-white') : `${t.panelTextInactive} ${t.panelHoverBg}`}`}
                style={theme === opt.id && t.glowStrong > 0.5 ? { boxShadow: '0 0 8px rgba(0, 255, 255, 0.6)' } : {}}
              >
                <Icon size={14} />
              </button>
            );
          })}
        </div>
      </div>
      {/* Top-left control cluster: an invisible spacer matching the
          CRT button on the right, then the CVD selector below it.
          This positions the CVD row at the same vertical height as
          the theme switcher on the right side, giving the header a
          symmetric layout. Spacer uses the SAME button markup as
          the real CRT button to guarantee height parity regardless
          of font / padding changes. The spacer text is "CRT OFF"
          (the longer state) so it matches the real button's now-
          stabilized width exactly. */}
      <div className="absolute top-0 left-0 z-20 flex flex-col gap-2 items-stretch pointer-events-none">
        <button aria-hidden="true" tabIndex={-1} className="invisible pointer-events-none px-3 py-2 rounded font-bold border-2 flex items-center justify-center gap-2 uppercase tracking-wider text-xs">
          <span className="relative inline-flex items-center justify-center" style={{ width: 16, height: 16 }}>
            <MonitorOff size={16} />
          </span>
          <span className="hidden sm:grid tabular-nums" style={{ gridTemplateAreas: '"stack"' }}>
            <span className="text-center" style={{ gridArea: 'stack' }}>CRT ON</span>
            <span className="text-center" style={{ gridArea: 'stack' }}>CRT OFF</span>
          </span>
        </button>
        {/* Color vision deficiency simulator: 4 labeled buttons (None /
            Pro / Deu / Tri) that switch which SVG color matrix filter
            is applied to the main content area. The buttons themselves
            live OUTSIDE the filtered region so the active state stays
            readable in all modes. Aligned horizontally with the theme
            switcher on the right via an invisible spacer above. */}
        <div className="flex gap-1 rounded border-2 p-1 pointer-events-auto" style={{ borderColor: t.panelBorder, background: t.panelBg }}>
          {[
            { id: 'none',   label: 'None', hint: 'Normal vision (no simulation)' },
            { id: 'protan', label: 'Pro',  hint: 'Protanopia: simulates red-blindness (~1% of men)' },
            { id: 'deutan', label: 'Deu',  hint: 'Deuteranopia: simulates green-blindness (~6% of men, most common CVD)' },
            { id: 'tritan', label: 'Tri',  hint: 'Tritanopia: simulates blue-blindness (very rare)' },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setCvdMode(opt.id)}
              title={opt.hint}
              aria-label={opt.hint}
              className={`flex-1 flex items-center justify-center py-1 px-1 rounded transition-all text-[10px] font-bold uppercase tracking-wider ${cvdMode === opt.id ? (t.glowStrong > 0.5 ? 'bg-cyan-300 text-purple-900' : 'bg-zinc-800 text-white') : `${t.panelTextInactive} ${t.panelHoverBg}`}`}
              style={cvdMode === opt.id && t.glowStrong > 0.5 ? { boxShadow: '0 0 8px rgba(0, 255, 255, 0.6)' } : {}}
            >
              {opt.id === 'none' ? <Eye size={12} /> : opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
