import { toLocalDateKey } from '@stilltime/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { subscribeToEvents } from '@/services/events';
import { describeError } from '@/services/messaging';
import { createSessionStore } from '@/services/session-store';
import { weekStartDate } from '@/services/stats';
import type { ActiveSession, SessionRecord } from '@/types';

const store = createSessionStore();

/** Periodic reload: picks up a day rollover and anything a missed notification would have. */
const RELOAD_INTERVAL_MS = 60_000;

export interface UsageData {
  sessions: SessionRecord[];
  active: ActiveSession | null;
  loading: boolean;
  error: string | null;
  /** When the data was read; used for stable (non-ticking) derived values. */
  loadedAt: number;
}

/**
 * Finished sessions of the last seven days plus the active session, read from IndexedDB
 * (read-only — the service worker is the only writer) and reloaded on change notifications.
 */
export function useUsageData(): UsageData {
  const [state, setState] = useState<UsageData>({
    sessions: [],
    active: null,
    loading: true,
    error: null,
    loadedAt: Date.now(),
  });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    requestId.current += 1;
    const current = requestId.current;
    const now = Date.now();
    try {
      const [sessions, active] = await Promise.all([
        store.getSessionsBetween(weekStartDate(now), toLocalDateKey(now)),
        store.getActiveSession(),
      ]);
      if (current === requestId.current) setState({ sessions, active, loading: false, error: null, loadedAt: now });
    } catch (error) {
      if (current === requestId.current) {
        setState((previous) => ({ ...previous, loading: false, error: describeError(error) }));
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === 'sessions-changed') void load();
    });
    const interval = setInterval(() => void load(), RELOAD_INTERVAL_MS);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [load]);

  return state;
}
