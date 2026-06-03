import { useState, useEffect, useRef } from 'react';
import { inferLabel } from '../lib/history-snapshot';

/**
 * useHistory — undo / redo / jump-to-state machinery (App.tsx Tier B, Wave 2).
 *
 * Photoshop-style whole-state snapshots (NOT diff patches). Each entry holds a
 * JSON-serializable snapshot of the document core plus the action label and a
 * timestamp. 50-entry cap (oldest dropped on overflow); session-only (a reload
 * starts fresh with a single "Initial state" entry).
 *
 * The document core itself lives in usePaletteState; this hook is wired to it
 * via three callbacks:
 *   - buildSnapshot()           → read the 19 snapshot fields into an object
 *   - applySnapshotFields(snap) → write those fields back on undo/redo/jump
 *   - resetTransientEditors()   → clear the editor/compare states post-replay
 * `applyUndoSnapshot` wraps the latter two with the `isReplayingHistory` flag so
 * the watcher doesn't record a replayed state as a new entry.
 *
 * The watcher's dependency array is the caller-supplied `snapshotInputs` (the
 * snapshot INPUT values, NOT historyEntries/historyIndex — those are read via
 * refs to avoid a record→re-run loop). It is deliberately 17 fields, omitting
 * lightnessCurvePerRamp / satCurvePerRamp — preserved verbatim from the original.
 *
 * `tagNextLabel(label)` replaces the scattered `pendingLabelRef.current = ...`
 * writes: handler-tagged actions (Generate, Harmonize, Load, …) call it before
 * mutating state; the watcher consumes the tag, else falls back to inferLabel.
 */
const HISTORY_DEPTH_CAP = 50;
const HISTORY_DEBOUNCE_MS = 300;

interface UseHistoryOptions {
  buildSnapshot: () => any;
  applySnapshotFields: (snap: any) => void;
  resetTransientEditors: () => void;
  setExportFeedback: (msg: string) => void;
  snapshotInputs: any[];
}

export function useHistory({
  buildSnapshot,
  applySnapshotFields,
  resetTransientEditors,
  setExportFeedback,
  snapshotInputs,
}: UseHistoryOptions) {
  const [historyEntries, setHistoryEntries] = useState(() => [
    { snapshot: null, label: 'Initial state', timestamp: Date.now() },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isReplayingHistoryRef = useRef(false);
  const historyDebounceRef = useRef<any>(null);
  const pendingLabelRef = useRef<any>(null);

  const tagNextLabel = (label: string) => { pendingLabelRef.current = label; };

  // The dependencies of the watcher are the SNAPSHOT INPUTS, not
  // historyEntries/historyIndex (which would loop). We read those two via refs
  // kept in sync with the rendered values via a separate effect. The ref
  // pattern avoids invalidating the watcher's closure every time we push.
  const historyEntriesRef = useRef(historyEntries);
  const historyIndexRef = useRef(historyIndex);
  useEffect(() => { historyEntriesRef.current = historyEntries; }, [historyEntries]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

  // History watcher: observes the snapshot inputs, debounces 300ms (collapses a
  // slider drag into one entry and lets React batch a multi-field action), and
  // records a new entry on stabilization at a value != the current entry's.
  useEffect(() => {
    // Replay path: undo/redo/jump set this flag, and React re-runs this effect
    // because the state fields changed. Clear the flag and skip recording.
    if (isReplayingHistoryRef.current) {
      isReplayingHistoryRef.current = false;
      if (historyDebounceRef.current) {
        clearTimeout(historyDebounceRef.current);
        historyDebounceRef.current = null;
      }
      return;
    }

    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      historyDebounceRef.current = null;
      const entries = historyEntriesRef.current;
      const index = historyIndexRef.current;
      const current = entries[index];
      const newSnap = buildSnapshot();
      // Skip if byte-identical to the current entry (a setter called with the
      // same value still re-runs the effect via dependency identity change).
      if (current && current.snapshot && JSON.stringify(current.snapshot) === JSON.stringify(newSnap)) {
        return;
      }
      const label = pendingLabelRef.current || inferLabel(current ? current.snapshot : null, newSnap);
      pendingLabelRef.current = null;
      // Truncate the redo stack and append; cap at HISTORY_DEPTH_CAP from front.
      const next = entries.slice(0, index + 1);
      next.push({ snapshot: newSnap, label, timestamp: Date.now() });
      let newIndex = next.length - 1;
      if (next.length > HISTORY_DEPTH_CAP) {
        const dropped = next.length - HISTORY_DEPTH_CAP;
        next.splice(0, dropped);
        newIndex -= dropped;
      }
      setHistoryEntries(next);
      setHistoryIndex(newIndex);
    }, HISTORY_DEBOUNCE_MS);

    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, snapshotInputs);

  // Apply a snapshot back to the document core, wrapped in the isReplayingHistory
  // flag so the watcher doesn't record this application as a new entry.
  const applyUndoSnapshot = (snap: any) => {
    if (!snap) return;
    isReplayingHistoryRef.current = true;
    applySnapshotFields(snap);
    resetTransientEditors();
  };

  // Sequential undo / redo / jump-to-index. All three share the snapshot-apply
  // path; jump lets the History panel click any entry.
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < historyEntries.length - 1;
  const undo = () => {
    if (!canUndo) {
      setExportFeedback('Nothing to undo');
      setTimeout(() => setExportFeedback(''), 1500);
      return;
    }
    const targetIndex = historyIndex - 1;
    const entry = historyEntries[targetIndex];
    applyUndoSnapshot(entry.snapshot);
    setHistoryIndex(targetIndex);
    setExportFeedback(`Undo: ${entry.label}`);
    setTimeout(() => setExportFeedback(''), 1500);
  };
  const redo = () => {
    if (!canRedo) {
      setExportFeedback('Nothing to redo');
      setTimeout(() => setExportFeedback(''), 1500);
      return;
    }
    const targetIndex = historyIndex + 1;
    const entry = historyEntries[targetIndex];
    applyUndoSnapshot(entry.snapshot);
    setHistoryIndex(targetIndex);
    setExportFeedback(`Redo: ${entry.label}`);
    setTimeout(() => setExportFeedback(''), 1500);
  };
  const jumpToHistoryIndex = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= historyEntries.length) return;
    if (targetIndex === historyIndex) return;
    const entry = historyEntries[targetIndex];
    // Index 0 is the "Initial state" sentinel; its snapshot is null because the
    // snapshot machinery hadn't been built at mount. Jumping there is a no-op
    // for state application: we just move the cursor.
    if (entry.snapshot) applyUndoSnapshot(entry.snapshot);
    setHistoryIndex(targetIndex);
    setExportFeedback(`Jumped to: ${entry.label}`);
    setTimeout(() => setExportFeedback(''), 1500);
  };

  // Keyboard shortcuts for undo/redo. Bound at the window level so they fire
  // regardless of focus, but skipped when the focused element is a text input /
  // textarea (so native browser text-undo works inside the hex input, etc).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as any;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const isEditable = tag === 'input' || tag === 'textarea' || (target && target.isContentEditable);
      if (isEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        // Cmd+Shift+Z is also accepted as a redo alias.
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [historyEntries, historyIndex]); // re-bind so handler closures see fresh undo/redo

  return {
    historyEntries,
    historyIndex,
    undo,
    redo,
    jumpToHistoryIndex,
    canUndo,
    canRedo,
    tagNextLabel,
  };
}
