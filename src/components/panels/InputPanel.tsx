import { Dice5, Plus, Upload, Pipette, Sparkles, Copy, Image as ImageIcon } from 'lucide-react';
import { useTheme } from '../../contexts';
import { PixelSprite } from './RampsPanel';
import ShadeCountControl from '../ShadeCountControl';
import { DEFAULT_SPRITE_LIBRARY } from '../../lib/constants';

type SpriteLibrary = Record<string, { name: string; pattern: string[]; numShades: number }>;

interface InputPanelProps {
  mode: 'color' | 'image';
  setMode: (mode: 'color' | 'image') => void;
  colorInput: string;
  setColorInput: (value: string) => void;
  randomizeColor: () => void;
  addColorAsBase: () => void;
  addBaseFeedback: string;

  isDragging: boolean;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  imageDataUrl: string | null;
  handleImageUpload: (file: File) => void;
  imageColorCount: number;
  setImageColorCount: (n: number) => void;
  reExtractFromImage: () => void;
  imageLoading: boolean;
  eyedropperActive: boolean;
  setEyedropperActive: (active: boolean) => void;
  hoveredColor: string | null;
  imageZoom: number;
  setImageZoom: (n: number) => void;
  imageNaturalSize: { width: number; height: number };
  setImageNaturalSize: (size: { width: number; height: number }) => void;
  imageRef: React.RefObject<HTMLImageElement>;
  handleImageHover: (e: React.MouseEvent<HTMLImageElement>) => void;
  handleImageLeave: () => void;
  handleImageClick: (e: React.MouseEvent<HTMLImageElement>) => void;
  imageError: string;

  handleGenerate: () => void;

  spriteLibrary: SpriteLibrary;
  rampsPunchy: string[][];
  spriteKey: string;
  setSpriteKey: (key: string) => void;
  removeCustomSprite: (key: string) => void;
  copySpriteSource: (key: string) => void;
  showSpriteImporter: boolean;
  setShowSpriteImporter: (open: boolean) => void;
  spriteDragging: boolean;
  handleSpriteDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleSpriteDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  handleSpriteDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleSpriteFile: (file: File) => void;
  spriteImportName: string;
  setSpriteImportName: (name: string) => void;
  spriteImportText: string;
  setSpriteImportText: (text: string) => void;
  spriteImportError: string;
  setSpriteImportError: (error: string) => void;
  importSprite: () => void;

  rampSize: number;
  setRampSize: (n: number) => void;
  hueShiftStrength: number;
  setHueShiftStrength: (value: number) => void;
}

