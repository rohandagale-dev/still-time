import { useEffect } from 'react';

import type { ThemePreference } from '@/types';

/** Cached in localStorage so the next popup opens in the right theme before storage is read. */
const THEME_CACHE_KEY = 'stilltime:theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.dataset['theme'] = resolveTheme(preference);
  try {
    localStorage.setItem(THEME_CACHE_KEY, preference);
  } catch {
    // Storage may be unavailable; the theme still applies for this session.
  }
}

/** Synchronously applies the cached theme before the first render (avoids a flash). */
export function bootstrapTheme(): void {
  let cached: unknown = null;
  try {
    cached = localStorage.getItem(THEME_CACHE_KEY);
  } catch {
    cached = null;
  }
  applyTheme(isThemePreference(cached) ? cached : 'system');
}

/** Keeps the document theme in sync with the preference (and the OS, for "system"). */
export function useThemeEffect(preference: ThemePreference): void {
  useEffect(() => {
    applyTheme(preference);
    if (preference !== 'system') return undefined;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (): void => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);
}
