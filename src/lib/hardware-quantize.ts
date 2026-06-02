import { hexToOklch, deltaEOK } from './oklch';

export interface HardwarePalette {
  colors?: string[];
}

// Nearest hardware color by ΔE_OK (perceptual OKLab distance).
export const quantizeToHardware = (hex: string, hardware: HardwarePalette | null): string => {
  if (!hardware || !hardware.colors || hardware.colors.length === 0) return hex;
  const target = hexToOklch(hex);
  if (!target) return hardware.colors[0];
  let bestHex = hardware.colors[0];
  let bestDist = Infinity;
  for (const candidate of hardware.colors) {
    const co = hexToOklch(candidate);
    if (!co) continue;
    const d = deltaEOK(target, co);
    if (d < bestDist) { bestDist = d; bestHex = candidate; }
  }
  return bestHex;
};
