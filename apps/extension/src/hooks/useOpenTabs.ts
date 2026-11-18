import { useCallback, useEffect, useRef, useState } from 'react';

import { getOpenTabs, subscribeToTabChanges } from '@/services/chrome-tabs';
import { describeError } from '@/services/messaging';
import type { OpenTab } from '@/types';

export type OpenTabsStatus = 'loading' | 'ready' | 'error';

/** Debounce for bursts of tab events (restoring a window fires dozens at once). */
const REFRESH_DEBOUNCE_MS = 150;

/**
 * Open tabs, kept live while the component is mounted: tabs opened, closed or navigated while
 * the Add Website screen is visible are reflected immediately.
 */
export function useOpenTabs(): { tabs: OpenTab[]; status: OpenTabsStatus; error: string | null; refresh: () => void } {
  const [state, setState] = useState<{ tabs: OpenTab[]; status: OpenTabsStatus; error: string | null }>({
    tabs: [],
    status: 'loading',
    error: null,
  });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    requestId.current += 1;
    const current = requestId.current;
    try {
      const tabs = await getOpenTabs();
      if (current === requestId.current) setState({ tabs, status: 'ready', error: null });
    } catch (error) {
      if (current !== requestId.current) return;
      // Keep showing the last good snapshot if there is one.
      setState((previous) =>
        previous.status === 'ready'
          ? previous
          : { tabs: [], status: 'error', error: describeError(error) },
      );
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToTabChanges(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), REFRESH_DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [load]);

  const refresh = useCallback(() => {
    setState((previous) => ({ ...previous, status: previous.status === 'error' ? 'loading' : previous.status }));
    void load();
  }, [load]);

  return { ...state, refresh };
}
