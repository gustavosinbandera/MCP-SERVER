'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeId = 'night' | 'charcoal' | 'sky' | 'rose' | 'violet';

const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'sky', label: 'Sky' },
  { id: 'rose', label: 'Rose' },
  { id: 'violet', label: 'Violet' },
  { id: 'night', label: 'Night' },
  { id: 'charcoal', label: 'Charcoal' },
];

const STORAGE_KEY = 'mcp-webapp-theme';

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  themes: typeof THEMES;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyThemeToDocument(theme: ThemeId) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

function readStoredTheme(): ThemeId | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'night' || raw === 'charcoal' || raw === 'sky' || raw === 'rose' || raw === 'violet') return raw;

    // Backward compatibility with older theme ids.
    if (raw === 'midnight') return 'night';
    if (raw === 'slate') return 'charcoal';
    if (raw === 'light') return 'sky';
    if (raw === 'sand') return 'rose';
    if (raw === 'ocean') return 'violet';
    return null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('sky');

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored) setThemeState(stored);
  }, []);

  useEffect(() => {
    applyThemeToDocument(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      theme,
      setTheme: (t) => setThemeState(t),
      themes: THEMES,
    };
  }, [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

