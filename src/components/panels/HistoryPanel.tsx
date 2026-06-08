import { usePalette } from '../../contexts';

export function HistoryPanel() {
  const { historyEntries, historyIndex, jumpToHistoryIndex, canUndo, canRedo, formatHistoryAge } = usePalette();
  return (
    <div className="p-4 pt-0">
      <p className="text-[11px] text-purple-100/70 italic mb-3">
        ▸ Click any entry to jump there. Cmd/Ctrl+Z and Cmd/Ctrl+Y also work. Session-only: closing the tab clears history.
      </p>
      <div className="max-h-80 overflow-y-auto rounded border-2 border-purple-500/30 bg-black/20">
        {historyEntries.slice().reverse().map((entry, revIdx) => {
          const idx = historyEntries.length - 1 - revIdx;
          const isCurrent = idx === historyIndex;
          const isFuture = idx > historyIndex;
          return (
            <button
              key={`${idx}-${entry.timestamp}`}
              onClick={() => jumpToHistoryIndex(idx)}
              disabled={isCurrent}
              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-3 border-b border-purple-500/20 last:border-b-0 transition-colors ${
                isCurrent ? 'bg-purple-500/30 cursor-default' : isFuture ? 'opacity-50 hover:bg-purple-500/10' : 'hover:bg-purple-500/10'
              }`}
              title={isCurrent ? 'Current state' : (isFuture ? 'Redo to this state' : 'Undo to this state')}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-yellow-300' : isFuture ? 'bg-purple-400/40' : 'bg-cyan-400/60'}`} />
                <span className={`text-xs font-bold uppercase tracking-wider truncate ${isCurrent ? 'text-yellow-100' : 'text-purple-100'}`}>
                  {entry.label}
                </span>
              </div>
              <span className="text-[10px] text-purple-200/60 italic flex-shrink-0">
                {formatHistoryAge(entry.timestamp)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 text-[10px] text-purple-100/60 italic">
        <span>{canUndo ? 'Cmd/Ctrl+Z to undo' : 'Nothing to undo'}</span>
        <span>{canRedo ? 'Cmd/Ctrl+Y to redo' : 'Nothing to redo'}</span>
      </div>
    </div>
  );
}
