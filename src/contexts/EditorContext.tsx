import { createContext, useContext, type ReactNode } from 'react';

// Live editor state — ticks on every HSV slider drag. Deliberately separate from
// PaletteContext so committed-state consumers (Export/Saved/TopControls) do NOT
// re-render per drag frame.
export interface EditorValue {
  editingIndex: number | null;
  editorHsv: { h: number; s: number; v: number } | null;
  // Which shade's HSV editor is open: { baseIndex, shadeIndex, style } | null
  // (matches usePaletteState's pinEditor; not a boolean flag).
  pinEditor: { baseIndex: number; shadeIndex: number; style: string } | null;
}

const EditorContext = createContext<EditorValue | null>(null);

export function EditorProvider({ value, children }: { value: EditorValue; children: ReactNode }) {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorValue {
  const v = useContext(EditorContext);
  if (!v) throw new Error('useEditor must be used within AppProviders');
  return v;
}