export function InputPanel(props: InputPanelProps) {
  const {
    mode, setMode, colorInput, setColorInput, randomizeColor, addColorAsBase,
    addBaseFeedback, isDragging, handleDragOver, handleDragLeave, handleDrop,
    imageDataUrl, handleImageUpload, imageColorCount, setImageColorCount,
    reExtractFromImage, imageLoading, eyedropperActive, setEyedropperActive,
    hoveredColor, imageZoom, setImageZoom, imageNaturalSize, setImageNaturalSize,
    imageRef, handleImageHover, handleImageLeave, handleImageClick, imageError,
    handleGenerate, spriteLibrary, rampsPunchy, spriteKey, setSpriteKey,
    removeCustomSprite, copySpriteSource, showSpriteImporter, setShowSpriteImporter,
    spriteDragging, handleSpriteDragOver, handleSpriteDragLeave, handleSpriteDrop,
    handleSpriteFile, spriteImportName, setSpriteImportName, spriteImportText,
    setSpriteImportText, spriteImportError, setSpriteImportError, importSprite,
    rampSize, setRampSize, hueShiftStrength, setHueShiftStrength,
  } = props;
  const { t, themedAccentBorder, accentGlow } = useTheme();

  return (
        <div className="rounded-lg p-6 mb-6 border-2 backdrop-blur-sm" style={{ background: t.cardBgPinkBright, borderColor: themedAccentBorder('#ff00ff'), boxShadow: t.glowStrong > 0.5 ? '0 0 30px rgba(255, 0, 255, 0.5), inset 0 0 20px rgba(0, 255, 255, 0.2)' : accentGlow('#ff00ff', 0.5) }}>
          <div className="flex flex-wrap gap-2 mb-4 justify-center" data-tour-id="mode-tabs">
            <button onClick={() => setMode('color')} data-tour-id="mode-single" title="Build a palette from a single hex color" className={`px-4 py-2 rounded font-bold transition-all border-2 uppercase tracking-wider text-sm ${mode === 'color' ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={mode === 'color' ? { boxShadow: '0 0 15px #00ffff' } : {}}>Single Color</button>
            <button onClick={() => setMode('image')} data-tour-id="mode-image" title="Extract a palette from an uploaded image" className={`px-4 py-2 rounded font-bold transition-all border-2 uppercase tracking-wider text-sm flex items-center gap-1 ${mode === 'image' ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-yellow-900/60 text-yellow-200 border-yellow-700/50 hover:bg-yellow-800/60'}`} style={mode === 'image' ? { boxShadow: '0 0 15px #ffff00' } : {}}><ImageIcon size={16} />From Image</button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center mb-4 flex-wrap">
            {mode === 'color' && (
              <div className="flex gap-2 items-center flex-wrap relative">
                <input type="color" value={colorInput} onChange={(e) => setColorInput(e.target.value)} title="Pick a base color from the OS color picker" className="w-14 h-14 rounded border-2 border-cyan-400 cursor-pointer" style={{ boxShadow: '0 0 10px #00ffff' }} />
                <input type="text" value={colorInput} onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setColorInput(v); }} data-tour-id="hex-input" title="Type a hex color (e.g. #ff6b35)" className="px-3 py-2 rounded bg-black/60 text-cyan-200 font-mono border-2 border-cyan-400 w-32 focus:outline-none" />
                <button onClick={randomizeColor} title="Roll a random hex into the input. Does not change the palette. Click Add base to append it, or New palette to replace the palette with it." className="px-3 py-2 rounded font-bold bg-pink-500 text-white border-2 border-pink-300 hover:bg-pink-400 hover:scale-105 transition-all" style={{ boxShadow: '0 0 12px #ff00ff' }}><Dice5 size={18} /></button>
                <button onClick={addColorAsBase} data-tour-id="add-base-btn" title="Append this color to the palette as a new base. Stays on this tab so you can keep building. Non-destructive: existing ramps, pins, and customizations are preserved." className="px-4 py-2 rounded font-bold bg-cyan-300 text-purple-900 border-2 border-cyan-100 hover:bg-cyan-200 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 15px #00ffff' }}>
                  <Plus size={18} />Add base
                </button>
                {addBaseFeedback && (
                  <span className="absolute -left-1 top-full mt-2 z-20 whitespace-nowrap text-xs font-bold px-2 py-1 rounded bg-cyan-500 text-purple-900 border-2 border-cyan-200 uppercase tracking-wider">{addBaseFeedback}</span>
                )}
              </div>
            )}
            {mode === 'image' && (
              <div className="flex flex-col items-center gap-3 w-full">
                <div onDragOver={handleDragOver} onDragEnter={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} data-tour-id="image-dropzone" className={`w-full rounded-lg border-4 border-dashed transition-all p-6 ${isDragging ? 'border-yellow-300 bg-yellow-500/20 scale-[1.02]' : 'border-yellow-500/60 bg-yellow-900/20 hover:bg-yellow-900/30'}`} style={isDragging ? { boxShadow: '0 0 30px #ffff00' } : {}}>
                  <div className="flex flex-col items-center gap-3">
                    <Upload size={32} className={`transition-all ${isDragging ? 'text-yellow-200 scale-125' : 'text-yellow-300'}`} style={{ filter: 'drop-shadow(0 0 8px #ffff00)' }} />
                    <div className="text-center text-yellow-100">
                      <p className="font-bold text-base mb-1 uppercase tracking-widest">{isDragging ? '>>> DROP IT <<<' : 'Drag & Drop Image'}</p>
                      <p className="text-xs opacity-80">or paste from clipboard (Ctrl/Cmd+V)</p>
                    </div>
                    <label className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 cursor-pointer text-sm uppercase tracking-wider" style={{ boxShadow: '0 0 12px #ffff00' }}>
                      <Upload size={16} />{imageDataUrl ? 'Choose Different' : 'Browse Files'}
                      <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} className="hidden" />
                    </label>
                  </div>
                </div>
                {imageDataUrl && (
                  <>
                    <div className="flex flex-col sm:flex-row gap-3 items-center flex-wrap justify-center">
                      <div className="flex gap-2 items-center text-yellow-100">
                        <span className="text-sm font-bold uppercase tracking-wider">Colors:</span>
                        {[3, 4, 5, 6].map(n => (
                          <button key={n} onClick={() => setImageColorCount(n)} title={`Extract ${n} base colors from this image`} className={`w-8 h-8 rounded font-bold border-2 text-sm transition-all ${imageColorCount === n ? 'bg-yellow-300 text-purple-900 border-yellow-100' : 'bg-purple-900/60 text-yellow-200 border-yellow-700/50 hover:bg-purple-800/60'}`}>{n}</button>
                        ))}
                      </div>
                      <button onClick={reExtractFromImage} disabled={imageLoading} title="Re-run color extraction on the current image" className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all disabled:opacity-60 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 10px #ffff00' }}>{imageLoading ? 'ANALYZING...' : 'Re-extract'}</button>
                      <button onClick={() => setEyedropperActive(!eyedropperActive)} title={eyedropperActive ? "Cancel eyedropper" : "Pick a color directly from the image by clicking it"} className={`px-4 py-2 rounded font-bold border-2 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm ${eyedropperActive ? 'bg-cyan-300 text-purple-900 border-cyan-100' : 'bg-cyan-700 text-cyan-100 border-cyan-900 hover:bg-cyan-600'}`} style={{ boxShadow: eyedropperActive ? '0 0 15px #00ffff' : '0 0 8px rgba(0, 255, 255, 0.4)' }}>
                        <Pipette size={16} />{eyedropperActive ? 'Click image...' : 'Eyedropper'}
                      </button>
                    </div>
                    {eyedropperActive && (
                      <div className="text-cyan-100 text-xs bg-cyan-900/40 border-2 border-cyan-500/50 rounded p-2 text-center uppercase tracking-wider">▸ Hover to preview, click to add ◂</div>
                    )}
                    {/* Zoom row for eyedropper precision. Integer multipliers
                        only, applied via inline width style with
                        image-rendering: pixelated so no resampling happens.
                        The wrapper scrolls when the zoomed image exceeds the
                        available width. */}
                    <div className="flex gap-2 items-center justify-center text-cyan-100">
                      <span className="text-xs font-bold uppercase tracking-wider">Zoom:</span>
                      {[1, 2, 4, 8].map(n => (
                        <button key={n} onClick={() => setImageZoom(n)} title={`Display the image at ${n}x for finer eyedropper precision`} className={`w-9 h-8 rounded font-bold border-2 text-xs transition-all ${imageZoom === n ? 'bg-cyan-300 text-purple-900 border-cyan-100' : `${t.controlBtnDefault} ${t.controlBtnHover}`}`} style={imageZoom === n ? { boxShadow: '0 0 8px #00ffff' } : {}}>{n}x</button>
                      ))}
                    </div>
                    <div className={`relative flex items-center justify-center bg-black/40 rounded border-2 p-2 overflow-auto max-h-[600px] ${eyedropperActive ? 'border-cyan-300' : 'border-pink-500/50'}`}>
                      {/* Zoom is applied by setting img width to naturalWidth
                          times the integer multiplier. Combined with
                          image-rendering: pixelated, the browser
                          nearest-neighbor scales it on display only. The
                          underlying naturalWidth/naturalHeight are unchanged,
                          so getPixelColorFromImage's coord math
                          (x/rect.width * naturalWidth) still resolves to the
                          exact source pixel. width is set via inline style
                          using a ref to read naturalWidth once the image
                          loads. */}
                      <img
                        ref={imageRef}
                        src={imageDataUrl}
                        alt="Uploaded"
                        className={imageZoom === 1 ? 'max-h-48 rounded' : 'rounded'}
                        style={{
                          imageRendering: 'pixelated',
                          cursor: eyedropperActive ? 'crosshair' : 'default',
                          ...(imageZoom > 1 && imageNaturalSize.width > 0 ? {
                            width: imageNaturalSize.width * imageZoom + 'px',
                            height: imageNaturalSize.height * imageZoom + 'px',
                            maxHeight: 'none',
                            maxWidth: 'none',
                          } : {}),
                        }}
                        onLoad={(e) => setImageNaturalSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                        onMouseMove={handleImageHover}
                        onMouseLeave={handleImageLeave}
                        onClick={handleImageClick}
                      />
                      {eyedropperActive && hoveredColor && (
                        <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/80 border-2 border-cyan-400 rounded px-2 py-1" style={{ boxShadow: '0 0 12px #00ffff', zIndex: 10 }}>
                          <div className="w-6 h-6 rounded border border-cyan-200" style={{ backgroundColor: hoveredColor }} />
                          <span className="text-cyan-200 text-xs font-mono font-bold">{hoveredColor.toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {imageError && <div className={`text-sm rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{imageError}</div>}
              </div>
            )}

            {mode === 'image' ? null : (
              <button onClick={handleGenerate} data-tour-id="new-palette-btn" title="Replace the palette with a new single-ramp palette built from the hex above. Destructive: wipes pins, hidden shades, ramp locks, side-by-side slots, harmony anchor, and per-ramp customizations. To keep your existing palette, click Add base instead." className="px-4 py-2 rounded font-bold bg-yellow-400 text-purple-900 border-2 border-yellow-200 hover:bg-yellow-300 hover:scale-105 transition-all flex items-center gap-2 uppercase tracking-wider text-sm" style={{ boxShadow: '0 0 10px #ffff00' }}>
                <Sparkles size={18} />New palette
              </button>
            )}
          </div>



          <div className="mt-4 pt-4 border-t border-cyan-700/30">
            <div className="flex flex-wrap gap-2 items-center justify-center text-cyan-100 mb-3">
              <span className="text-sm font-bold uppercase tracking-wider w-full sm:w-auto text-center">Preview Sprite:</span>
              {Object.entries(spriteLibrary).map(([key, sprite]) => {
                const previewRamp = rampsPunchy?.[0] || ['#000', '#444', '#888', '#fff'];
                const isCustom = !(key in DEFAULT_SPRITE_LIBRARY);
                return (
                  <div key={key} className="relative">
                    <button onClick={() => setSpriteKey(key)} className={`flex flex-col items-center gap-1 p-2 rounded border-2 transition-all ${spriteKey === key ? 'bg-cyan-300/30 border-cyan-300' : `${t.controlBtnDefault} ${t.controlBtnHover} hover:border-cyan-500/50`}`} style={spriteKey === key ? { boxShadow: '0 0 10px #00ffff' } : {}} title={sprite.name}>
                      <div className="w-12 h-12 flex items-center justify-center bg-black/40 rounded overflow-hidden">
                        <PixelSprite palette={previewRamp} scale={1.2} spriteKey={key} spriteLibrary={spriteLibrary} />
                      </div>
                      <span className={`text-[10px] uppercase tracking-wider ${spriteKey === key ? 'text-cyan-200' : t.bodyText}`}>{sprite.name}</span>
                    </button>
                    {isCustom && (
                      <>
                        <button onClick={() => removeCustomSprite(key)} className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white rounded-full border border-pink-200 hover:bg-pink-400 flex items-center justify-center text-xs font-bold" title="Remove">×</button>
                        <button onClick={(e) => { e.stopPropagation(); copySpriteSource(key); }} className="absolute -top-1 -left-1 w-5 h-5 bg-cyan-400 text-purple-900 rounded-full border border-cyan-200 hover:bg-cyan-300 flex items-center justify-center" title="Copy sprite source"><Copy size={10} /></button>
                      </>
                    )}
                  </div>
                );
              })}
              <button onClick={() => setShowSpriteImporter(!showSpriteImporter)} title="Open the sprite importer to add a custom preview sprite from a Piskel .c export" className="flex flex-col items-center gap-1 p-2 rounded border-2 border-dashed border-pink-400 bg-pink-900/30 hover:bg-pink-900/50 transition-all">
                <div className="w-12 h-12 flex items-center justify-center text-pink-300 text-2xl font-bold">+</div>
                <span className="text-[10px] uppercase tracking-wider text-pink-200">Import</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-4 items-center justify-center text-cyan-100 mt-3 pt-3 border-t border-cyan-700/20">
              <div className="flex gap-2 items-center">
                <span className="text-sm font-bold uppercase tracking-wider">Shades:</span>
                <ShadeCountControl
                  value={rampSize}
                  onCommit={setRampSize}
                  accentClassName="accent-cyan-300"
                  inputClassName={`w-14 h-9 rounded font-bold text-center border-2 bg-transparent tabular-nums ${t.controlBtnDefault}`}
                  ariaLabel="Shades per ramp"
                  title={`Shades per ramp, 2-64 (default for new and unset ramps). Currently ${rampSize}.`}
                />
              </div>
              <div className="flex gap-2 items-center" title="Scales the warm/cool hue shifts applied to shadows and highlights. 0% is flat, 100% is the default, 200% is painterly. Affects all styles.">
                <span className="text-sm font-bold uppercase tracking-wider">Hue Shift:</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  step="5"
                  value={Math.round(hueShiftStrength * 100)}
                  onChange={(e) => setHueShiftStrength(Number(e.target.value) / 100)}
                  className="w-32 accent-cyan-300"
                  aria-label="Hue shift strength"
                  title={`Hue shift strength: ${Math.round(hueShiftStrength * 100)}%`}
                />
                <span className="text-sm font-mono text-cyan-200 w-12 text-right tabular-nums">{Math.round(hueShiftStrength * 100)}%</span>
                {hueShiftStrength !== 1.0 && (
                  <button
                    onClick={() => setHueShiftStrength(1.0)}
                    title="Reset Hue Shift to 100% (default)"
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${t.controlBtnDefault} ${t.controlBtnHover}`}
                  >Reset</button>
                )}
              </div>
            </div>

            {showSpriteImporter && (
              <div className="mt-3 p-4 rounded border-2 border-pink-500/50 bg-black/40">
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-pink-200 uppercase tracking-wider">▸ Import sprite from Piskel C file</p>
                  <div onDragOver={handleSpriteDragOver} onDragEnter={handleSpriteDragOver} onDragLeave={handleSpriteDragLeave} onDrop={handleSpriteDrop} className={`rounded border-2 border-dashed transition-all p-3 ${spriteDragging ? 'border-cyan-300 bg-cyan-500/20 scale-[1.02]' : 'border-cyan-500/40 bg-cyan-900/20 hover:bg-cyan-900/30'}`}>
                    <div className="flex flex-col items-center gap-2">
                      <Upload size={24} className={`transition-all ${spriteDragging ? 'text-cyan-200 scale-125' : 'text-cyan-300'}`} />
                      <p className="text-xs text-cyan-100 text-center">{spriteDragging ? '>>> DROP IT <<<' : 'Drop .c file or paste below'}</p>
                      <label className="px-3 py-1.5 rounded font-bold bg-cyan-400 text-purple-900 border-2 border-cyan-200 hover:bg-cyan-300 transition-all flex items-center gap-2 cursor-pointer text-xs uppercase tracking-wider">
                        <Upload size={14} />Browse for .c file
                        <input type="file" accept=".c,.txt,text/plain" onChange={(e) => e.target.files?.[0] && handleSpriteFile(e.target.files[0])} className="hidden" />
                      </label>
                    </div>
                  </div>
                  <input type="text" value={spriteImportName} onChange={(e) => setSpriteImportName(e.target.value)} placeholder="Sprite name (e.g. Walkman)" title="Name shown under the sprite tile in the preview row" className="px-3 py-2 rounded bg-black/60 text-cyan-200 border-2 border-cyan-400 w-full text-sm focus:outline-none" />
                  <textarea value={spriteImportText} onChange={(e) => setSpriteImportText(e.target.value)} placeholder="...or paste the C array text" title="Paste the contents of a Piskel C export here" className="px-3 py-2 rounded bg-black/60 text-cyan-200 font-mono text-xs border-2 border-cyan-400 w-full focus:outline-none" rows={4} />
                  {spriteImportError && <div className={`text-xs rounded p-2 border-2 ${t.alertErrorBg} ${t.alertErrorText} ${t.alertErrorBorder}`}>{spriteImportError}</div>}
                  <div className="flex gap-2">
                    <button onClick={importSprite} title="Add this sprite to the preview library" className="px-4 py-2 rounded font-bold bg-pink-400 text-purple-900 border-2 border-pink-200 hover:bg-pink-300 hover:scale-105 transition-all uppercase tracking-wider text-sm flex-1" style={{ boxShadow: '0 0 10px #ff00ff' }}>Import Sprite</button>
                    <button onClick={() => { setShowSpriteImporter(false); setSpriteImportError(''); }} title="Close the importer without saving" className="px-4 py-2 rounded font-bold bg-purple-700 text-cyan-100 border-2 border-cyan-500 hover:bg-purple-600 transition-all uppercase tracking-wider text-sm">Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
  );
}
