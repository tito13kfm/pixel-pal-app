// Global keyboard shortcuts (#113): the Escape dismiss-topmost handler and
// the bare-letter S (focus save input) / H (harmonize) shortcuts.
//
// Extracted from App.tsx. Editor/compare document state flows through the
// Zustand-backed usePaletteState(); gplImport (useSavedPalettesActions),
// the save-input ref, harmonize, and the values harmonize reads (for the
// dep array) arrive via params. Undo/redo keybinds live in useHistory, not
// here (they were extracted with the history machinery).
//
// Placement note (App.tsx): the call must come AFTER useSavedPalettesActions
// (gplImport) and after harmonize is declared; an earlier placement throws
// "Cannot access before initialization" when React evaluates the argument
// object during render (temporal dead zone).
import { useEffect } from 'react';
import type { RefObject } from 'react';
import { usePaletteState } from './usePaletteState';

interface UseGlobalShortcutsParams {
  gplImport: unknown;
  setGplImport: (v: null) => void;
  saveNameInputRef: RefObject<HTMLInputElement | null>;
  harmonize: () => void;
  // Values harmonize() reads directly; they re-arm the S/H listener so its
  // closure stays fresh (see the dep-array notes below).
  baseColors: string[];
  lockedRamps: Set<number>;
  safeAnchor: number;
}

export function useGlobalShortcuts(p: UseGlobalShortcutsParams) {
  const { gplImport, setGplImport, saveNameInputRef, harmonize, baseColors, lockedRamps, safeAnchor } = p;
  const {
    pinEditor, setPinEditor,
    editingIndex, setEditingIndex,
    compareMode, setCompareMode,
  } = usePaletteState();

  // Escape closes the topmost dismissable thing. Priority order is
  // outer-to-inner: a modal sitting over everything closes first, then
  // editor panels, then the floating WCAG Check picker. Skipping
  // editable-focus is intentional (same reasoning as the undo handler):
  // hitting Esc mid-typing should not surprise the user by closing a
  // surrounding panel. Users dismiss editors from inside their inputs
  // via the existing Close/Done buttons.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      if (gplImport) {
        e.preventDefault();
        setGplImport(null);
        return;
      }
      if (pinEditor) {
        e.preventDefault();
        setPinEditor(null);
        return;
      }
      if (editingIndex !== null) {
        e.preventDefault();
        setEditingIndex(null);
        return;
      }
      if (compareMode) {
        e.preventDefault();
        setCompareMode(false);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [gplImport, pinEditor, editingIndex, compareMode]);

  // KEYBOARD SHORTCUTS: S, H
  //
  //   S - Focus the Save palette name input and scroll it into view.
  //   H - Harmonize. The harmonize() helper has its own internal guards
  //       (returns early with a feedback toast if base count < 2 or no
  //       unlocked targets), so we forward unconditionally.
  //
  // G previously triggered Generate. Removed because after the
  // session 2 followup, Generate was renamed to "New palette" and
  // downgraded to a secondary action since it's destructive (wipes
  // pins, hidden shades, locks, anchor, side-by-side slots). A
  // single-key shortcut for an unconfirmed destructive operation is
  // a footgun, especially when the renamed button no longer maps to
  // the letter "G." If a shortcut for the primary Add base action
  // is wanted later, "A" is the obvious candidate.
  //
  // Bare letter keys (no Cmd/Ctrl). Same editable-focus guard as the
  // undo/Escape handlers so the shortcuts don't fire while the user is
  // typing in any input or textarea. No Shift, Alt, or modifier required;
  // gated to plain key strokes so keyboard navigation with modifiers
  // (e.g. browser Find: Cmd+H, Cmd+S) is not affected.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Modifier-gated keys are claimed by the browser or by the existing
      // undo handler. Only fire on plain letter presses.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Skip when typing in any input or textarea so the letter lands in
      // the field, not the shortcut.
      const target = e.target as HTMLElement | null;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      // Don't intercept while a modal or editor is open. Esc dismisses
      // those; layering shortcuts on top would be surprising.
      if (gplImport || pinEditor || editingIndex !== null) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        const node = saveNameInputRef.current;
        if (node) {
          // scrollIntoView with smooth + center keeps the save panel visible
          // even when the user pressed S from way up the page.
          try { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
          node.focus();
        }
      } else if (key === 'h') {
        e.preventDefault();
        harmonize();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO(sp2-d): legacy dep array, verify when @ts-nocheck drops
  }, [baseColors, lockedRamps, safeAnchor, gplImport, pinEditor, editingIndex]);
  // Dep array notes: `baseColors`, `lockedRamps`, and `safeAnchor` are
  // what harmonize reads directly (the H shortcut). `gplImport` /
  // `pinEditor` / `editingIndex` gate both shortcuts (modal-open
  // suppression). The S shortcut only reads from a ref, so it adds no
  // deps. Everything else the handlers touch is via setters (which
  // always see fresh state) or refs (which sidestep closures). If you
  // add a new shortcut whose action function reads more state, add
  // those reads here too.
}
