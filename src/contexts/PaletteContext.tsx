import { createContext, useContext, type ReactNode } from 'react';

// Committed document state + history. Grows as panels are extracted; the pilot
// only needs the history slice, so that is all that is typed non-optionally now.
export interface PaletteValue {
  historyEntries: { label: string; timestamp: number }[];
  historyIndex: number;
  jumpToHistoryIndex: (idx: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  formatHistoryAge: (timestamp: number) => string;
}

const PaletteContext = createContext<PaletteValue | null>(null);

export function PaletteProvider({ value, children }: { value: PaletteValue; children: ReactNode }) {
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
}

export function usePalette(): PaletteValue {
  const v = useContext(PaletteContext);
  if (!v) throw new Error('usePalette must be used within AppProviders');
  return v;
}
