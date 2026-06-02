import { hexToRgb } from './color';

// WCAG 2.1 relative luminance — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
export const wcagRelativeLuminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

// WCAG 2.1 contrast ratio in [1, 21]. Argument order does not matter.
export const wcagContrast = (hex1: string, hex2: string): number => {
  const L1 = wcagRelativeLuminance(hex1);
  const L2 = wcagRelativeLuminance(hex2);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
};

// Strongest AA tier the ratio satisfies, or 'fail'. Thresholds: 4.5 normal text, 3.0 large/UI.
export const wcagAaTier = (ratio: number): 'AA' | 'AA Large' | 'fail' => {
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3.0) return 'AA Large';
  return 'fail';
};
