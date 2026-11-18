import { useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_SETTINGS,
  INITIAL_SYNC_STATUS,
  listTrackedWebsites,
  sanitizeRegistry,
  sanitizeSettings,
  sanitizeSyncStatus,
  type StorageKey,
} from '@/services/storage';
import type { Settings, SyncStatus, TrackedWebsite, WebsiteRegistry } from '@/types';

/**
 * Live view of one chrome.storage.local key. Values are sanitized on every read, and a change
 * event that arrives before the initial read resolves always wins over the (older) read.
 * `sanitize` must be a stable function (module-level).
 */
export function useChromeStorageValue<T>(key: StorageKey, sanitize: (raw: unknown) => T): { value: T; loading: boolean } {
  const [state, setState] = useState<{ value: T; loading: boolean }>(() => ({
    value: sanitize(undefined),
    loading: true,
  }));

  useEffect(() => {
    let active = true;
    let changedBeforeRead = false;

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
      const change = changes[key];
      if (areaName !== 'local' || !change) return;
      changedBeforeRead = true;
      setState({ value: sanitize(change.newValue), loading: false });
    };
    chrome.storage.onChanged.addListener(onChanged);

    chrome.storage.local
      .get(key)
      .then((result) => {
        if (active && !changedBeforeRead) setState({ value: sanitize(result[key]), loading: false });
      })
      .catch(() => {
        if (active && !changedBeforeRead) setState({ value: sanitize(undefined), loading: false });
      });

    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [key, sanitize]);

  return state;
}

export function useTrackedWebsites(): { registry: WebsiteRegistry; websites: TrackedWebsite[]; loading: boolean } {
  const { value: registry, loading } = useChromeStorageValue('websites', sanitizeRegistry);
  const websites = useMemo(() => listTrackedWebsites(registry), [registry]);
  return { registry, websites, loading };
}

export function useSettings(): { settings: Settings; loading: boolean } {
  const { value, loading } = useChromeStorageValue('settings', sanitizeSettings);
  return { settings: loading ? DEFAULT_SETTINGS : value, loading };
}

export function useSyncStatus(): { status: SyncStatus; loading: boolean } {
  const { value, loading } = useChromeStorageValue('syncStatus', sanitizeSyncStatus);
  return { status: loading ? INITIAL_SYNC_STATUS : value, loading };
}
