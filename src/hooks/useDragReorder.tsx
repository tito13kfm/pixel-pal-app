// Drag-to-reorder helpers (#113): section cards (#44) and ramp cards.
//
// Extracted from App.tsx. Two deliberately SEPARATE hooks so card-drag and
// ramp-drag state never collide: a ramp drop must not be read as a section
// reorder (the ramp handlers stop propagation for the same reason).
//
// useSectionDrag reads/writes the drag state owned by usePanelLayout (via
// params); useRampDrag owns its own dragOver/dragging state and permutes
// the store-backed ramp order via reorderRamps, with gamutPerRamp (App-local
// state the store does not own) permuted through the setter param.
// .tsx because the grip helpers return JSX.
import { useState } from 'react';
import type { DragEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { usePaletteState } from './usePaletteState';
import { permuteStringKeyMap } from '../lib/permute-indexed-state';
import type { GamutStrategySerialized } from '../lib/palette';

type DropPos = 'before' | 'after';

// Accent color per section. The viz accent is a fixed tint now that style
// is per-ramp (#69) rather than a single global vizStyle.
const SECTION_ACCENT: Record<string, string> = {
  ramps: '#00ffff',
  harmony: '#ff00ff',
  playground: '#00ff88',
  viz: '#ff00ff',
  saved: '#ffff00',
  history: '#a855f7',
};

// Shared by both hooks: which half of the hovered card the pointer is in.
const dropPos = (e: DragEvent): DropPos => {
  const rect = e.currentTarget.getBoundingClientRect();
  return (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
};

interface UseSectionDragParams {
  dragOver: { key: string; pos: DropPos } | null;
  setDragOver: (updater: (prev: { key: string; pos: DropPos } | null) => { key: string; pos: DropPos } | null) => void;
  draggingKey: string | null;
  setDraggingKey: (v: string | null) => void;
  setSectionOrder: (updater: (prev: string[]) => string[]) => void;
  DEFAULT_SECTION_ORDER: string[];
}

export function useSectionDrag(p: UseSectionDragParams) {
  const { dragOver, setDragOver, draggingKey, setDraggingKey, setSectionOrder, DEFAULT_SECTION_ORDER } = p;

  const makeSectionDragHandlers = (sectionKey: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      const pos = dropPos(e);
      setDragOver(prev => (prev && prev.key === sectionKey && prev.pos === pos) ? prev : { key: sectionKey, pos });
    },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(prev => (prev && prev.key === sectionKey) ? null : prev); },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/plain');
      const pos = dropPos(e);
      setDragOver(() => null);
      if (!from || from === sectionKey || !DEFAULT_SECTION_ORDER.includes(from)) return;
      setSectionOrder(prev => {
        const next = prev.filter(k => k !== from);
        let idx = next.indexOf(sectionKey);
        if (pos === 'after') idx += 1;
        next.splice(idx, 0, from);
        return next;
      });
    },
  });

  const sectionAccent = (key: string) => SECTION_ACCENT[key] ?? '#00ffff';

  // Glowing insertion line on the hovered edge, colored to the dragged card.
  const dropLine = (sectionKey: string) => {
    if (!dragOver || dragOver.key !== sectionKey || !draggingKey) return null;
    const c = sectionAccent(draggingKey);
    return dragOver.pos === 'before'
      ? `inset 0 6px 0 -2px ${c}, 0 0 14px ${c}`
      : `inset 0 -6px 0 -2px ${c}, 0 0 14px ${c}`;
  };

  const sectionGrip = (sectionKey: string) => (
    <span
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('text/plain', sectionKey); setDraggingKey(sectionKey); }}
      onDragEnd={() => { setDraggingKey(null); setDragOver(() => null); }}
      onClick={e => e.stopPropagation()}
      style={{ cursor: 'grab', color: '#fff', filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      className="hover:scale-125 transition-transform"
      title="Drag to reorder this section"
    >
      <GripVertical size={16} />
    </span>
  );

  return { makeSectionDragHandlers, dropLine, sectionGrip };
}

interface UseRampDragParams {
  setGamutPerRamp: (updater: (prev: Record<string, GamutStrategySerialized>) => Record<string, GamutStrategySerialized>) => void;
  tagNextLabel: (label: string) => void;
}

// Ramp-card reorder. Mirrors useSectionDrag's handlers but on numeric
// indices, and stops propagation so the enclosing ramps-section drag
// handlers never also fire.
export function useRampDrag(p: UseRampDragParams) {
  const { setGamutPerRamp, tagNextLabel } = p;
  const { reorderRamps } = usePaletteState();

  // Ramp reorder drag state, deliberately SEPARATE from the section-level
  // dragOver/draggingKey so card-drag (#44) and ramp-drag never collide.
  const [rampDragOver, setRampDragOver] = useState<{ index: number; pos: DropPos } | null>(null);
  const [rampDragging, setRampDragging] = useState<number | null>(null);

  const makeRampDragHandlers = (index: number) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = dropPos(e);
      setRampDragOver(prev => (prev && prev.index === index && prev.pos === pos) ? prev : { index, pos });
    },
    onDragLeave: (e: DragEvent) => {
      e.stopPropagation();
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setRampDragOver(prev => (prev && prev.index === index) ? null : prev);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const raw = e.dataTransfer.getData('application/x-ramp-index');
      const pos = dropPos(e);
      setRampDragOver(null);
      if (raw === '') return;
      const from = Number(raw);
      if (Number.isNaN(from) || from === index) return;
      const next = reorderRamps(from, index, pos);
      setGamutPerRamp(prev => permuteStringKeyMap(prev, next));
      tagNextLabel('Reorder ramps');
    },
  });

  const rampDropLine = (index: number) => {
    if (!rampDragOver || rampDragOver.index !== index || rampDragging === null) return null;
    const c = '#00ffff';
    return rampDragOver.pos === 'before'
      ? `inset 0 6px 0 -2px ${c}, 0 0 14px ${c}`
      : `inset 0 -6px 0 -2px ${c}, 0 0 14px ${c}`;
  };

  const rampGrip = (index: number) => (
    <span
      draggable
      onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData('application/x-ramp-index', String(index)); setRampDragging(index); }}
      onDragEnd={() => { setRampDragging(null); setRampDragOver(null); }}
      onClick={e => e.stopPropagation()}
      style={{ cursor: 'grab', color: '#fff', filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.8))' }}
      className="hover:scale-125 transition-transform"
      title="Drag to reorder this ramp"
    >
      <GripVertical size={16} />
    </span>
  );

  return { makeRampDragHandlers, rampDropLine, rampGrip };
}
