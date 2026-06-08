import { type ReactNode } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useLayout, useTheme } from '../contexts';

export interface SectionCardProps {
  sectionKey: string;
  accent: string;       // accent hex for border/glow/heading
  bg: string;           // background token (e.g. t.cardBgViz) — varies per section
  glow: number;         // accentGlow strength for this card
  open: boolean;
  onToggle: () => void;
  title: ReactNode;
  icon: ReactNode;
  headerAside?: ReactNode;   // e.g. the "(3 of 12)" history count badge
  dataTourId?: string;       // data-tour-id on the outer card div
  headerTourId?: string;     // data-tour-id on the header <button> (harmony/export)
  headerTitle?: string;      // native tooltip on the header <button> (collapse/expand hint)
  chevronColor?: string;     // chevron color; defaults to sectionHeadColor(accent)
  keepMounted?: boolean;     // keep children mounted when closed (caller hides via CSS, e.g. playground's display:none); default false unmounts
  marginClass?: string;      // default mb-6; export uses mb-3
  children: ReactNode;
}

export function SectionCard({
  sectionKey, accent, bg, glow, open, onToggle,
  title, icon, headerAside, dataTourId, headerTourId, headerTitle, chevronColor,
  keepMounted = false, marginClass = 'mb-6', children,
}: SectionCardProps) {
  const { makeSectionDragHandlers, dropLine, sectionGrip, sectionOrder } = useLayout();
  const { t, themedAccentBorder, accentGlow, sectionHeadColor, accentTextGlow } = useTheme();
  return (
    <div
      className={`rounded-lg ${marginClass} border-2 backdrop-blur-sm overflow-hidden`}
      data-tour-id={dataTourId}
      {...makeSectionDragHandlers(sectionKey)}
      style={{
        order: sectionOrder.indexOf(sectionKey),
        background: bg,
        borderColor: themedAccentBorder(accent),
        boxShadow: [accentGlow(accent, glow), dropLine(sectionKey)].filter(Boolean).join(', '),
      }}
    >
      <button
        onClick={onToggle}
        data-tour-id={headerTourId}
        title={headerTitle}
        className={`w-full p-4 flex items-center justify-between transition-colors ${t.glowStrong > 0.5 ? 'hover:bg-white/5' : 'hover:bg-black/5'}`}
      >
        <h2
          className="text-xl font-bold flex items-center gap-2 uppercase tracking-widest"
          style={{ color: sectionHeadColor(accent), textShadow: accentTextGlow(accent) }}
        >
          {icon}{title}{headerAside}
        </h2>
        <div className="flex items-center gap-2">
          {sectionGrip(sectionKey)}
          <span style={{ color: chevronColor ?? sectionHeadColor(accent) }}>{open ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</span>
        </div>
      </button>
      {keepMounted ? children : (open && children)}
    </div>
  );
}
