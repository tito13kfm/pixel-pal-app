import type { RefObject } from 'react';
import { FolderOpen, Save, Check, X, Edit2, Trash2 } from 'lucide-react';
import { useTheme } from '../../contexts';
import { CLASSIC_PALETTES } from '../../lib/constants';

export interface SavedPalettesPanelProps {
  savedPalettes: { slug: string; name: string; savedAt?: number; baseColors: string[] }[];
  savedError: string;
  savedBusy: boolean;
  saveName: string;
  setSaveName: (name: string) => void;
  savedFilter: string;
  setSavedFilter: (filter: string) => void;
  confirmDeleteSlug: string | null;
  renamingSlug: string | null;
  renameDraft: string;
  setRenameDraft: (draft: string) => void;
  renameError: string;
  classicLoaderId: string;
  setClassicLoaderId: (id: string) => void;
  saveCurrentPalette: () => void;
  loadPalette: (slug: string) => Promise<void>;
  requestDeletePalette: (slug: string) => void;
  startRename: (slug: string, currentName: string) => void;
  cancelRename: () => void;
  commitRename: (slug: string) => Promise<void>;
  loadClassicPalette: (classic: (typeof CLASSIC_PALETTES)[number]) => void;
  saveNameInputRef: RefObject<HTMLInputElement | null>;
}

