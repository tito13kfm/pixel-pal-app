import { createContext, useContext, type ReactNode } from 'react';

// `t` is the active theme-token object; the helpers are closures over it that
// App.tsx already defines (themedAccent/themedAccentBorder/accentGlow/
// accentTextGlow/sectionHeadColor). Typed loosely (App.tsx is @ts-nocheck and
// these are untyped color-math closures); the contract is "whatever App passes".
export interface ThemeValue {
  t: any;
  themedAccent: (hex: string) => string;
  themedAccentBorder: (hex: string) => string;
  accentGlow: (hex: string, amt: number) => string;
  accentTextGlow: (hex: string) => string;
  sectionHeadColor: (hex: string) => string;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ value, children }: { value: ThemeValue; children: ReactNode }) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme must be used within AppProviders');
  return v;
}
