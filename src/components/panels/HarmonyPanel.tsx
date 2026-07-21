import { memo } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import { useTheme } from '../../contexts';
import { recordRender } from '../../lib/renderCount';
import type { HarmonySet } from '../../lib/harmony';
import { MOOD_PRESETS } from '../../lib/constants';

export interface HarmonyPanelProps {
  baseColors: string[];
  aiColorNames: string[];
  safeAnchor: number;
  lockedRamps: Set<number>;
  harmonizeMode: string;
  setHarmonizeMode: (key: string) => void;
  harmonizeBaseline: string[] | null;
  restoreHarmonizeBaseline: () => void;
  harmonize: () => void;
  moodPreset: string | null;
  setMoodPreset: (id: string | null) => void;
  harmony: HarmonySet;
  addHarmonyPair: (h1: string, h2: string, n1: string, n2: string) => void;
  addHarmonyMany: (items: { hex: string; name: string }[]) => void;
  setHarmonyAnchor: (i: number) => void;
  addHarmonyColor: (hex: string, name: string) => void;
}

function HarmonyPanelImpl({
  baseColors,
  aiColorNames,
  safeAnchor,
  lockedRamps,
  harmonizeMode,
  setHarmonizeMode,
  harmonizeBaseline,
  restoreHarmonizeBaseline,
  harmonize,
  moodPreset,
  setMoodPreset,
  harmony,
  addHarmonyPair,
  addHarmonyMany,
  setHarmonyAnchor,
  addHarmonyColor,
}: HarmonyPanelProps) {
  recordRender('HarmonyPanel');
  const { t } = useTheme();

  const HarmonySwatch = ({ hex, name, tourId }: { hex: string; name: string; tourId?: string }) => {
    const isAdded = baseColors.some(h => h.toLowerCase() === hex.toLowerCase());
    return (
      <button
        onClick={() => addHarmonyColor(hex, name)}
        data-tour-id={tourId}
        disabled={isAdded}
        title={isAdded ? `${name} (${hex.toUpperCase()}) is already in the palette` : `Add ${name} (${hex.toUpperCase()}) as a new base`}
        className={`relative w-14 h-14 rounded border-2 border-pink-400 transition-all cursor-pointer group ${isAdded ? 'opacity-60 cursor-not-allowed' : 'hover:scale-110 hover:ring-2 hover:ring-cyan-400'}`}
        style={{ backgroundColor: hex, boxShadow: '0 0 8px rgba(255, 0, 255, 0.4)' }}
      >
        {isAdded && <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded text-cyan-200 text-lg font-bold">{'✓'}</div>}
        {!isAdded && <div className="absolute -top-1 -right-1 w-5 h-5 bg-cyan-300 border-2 border-cyan-100 rounded-full flex items-center justify-center text-purple-900 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">+</div>}
      </button>
    );
  };

  const PairCard = ({ title, tip, hexes, names, addLabel = '+ Add Both' }: {
    title: string;
    tip: string;
    hexes: string[];
    names: string[];
    addLabel?: string;
  }) => {
    const allAdded = hexes.every(h => baseColors.some(b => b.toLowerCase() === h.toLowerCase()));
    return (
      <div className="flex flex-col items-center p-3 bg-black/60 rounded border border-pink-500/40">
        <span title={tip} className="text-xs font-bold text-pink-200 mb-2 uppercase tracking-wider cursor-help border-b border-dashed border-pink-400/40">{title}</span>
        <div className="flex gap-2 mb-2 flex-wrap justify-center">
          {hexes.map((hex, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1">
              <HarmonySwatch hex={hex} name={names[idx]} />
              <span className="text-[10px] font-mono text-cyan-200">{hex.toUpperCase()}</span>
            </div>
          ))}
        </div>
        {hexes.length === 1 ? null : (
          <button
            onClick={() => hexes.length === 2
              ? addHarmonyPair(hexes[0], hexes[1], names[0], names[1])
              : addHarmonyMany(hexes.map((h, k) => ({ hex: h, name: names[k] })))}
            disabled={allAdded}
            title={hexes.length === 2 ? "Add both harmony colors as new bases" : "Add all harmony colors as new bases"}
            className="text-[10px] px-2 py-1 rounded bg-pink-600 text-white border border-pink-300 hover:bg-pink-500 transition-all font-bold disabled:opacity-40 uppercase tracking-wider"
          >
            {addLabel}
          </button>
        )}
      </div>
    );
  };

  const tips = {
    complementary: 'Opposite hues on the wheel. Maximum contrast and high energy. Use for focal points like enemy eyes against a background, or a hero against the environment. Can clash if both are fully saturated.',
    analogous: 'Adjacent hues within 30 degrees. Low contrast, calm, harmonious. Use for cohesive natural scenes: forests, oceans, sunsets, anything that should feel unified.',
    triadic: 'Three hues evenly spaced 120 degrees apart. Vivid and balanced. Use for playful character palettes: a hero plus two distinct accent pieces. Strong but more flexible than complementary.',
    splitComp: 'The base plus two hues flanking its complement (150 and 210 degrees). Same punch as complementary but softer. Use when complementary feels too harsh. Good for cozy indoor scenes.',
    tetradic: 'Four hues forming a rectangle on the wheel (two complementary pairs). Rich and complex. Use for scenes with multiple distinct elements like a market stall. Hard to balance; let one color dominate and others accent.',
    square: 'Four hues evenly spaced 90 degrees apart. Bold, graphic, retro-arcade. Maximum balanced contrast. All four will fight if equally weighted; treat one as dominant and the rest as accents.',
  };

  return (
    <div className="px-6 pb-6">
      <p className="text-xs text-pink-100/80 mb-4 italic bg-black/60 rounded px-2 py-1">▸ Click any swatch to add a ramp, or "Add All" / "Add Both" for sets ◂ Hover a category name for tips ◂</p>
      {baseColors.length > 1 && (
        <div className="mb-4 p-3 rounded border-2 border-pink-500/40 bg-black/60">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-pink-200 uppercase tracking-wider">▸ Derive From:</span>
            <div className="flex gap-2 flex-wrap items-center">
              {baseColors.map((hex, i) => {
                const selected = safeAnchor === i;
                const labelName = aiColorNames[i] || `Color ${i + 1}`;
                return (
                  <button
                    key={`anchor-${i}`}
                    onClick={() => setHarmonyAnchor(i)}
                    title={`Use ${labelName} (${hex.toUpperCase()}) as harmony source`}
                    className={`flex items-center gap-2 px-2 py-1 rounded border-2 transition-all ${selected ? 'border-pink-200 bg-pink-500/30 scale-105' : 'border-pink-700/50 bg-purple-900/40 hover:bg-purple-800/60 hover:border-pink-400/60'}`}
                    style={selected ? { boxShadow: '0 0 10px rgba(255, 0, 255, 0.6)' } : {}}
                  >
                    <div className="w-6 h-6 rounded border flex-shrink-0" style={{ backgroundColor: hex, borderColor: t.vizDataBorder }} />
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${selected ? 'text-pink-100' : 'text-pink-300/80'}`}>{labelName}</span>
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex flex-col items-end gap-1.5">
              {(() => {
                const anchorName = aiColorNames[safeAnchor] || `Color ${safeAnchor + 1}`;
                let unlockedCount = 0;
                for (let i = 0; i < baseColors.length; i++) {
                  if (i === safeAnchor) continue;
                  if (lockedRamps.has(i)) continue;
                  unlockedCount++;
                }
                const disabled = unlockedCount === 0;
                const activeMoodName = moodPreset ? (MOOD_PRESETS.find(m => m.id === moodPreset)?.name || null) : null;
                const MODES = [
                  { key: 'complement',       label: 'Compl.',  tip: 'All unlocked ramps snap to the complementary hue (180° from anchor). Maximum contrast.' },
                  { key: 'analogous',        label: 'Analog',  tip: 'Ramps cluster tightly around the anchor (±15-60°). Low contrast, cohesive feel.' },
                  { key: 'triadic',          label: 'Triadic', tip: 'Ramps distributed at 120° intervals around the wheel. Balanced and vibrant.' },
                  { key: 'split-complement', label: 'Split',   tip: 'Ramps land at ±150° from anchor (adjacent to the complement). Softer than straight complement.' },
                  { key: 'square',           label: 'Square',  tip: 'Ramps at 90° intervals around the wheel. Even spacing, four-color symmetry.' },
                  { key: 'tetradic',         label: 'Tetrad',  tip: 'Two complementary pairs with a 60° offset between them (rectangle on the wheel).' },
                ];
                return (
                  <>
                    <div className="flex flex-wrap justify-end gap-1">
                      {MODES.map(({ key, label, tip }) => (
                        <button
                          key={key}
                          onClick={() => setHarmonizeMode(key)}
                          title={tip}
                          className={`px-2 py-0.5 rounded font-bold border transition-all text-[10px] uppercase tracking-wider ${
                            harmonizeMode === key
                              ? 'bg-pink-400 text-purple-900 border-pink-100'
                              : 'bg-purple-900/40 text-pink-300/80 border-pink-700/40 hover:bg-purple-800/60 hover:border-pink-500/60'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {/* Mood preset (#135): sibling of Hardware Lock, bound to
                        the same state as the Input panel's select. Clamps
                        harmonized hues into the mood's envelope. */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-pink-200 uppercase tracking-wider">Mood:</span>
                      <select
                        value={moodPreset ?? ''}
                        onChange={(e) => setMoodPreset(e.target.value || null)}
                        aria-label="Mood preset for Harmonize"
                        title={moodPreset
                          ? (MOOD_PRESETS.find(m => m.id === moodPreset)?.tip || 'Mood preset')
                          : 'Clamp harmonized colors into a hand-tuned genre envelope (hue, saturation, lightness). Also biases the Surprise Me generator. Curated data, no AI.'}
                        className="px-2 py-1 rounded font-bold bg-purple-900/40 text-pink-300/80 border border-pink-700/40 hover:bg-purple-800/60 uppercase tracking-wider text-[10px] cursor-pointer focus:outline-none"
                      >
                        <option value="">No mood</option>
                        {MOOD_PRESETS.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      {harmonizeBaseline && (
                        <button
                          onClick={restoreHarmonizeBaseline}
                          title="Restore the hues from before any Harmonize was applied. Saturation and lightness stay as-is."
                          className="px-2 py-1.5 rounded font-bold border-2 transition-all flex items-center gap-1 uppercase tracking-wider text-[10px] bg-yellow-400 text-purple-900 border-yellow-100 hover:bg-yellow-300"
                          style={{ boxShadow: '0 0 8px rgba(255, 230, 0, 0.4)' }}
                        >
                          <RotateCcw size={11} />Restore
                        </button>
                      )}
                      <button
                        onClick={harmonize}
                        data-tour-id="harmonize-btn"
                        disabled={disabled}
                        title={disabled
                          ? 'Nothing to harmonize: every non-anchor ramp is locked.'
                          : `Snap hues of ${unlockedCount} unlocked ramp${unlockedCount === 1 ? '' : 's'} to ${harmonizeMode.replace('-', ' ')} positions relative to ${anchorName}. Saturation and lightness preserved.`}
                        className={`px-3 py-2 rounded font-bold border-2 transition-all flex items-center gap-2 uppercase tracking-wider text-xs ${disabled
                          ? 'bg-purple-900/40 text-pink-300/40 border-pink-700/30 cursor-not-allowed'
                          : 'bg-pink-400 text-purple-900 border-pink-100 hover:bg-pink-300 hover:scale-105'}`}
                        style={disabled ? {} : { boxShadow: '0 0 10px rgba(255, 0, 255, 0.5)' }}
                      >
                        <Sparkles size={14} />Harmonize
                      </button>
                    </div>
                    <span className="text-[10px] text-pink-200/70 italic">
                      {disabled
                        ? 'All non-anchor ramps are locked.'
                        : `Will rotate ${unlockedCount} ramp${unlockedCount === 1 ? '' : 's'}: ${harmonizeMode.replace('-', ' ')}${activeMoodName ? `, clamped to ${activeMoodName}` : ''}.`}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="flex flex-col items-center p-3 bg-black/60 rounded border border-pink-500/40">
          <span title={tips.complementary} className="text-xs font-bold text-pink-200 mb-2 uppercase tracking-wider cursor-help border-b border-dashed border-pink-400/40">Complementary</span>
          <HarmonySwatch hex={harmony.complementary} name="complementary" tourId="harmony-complementary-swatch" />
          <span className="text-[10px] font-mono text-cyan-200 mt-1">{harmony.complementary.toUpperCase()}</span>
        </div>
        <PairCard
          title="Analogous"
          tip={tips.analogous}
          hexes={[harmony.analogous1, harmony.analogous2]}
          names={['analogous 1', 'analogous 2']}
        />
        <PairCard
          title="Triadic"
          tip={tips.triadic}
          hexes={[harmony.triadic1, harmony.triadic2]}
          names={['triadic 1', 'triadic 2']}
        />
        <PairCard
          title="Split-Comp"
          tip={tips.splitComp}
          hexes={[harmony.splitComp1, harmony.splitComp2]}
          names={['split-comp 1', 'split-comp 2']}
        />
        <PairCard
          title="Tetradic"
          tip={tips.tetradic}
          hexes={[harmony.tetradic1, harmony.tetradic2, harmony.tetradic3]}
          names={['tetradic 1', 'tetradic 2', 'tetradic 3']}
          addLabel="+ Add All"
        />
        <PairCard
          title="Square"
          tip={tips.square}
          hexes={[harmony.square1, harmony.square2, harmony.square3]}
          names={['square 1', 'square 2', 'square 3']}
          addLabel="+ Add All"
        />
      </div>
    </div>
  );
}

export const HarmonyPanel = memo(HarmonyPanelImpl);