export function SavedPalettesPanel({
  savedPalettes,
  savedError,
  savedBusy,
  saveName,
  setSaveName,
  savedFilter,
  setSavedFilter,
  confirmDeleteSlug,
  renamingSlug,
  renameDraft,
  setRenameDraft,
  renameError,
  classicLoaderId,
  setClassicLoaderId,
  saveCurrentPalette,
  loadPalette,
  requestDeletePalette,
  startRename,
  cancelRename,
  commitRename,
  loadClassicPalette,
  saveNameInputRef,
}: SavedPalettesPanelProps) {
  const { t } = useTheme();

  return (
    <div className="p-6 pt-2 flex flex-col gap-4">
      <p className="text-[11px] text-yellow-100/70 italic bg-black/60 rounded px-2 py-1">▸ Palettes save locally to your browser. They persist across sessions but stay on this device.</p>

      {/* Save current palette */}
      <div data-tour-id="save-controls" className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-black/60 rounded border-2 border-yellow-500/40 p-3">
        <input
          ref={saveNameInputRef}
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Name this palette..."
          title="Type a name for the current palette and press Enter or click Save"
          className="flex-1 px-3 py-2 rounded bg-black/60 text-yellow-100 border-2 border-yellow-400 focus:outline-none text-sm"
          onKeyDown={(e) => { if (e.key === 'Enter' && !savedBusy) saveCurrentPalette(); }}
          disabled={savedBusy}
        />
        <button
          onClick={saveCurrentPalette}
          disabled={savedBusy || !saveName.trim()}
          title="Save the current palette to your browser's local storage"
          className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 disabled:opacity-50 disabled:hover:scale-100 uppercase tracking-wider text-sm"
          style={{ boxShadow: '0 0 10px #ffff00' }}
        >
          <Save size={16} />{savedBusy ? 'Saving...' : 'Save Current'}
        </button>
      </div>

      {savedError && (
        <div className={`text-xs rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>
          {savedError}
        </div>
      )}

      {/* Filter input: only visible when there's at least one saved palette */}
      {savedPalettes.length > 0 && (() => {
        const trimmed = savedFilter.trim();
        return (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <input
              type="text"
              value={savedFilter}
              onChange={(e) => setSavedFilter(e.target.value)}
              placeholder="Filter by name..."
              title="Type to filter the list below by palette name. Case-insensitive. Cleared on page reload."
              className="flex-1 px-3 py-2 rounded bg-black/60 text-yellow-100 border-2 border-yellow-700/60 focus:border-yellow-400 focus:outline-none text-sm"
            />
            {trimmed && (
              <button
                onClick={() => setSavedFilter('')}
                title="Clear the filter and show all saved palettes"
                className="px-3 py-2 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-purple-800/60"
              >
                Clear
              </button>
            )}
          </div>
        );
      })()}

      {/* List of saved palettes */}
      {savedPalettes.length === 0 ? (
        <div className="text-center text-yellow-100/60 italic text-sm py-6 border-2 border-dashed border-yellow-700/40 rounded bg-black/60">
          No saved palettes yet. Save your current palette above to get started.
        </div>
      ) : (() => {
        const needle = savedFilter.trim().toLowerCase();
        const visible = needle ? savedPalettes.filter(p => (p.name || '').toLowerCase().includes(needle)) : savedPalettes;
        if (visible.length === 0) {
          return (
            <div className="text-center text-yellow-100/60 italic text-sm py-6 border-2 border-dashed border-yellow-700/40 rounded bg-black/60">
              No saved palettes match "{savedFilter.trim()}". {savedPalettes.length} hidden.
            </div>
          );
        }
        return (
          <div className="grid gap-2">
            {visible.map(p => {
              const isConfirming = confirmDeleteSlug === p.slug;
              const isRenaming = renamingSlug === p.slug;
              const dateStr = p.savedAt ? new Date(p.savedAt).toLocaleString() : '';
              return (
                <div key={p.slug} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-black/60 rounded border-2 border-yellow-700/40 p-2 hover:border-yellow-500/60 transition-colors">
                  {/* Thumbnail: mosaic of base colors */}
                  <div className="flex h-10 sm:h-12 rounded overflow-hidden border flex-shrink-0 sm:w-32" style={{ minWidth: '8rem', borderColor: t.vizDataBorder }}>
                    {p.baseColors.map((hex, i) => (
                      <div key={i} className="flex-1" style={{ background: hex }} title={hex.toUpperCase()} />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <>
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={e => setRenameDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(p.slug); }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                          }}
                          autoFocus
                          disabled={savedBusy}
                          maxLength={120}
                          title="Type a new name. Enter to save, Escape to cancel."
                          className="w-full px-2 py-1 rounded bg-purple-950/80 text-yellow-50 border-2 border-cyan-500/70 text-sm font-bold focus:outline-none focus:border-cyan-300 disabled:opacity-50"
                        />
                        {renameError ? (
                          <div className="text-pink-300 text-[10px] mt-1">{renameError}</div>
                        ) : (
                          <div className="text-yellow-100/50 text-[10px] mt-1">{p.baseColors.length} color{p.baseColors.length === 1 ? '' : 's'}{dateStr ? ` • ${dateStr}` : ''}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-yellow-100 font-bold text-sm truncate">{p.name}</div>
                        <div className="text-yellow-100/50 text-[10px]">{p.baseColors.length} color{p.baseColors.length === 1 ? '' : 's'}{dateStr ? ` • ${dateStr}` : ''}</div>
                      </>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {isRenaming ? (
                      <>
                        <button
                          onClick={() => commitRename(p.slug)}
                          disabled={savedBusy}
                          title="Save the new name (Enter)"
                          className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs"
                          style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.4)' }}
                        >
                          <Check size={14} />Save
                        </button>
                        <button
                          onClick={cancelRename}
                          disabled={savedBusy}
                          title="Cancel rename (Escape)"
                          className="px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs bg-purple-700/60 text-cyan-100 border-cyan-700/50 hover:bg-purple-700/80"
                        >
                          <X size={14} />Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => loadPalette(p.slug)}
                          disabled={savedBusy}
                          title={`Load "${p.name}" and replace the current palette`}
                          className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs"
                          style={{ boxShadow: '0 0 8px rgba(0, 255, 255, 0.4)' }}
                        >
                          <FolderOpen size={14} />Load
                        </button>
                        <button
                          onClick={() => startRename(p.slug, p.name)}
                          disabled={savedBusy}
                          title={`Rename "${p.name}"`}
                          className="px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs bg-yellow-600/70 text-yellow-50 border-yellow-300/60 hover:bg-yellow-500/70"
                        >
                          <Edit2 size={14} />Rename
                        </button>
                        <button
                          onClick={() => requestDeletePalette(p.slug)}
                          disabled={savedBusy}
                          title={isConfirming ? 'Click again to confirm deletion' : `Delete "${p.name}" from saved palettes`}
                          className={`px-3 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 disabled:opacity-50 uppercase tracking-wider text-xs ${isConfirming ? 'bg-red-300 text-red-900 border-red-100 animate-pulse' : 'bg-pink-500 text-white border-pink-200 hover:bg-pink-400'}`}
                        >
                          <Trash2 size={14} />{isConfirming ? 'Confirm?' : 'Delete'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Classic palette loader */}
      {(() => {
        const selectedClassic = CLASSIC_PALETTES.find(c => c.id === classicLoaderId) || CLASSIC_PALETTES[0];
        if (!selectedClassic) return null;
        return (
          <div className="bg-black/60 rounded border-2 border-green-700/40 p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-green-100/80 font-bold uppercase tracking-wider whitespace-nowrap">Load classic:</span>
              <select
                value={classicLoaderId}
                onChange={(e) => setClassicLoaderId(e.target.value)}
                title="Pick a classic palette to preview below. Click Load to replace the current palette with the chosen classic's base colors."
                className="flex-1 min-w-[180px] px-2 py-1.5 rounded bg-black/60 text-green-100 border-2 border-green-700/60 focus:border-green-400 focus:outline-none text-sm font-mono"
              >
                {CLASSIC_PALETTES.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => loadClassicPalette(selectedClassic)}
                title={`Replace the current palette with ${selectedClassic.name}'s base colors. Destructive: wipes pins, hidden shades, ramp locks, side-by-side slots, harmony anchor, and per-ramp customizations.`}
                className="px-3 py-1.5 rounded font-bold bg-green-400 text-purple-900 border-2 border-green-100 hover:bg-green-300 transition-all flex items-center gap-1 uppercase tracking-wider text-xs whitespace-nowrap"
                style={{ boxShadow: '0 0 8px rgba(0, 255, 153, 0.4)' }}
              >
                <FolderOpen size={14} />Load
              </button>
            </div>
            {/* Preview row: swatch mosaic + tip text */}
            <div className="flex items-center gap-2 bg-black/60 rounded border border-green-700/30 p-2">
              <div className="flex h-8 rounded overflow-hidden border flex-shrink-0 w-24" style={{ borderColor: t.vizDataBorder }}>
                {selectedClassic.baseColors.map((hex, i) => (
                  <div key={i} className="flex-1" style={{ background: hex }} title={hex.toUpperCase()} />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-green-100/60 text-[10px] mb-0.5">{selectedClassic.baseColors.length} base color{selectedClassic.baseColors.length === 1 ? '' : 's'}</div>
                <div className="text-green-100/80 text-[11px] italic">{selectedClassic.tip}</div>
              </div>
            </div>
            <p className="text-[10px] text-green-100/60 italic">▸ Inspired by the original palette. The ramp generator builds from this base; not the canonical full palette.</p>
          </div>
        );
      })()}
    </div>
  );
}
