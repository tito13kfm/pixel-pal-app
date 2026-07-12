import { useEffect, useState } from 'react';
import { MIN_RAMP_SIZE, MAX_RAMP_SIZE, isValidRampSize } from '../lib/ramp-engine';

// Shade-count picker: slider for scrubbing + number input for precision,
// covering the engine's full 2..64 range (the old 4..8 button row couldn't
// scale to 63 values). Used for both the global rampSize (InputPanel) and
// the per-ramp override (RampsPanel), which style it via accent/inputClassName.
//
// The number input keeps a local draft while the user types, so intermediate
// states ("1" on the way to "12") don't get clamped or committed mid-keystroke.
// A draft commits when it parses to an in-range integer; blur or Enter snaps
// an out-of-range draft to the nearest bound.
interface ShadeCountControlProps {
  value: number;
  onCommit: (n: number) => void;
  accentClassName: string;   // Tailwind accent-* for the slider
  inputClassName: string;    // full styling for the number input
  ariaLabel: string;
  title?: string;
}

export default function ShadeCountControl({ value, onCommit, accentClassName, inputClassName, ariaLabel, title }: ShadeCountControlProps) {
  const [draft, setDraft] = useState(String(value));
  // gen keys the number input; bumping it remounts the node. Needed because
  // React won't re-sync a controlled number input whose DOM text diverged
  // from the state (an emptied or garbage draft on blur), so a state-only
  // restore can leave stale text visible.
  const [gen, setGen] = useState(0);
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commitDraft = (el: HTMLInputElement) => {
    const raw = el.value;
    let next = value;
    if (raw.trim() !== '') {
      const n = Number(raw);
      if (isValidRampSize(n)) next = n;
      else if (Number.isFinite(n)) next = Math.max(MIN_RAMP_SIZE, Math.min(MAX_RAMP_SIZE, Math.round(n)));
    }
    if (next !== value) onCommit(next);
    setDraft(String(next));
    if (raw !== String(next)) setGen(g => g + 1);
  };

  return (
    <div className="flex gap-2 items-center" title={title}>
      <input
        type="range"
        min={MIN_RAMP_SIZE}
        max={MAX_RAMP_SIZE}
        step={1}
        value={value}
        onChange={(e) => onCommit(Number(e.target.value))}
        className={`w-28 ${accentClassName}`}
        aria-label={ariaLabel}
      />
      <input
        key={gen}
        type="number"
        min={MIN_RAMP_SIZE}
        max={MAX_RAMP_SIZE}
        step={1}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && isValidRampSize(n)) onCommit(n);
        }}
        onBlur={(e) => commitDraft(e.target)}
        onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(e.target as HTMLInputElement); }}
        className={inputClassName}
        aria-label={`${ariaLabel} (number)`}
      />
    </div>
  );
}
