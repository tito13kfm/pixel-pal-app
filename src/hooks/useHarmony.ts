// Harmony add handlers (#113): append derived harmony colors to the
// palette as new bases.
//
// Extracted from App.tsx. Owns no state: reads baseColors and writes
// through the setters passed in (App.tsx sources both from
// usePaletteState()). Consumed by HarmonyPanel via App.tsx prop wiring.
//
// All three handlers skip colors already present in baseColors (the base
// itself is already a ramp) and pad aiColorNames up to the current base
// count before appending, so names stay index-aligned even when earlier
// bases never got a name.
import { useCallback } from 'react';

interface UseHarmonyParams {
  baseColors: string[];
  setBaseColors: (updater: (prev: string[]) => string[]) => void;
  setAiColorNames: (updater: (prev: string[]) => string[]) => void;
}

export function useHarmony({ baseColors, setBaseColors, setAiColorNames }: UseHarmonyParams) {
  const addHarmonyColor = useCallback((hex: string, name: string) => {
    if (baseColors.includes(hex)) return;
    setBaseColors(prev => [...prev, hex]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      padded.push(name);
      return padded;
    });
  }, [baseColors, setBaseColors, setAiColorNames]);

  const addHarmonyPair = useCallback((hex1: string, hex2: string, name1: string, name2: string) => {
    const toAdd: string[] = [], namesToAdd: string[] = [];
    if (!baseColors.includes(hex1)) { toAdd.push(hex1); namesToAdd.push(name1); }
    if (!baseColors.includes(hex2) && hex1 !== hex2) { toAdd.push(hex2); namesToAdd.push(name2); }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  }, [baseColors, setBaseColors, setAiColorNames]);

  // N-ary version for tetradic/square which add 3 derived colors (the base
  // itself is already a ramp). Skips any color that's already in baseColors
  // and any duplicate among the input pairs.
  const addHarmonyMany = useCallback((pairs: { hex: string; name: string }[]) => {
    const toAdd: string[] = [], namesToAdd: string[] = [];
    for (const { hex, name } of pairs) {
      if (baseColors.includes(hex)) continue;
      if (toAdd.includes(hex)) continue;
      toAdd.push(hex);
      namesToAdd.push(name);
    }
    if (toAdd.length === 0) return;
    setBaseColors(prev => [...prev, ...toAdd]);
    setAiColorNames(prev => {
      const padded = [...prev];
      while (padded.length < baseColors.length) padded.push('');
      return [...padded, ...namesToAdd];
    });
  }, [baseColors, setBaseColors, setAiColorNames]);

  return { addHarmonyColor, addHarmonyPair, addHarmonyMany };
}
