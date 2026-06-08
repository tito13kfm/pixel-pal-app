import { createContext, useContext, type ReactNode } from 'react';

export interface LayoutValue {
  sectionOrder: string[];
  makeSectionDragHandlers: (key: string) => Record<string, (e: any) => void>;
  dropLine: (key: string) => string | null;
  sectionGrip: (key: string) => ReactNode;
  // panel-open flags + setters are added here as panels need them
  historyOpen: boolean;
  setHistoryOpen: (f: (o: boolean) => boolean) => void;
}

const LayoutContext = createContext<LayoutValue | null>(null);

export function LayoutProvider({ value, children }: { value: LayoutValue; children: ReactNode }) {
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}

export function useLayout(): LayoutValue {
  const v = useContext(LayoutContext);
  if (!v) throw new Error('useLayout must be used within AppProviders');
  return v;
}
