import { useRef, type ReactNode } from 'react';
import { Copy, Download, Contrast, Cpu, FolderOpen, Upload } from 'lucide-react';
import { useTheme } from '../../contexts';
import { HARDWARE_PALETTES } from '../../lib/constants';

export interface ExportPanelProps {
  copyPaletteToClipboard: () => void;
  exportLightnessPng: (snap: any) => void;
  exportMosaicPng: (snap: any) => void;
  getSnapshotForSlot: (slot: string, cached: any) => any;
  toggleCompareMode: () => void;
  compareMode: boolean;
  hardwareLock: string | null;
  hwPickerOpen: boolean;
  setHwPickerOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  exportFeedback: string;
  lastSavedPath: string | null;
  revealLastSaved: () => void;
  bakeHardwareLock: () => void;
  toggleHardwareLock: (id: string) => void;
  exportFormat: string;
  setExportFormat: (format: string) => void;
  exportActiveFormat: () => void;
  handleGplFile: (file: File) => void;
}

export function ExportPanel({
  copyPaletteToClipboard, exportLightnessPng, exportMosaicPng, getSnapshotForSlot,
  toggleCompareMode, compareMode, hardwareLock, hwPickerOpen, setHwPickerOpen,
  exportFeedback, lastSavedPath, revealLastSaved, bakeHardwareLock, toggleHardwareLock,
  exportFormat, setExportFormat, exportActiveFormat, handleGplFile,
}: ExportPanelProps): ReactNode {
  const { t, themedAccentBorder, accentGlow, sectionHeadColor, accentTextGlow } = useTheme();
  const gplFileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="px-6 pb-6 space-y-4">
      {/* Download / Copy / WCAG / Hardware Lock */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={copyPaletteToClipboard} title="Copy the active palette to the clipboard as plain text" className="px-4 py-1.5 rounded font-bold bg-pink-400 text-purple-900 border-2 border-pink-100 hover:bg-pink-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #ff00ff' }}><Copy size={14} />Copy</button>
          <button onClick={() => exportLightnessPng(getSnapshotForSlot('working', null))} title="Download the Lightness Distribution strip as a PNG (current style)" className="px-4 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Lightness PNG</button>
          <button onClick={() => exportMosaicPng(getSnapshotForSlot('working', null))} title="Download the Mosaic as a PNG (current style)" className="px-4 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #00ffff' }}><Download size={14} />Mosaic PNG</button>
          <button
            onClick={toggleCompareMode}
            data-tour-id="wcag-check-btn"
            title={compareMode ? 'Exit WCAG Check' : 'Enter WCAG Check: click any two ramp swatches to see their WCAG contrast ratio'}
            className={`px-4 py-1.5 rounded font-bold border-2 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs ${compareMode ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-200 border-yellow-500/50 hover:bg-purple-800/60'}`}
            style={compareMode ? { boxShadow: '0 0 12px #ffff00' } : {}}
          >
            <Contrast size={14} />{compareMode ? 'Checking (click to exit)' : 'WCAG Check'}
          </button>
          {!hardwareLock && (
            <button
              data-tour-id="hardware-lock-btn"
              onClick={() => setHwPickerOpen(o => !o)}
              title={hwPickerOpen ? 'Close hardware palette picker' : 'Snap all shades to a hardware color palette'}
              className={`px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider flex items-center gap-2 ${hwPickerOpen ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-yellow-700/40'}`}
              style={hwPickerOpen ? { boxShadow: '0 0 12px rgba(255, 255, 0, 0.6)' } : {}}
            >
              <Cpu size={14} />Hardware Lock
            </button>
          )}
          {exportFeedback && <span className="px-3 py-1 rounded bg-cyan-500 text-purple-900 text-xs font-bold border-2 border-cyan-200 uppercase tracking-wider">{exportFeedback}</span>}
          {/* lastSavedPath is only set on desktop (browser saves return no path), so this is implicitly desktop-only. */}
          {lastSavedPath && (
            <button onClick={revealLastSaved} title="Show the last exported file in your file manager" className="px-4 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #00ffff' }}><FolderOpen size={14} />Reveal in folder</button>
          )}
        </div>

        {hardwareLock && (
          <div
            className="rounded-lg border-2 p-3 flex flex-col gap-2"
            style={{ background: t.cardBgViz, borderColor: themedAccentBorder('#ffff00'), boxShadow: accentGlow('#ffff00', 0.3) }}
          >
            <div className="flex items-center gap-2">
              <Cpu size={14} style={{ color: sectionHeadColor('#ffff00') }} />
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: sectionHeadColor('#ffff00'), textShadow: accentTextGlow('#ffff00') }}>
                Hardware Lock
              </span>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: sectionHeadColor('#ffff00') }}>Locked:</span>
              <span className="px-3 py-1.5 rounded font-bold border-2 text-xs uppercase tracking-wider bg-yellow-300 text-purple-900 border-yellow-100" style={{ boxShadow: '0 0 12px rgba(255, 255, 0, 0.6)' }}>
                {HARDWARE_PALETTES.find(hw => hw.id === hardwareLock)?.name}
              </span>
              <button onClick={bakeHardwareLock} title="Bake the current locked output into permanent pins." className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-cyan-500 text-purple-900 border-cyan-100 hover:bg-cyan-400" style={{ boxShadow: '0 0 10px rgba(0, 255, 255, 0.6)' }}>Bake into pins</button>
              <button onClick={() => toggleHardwareLock(hardwareLock)} title="Unlock and return to free generation" className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider bg-pink-500 text-white border-pink-200 hover:bg-pink-400">Unlock</button>
            </div>
          </div>
        )}

        {!hardwareLock && hwPickerOpen && (
          <div className="flex gap-2 flex-wrap">
            {HARDWARE_PALETTES.map(hw => (
              <button
                key={hw.id}
                onClick={() => { toggleHardwareLock(hw.id); setHwPickerOpen(false); }}
                title={`${hw.description}. While locked, all generated shades snap to ${hw.name}.`}
                className="px-3 py-1.5 rounded font-bold border-2 transition-all text-xs uppercase tracking-wider hover:scale-105 bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-yellow-700/40"
              >
                {hw.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-white/10" />
      {/* Export-format row. Each ramp exports at its own active style (#69),
          so there is no whole-palette style selector here anymore. */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: sectionHeadColor('#ffff00') }}>export:</span>
        <select
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value)}
          title="Choose the export format"
          aria-label="Export format"
          className="px-3 py-1.5 rounded font-bold border-2 text-xs uppercase tracking-wider bg-purple-900/60 text-cyan-100 border-cyan-700/50"
        >
          <option value="gpl">.gpl (Aseprite / GIMP / Krita)</option>
          <option value="pal">.pal (GrafX2 / Paint Shop Pro)</option>
          <option value="ase">Adobe Swatch Exchange (.ase)</option>
          <option value="png-strip">PNG strip (eyedropper, any editor)</option>
          <option value="txt">.txt (plain hex list)</option>
        </select>
        <button onClick={exportActiveFormat} data-tour-id="gpl-export-btn" title="Download the active palette in the selected format and style. Adobe .ase targets Photoshop/Illustrator/Krita, NOT Aseprite (Aseprite users: pick .gpl, .pal, or PNG strip)." className="px-4 py-1.5 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #ffff00' }}><Download size={14} />Download</button>
        <button onClick={() => gplFileInputRef.current?.click()} data-tour-id="gpl-import-btn" title="Import a .gpl palette file from Piskel, Aseprite, GIMP, Krita, or any GIMP-compatible tool. Replaces the current palette." className="px-4 py-1.5 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-xs" style={{ boxShadow: '0 0 10px #ffff00' }}><Upload size={14} />Import .gpl</button>
        <input ref={gplFileInputRef} type="file" accept=".gpl,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleGplFile(f); e.target.value = ''; }} className="hidden" />
      </div>
    </div>
  );
}
