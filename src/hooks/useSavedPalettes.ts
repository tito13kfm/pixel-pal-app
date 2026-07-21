import { useState } from 'react';
import { CLASSIC_PALETTES } from '../lib/constants';
import type { SavedPaletteEntry } from './useSavedPalettesActions';

/**
 * Saved-palettes panel state: the persisted palette list, the save-name draft +
 * busy/error flags, delete/rename/reset confirmation state, the list filter,
 * and the selected classic-palette loader id. The mount-time list refresh and
 * the save/load/delete/rename HANDLERS live in useSavedPalettesActions
 * (#113 slice 2), which App.tsx wires to this state bag.
 */
export function useSavedPalettes() {
  // Saved palettes (persisted via window.storage). Each entry is a small index
  // record { slug, name, savedAt, baseColors }; the full payload lives at
  // `palettes:{slug}`. We keep an in-memory list to avoid re-listing on every
  // render. Loading the full payload happens on demand when the user clicks
  // Load. Storage operations are best-effort; failures show in `savedError`.
  const [savedPalettes, setSavedPalettes] = useState<SavedPaletteEntry[]>([]);
  const [saveName, setSaveName] = useState('');
  const [savedError, setSavedError] = useState('');
  const [savedBusy, setSavedBusy] = useState(false);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(null);
  // Rename UI state. renamingSlug holds the slug whose row is in rename
  // mode (or null if no rename is active); renameDraft is the in-progress
  // text; renameError is per-row inline validation. Only one palette can
  // be in rename mode at a time. Click Rename to enter the mode, Enter or
  // the check button to commit, Escape or the X button to cancel.
  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState('');
  // Two-click confirmation for the Reset to Defaults button. First click
  // arms it (button shows "Confirm?"), second click within 3s commits.
  const [confirmReset, setConfirmReset] = useState(false);
  // Text filter for the Saved Palettes list. Case-insensitive substring
  // match on palette name. Render-only: does not mutate savedPalettes.
  const [savedFilter, setSavedFilter] = useState('');
  // Compact classics loader dropdown selection (lives inside the Saved
  // Palettes section). UI-local, ephemeral, no persistence. Defaults to
  // the first classic so the preview row below the dropdown shows
  // something on first render. Empty string is not a valid value
  // because we always want a classic selected when the section is open.
  const [classicLoaderId, setClassicLoaderId] = useState(
    CLASSIC_PALETTES.length > 0 ? CLASSIC_PALETTES[0].id : ''
  );
  return {
    savedPalettes, setSavedPalettes, saveName, setSaveName,
    savedError, setSavedError, savedBusy, setSavedBusy,
    confirmDeleteSlug, setConfirmDeleteSlug, renamingSlug, setRenamingSlug,
    renameDraft, setRenameDraft, renameError, setRenameError,
    confirmReset, setConfirmReset, savedFilter, setSavedFilter,
    classicLoaderId, setClassicLoaderId,
  };
}
