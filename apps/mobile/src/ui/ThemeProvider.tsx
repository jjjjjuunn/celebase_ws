// Reactive theme context. Primitives read `useTheme()` and recompute styles when
// the mode changes, so dark mode is a runtime switch.
//
// Dark mode is now STRUCTURALLY UNBLOCKED (IMPL-MOBILE-DESIGN-CONSOLIDATION-001):
// every screen / component / navigator consumes useTheme() — zero static
// `resolveToken('light', …)` outside the theme builder, so flipping the mode no
// longer renders a half-dark app. Still pinned to 'light' pending a dark-mode
// visual QA pass; flip `FOLLOW_SYSTEM` (or wire setMode to a Settings toggle) once
// dark is reviewed on-device.

import { createContext, useContext, useMemo, useState } from 'react';

import { getTheme, type Theme, type ThemeMode } from './theme';

const FOLLOW_SYSTEM = false;

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Force an initial mode (tests pass 'dark' to snapshot both themes). */
  initialMode?: ThemeMode;
}

export function ThemeProvider({
  children,
  initialMode = 'light',
}: ThemeProviderProps): React.JSX.Element {
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: getTheme(mode), mode, setMode }),
    [mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within <ThemeProvider>');
  }
  return ctx.theme;
}

export function useThemeMode(): { mode: ThemeMode; setMode: (mode: ThemeMode) => void } {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useThemeMode must be used within <ThemeProvider>');
  }
  return { mode: ctx.mode, setMode: ctx.setMode };
}

// Reserved for the future system-following toggle; referenced so the constant
// and import stay meaningful without enabling half-dark rendering yet.
export const themeFollowsSystem = FOLLOW_SYSTEM;
