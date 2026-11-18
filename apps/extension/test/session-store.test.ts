import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { createSessionStore } from '@/services/session-store';
import type { ActiveSession, SessionRecord } from '@/types';

let counter = 0;
const freshStore = () => createSessionStore(`store-test-${++counter}`);

const record = (id: string, date: string, endedAt: number, overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  domain: 'youtube.com',
  websiteName: 'YouTube',
  startedAt: endedAt - 60_000,
  endedAt,
  durationSeconds: 60,
  date,
  status: 'completed',
  syncState: 'pending',
  syncError: null,
  ...overrides,
});

const active: ActiveSession = { id: 'a1', domain: 'github.com', websiteName: 'GitHub', startedAt: 1, lastSeenAt: 2 };

describe('session store (IndexedDB)', () => {
  it('commits finished sessions and the next active session atomically', async () => {
    const store = freshStore();
    await store.saveActiveSession(active);
    await store.commitTransition({ completed: [record('r1', '2026-11-16', 1000)], active: null });
    expect(await store.getActiveSession()).toBeNull();
    expect((await store.getSessionsBetween('2026-11-16', '2026-11-16')).map((r) => r.id)).toEqual(['r1']);
  });

  it('is idempotent for the same session id (re-running a transition never duplicates)', async () => {
    const store = freshStore();
    await store.commitTransition({ completed: [record('r1', '2026-11-16', 1000)], active: active });
    await store.commitTransition({ completed: [record('r1', '2026-11-16', 1000)], active: active });
    expect(await store.getSessionsBetween('2026-11-01', '2026-11-30')).toHaveLength(1);
  });

  it('filters by date range', async () => {
    const store = freshStore();
    await store.commitTransition({
      completed: [record('a', '2026-11-09', 1), record('b', '2026-11-10', 2), record('c', '2026-11-16', 3)],
      active: null,
    });
    expect((await store.getSessionsBetween('2026-11-10', '2026-11-16')).map((r) => r.id).sort()).toEqual(['b', 'c']);
    expect(await store.getSessionsBetween('2026-11-17', '2026-11-10')).toEqual([]);
  });

  it('queues pending sessions oldest first and tracks sync state', async () => {
    const store = freshStore();
    await store.commitTransition({
      completed: [record('late', '2026-11-16', 300), record('early', '2026-11-16', 100), record('mid', '2026-11-16', 200)],
      active: null,
    });
    expect((await store.getPendingSessions(2)).map((r) => r.id)).toEqual(['early', 'mid']);

    await store.setSyncState(['early', 'missing'], 'synced');
    await store.setSyncState(['mid'], 'rejected', 'durationSeconds does not match');
    expect(await store.countBySyncState('pending')).toBe(1);
    expect(await store.countBySyncState('synced')).toBe(1);
    expect(await store.countBySyncState('rejected')).toBe(1);
    const [rejected] = await store.getSessionsBetween('2026-11-16', '2026-11-16').then((all) => all.filter((r) => r.id === 'mid'));
    expect(rejected?.syncError).toBe('durationSeconds does not match');
  });

  it('can mark every session pending again', async () => {
    const store = freshStore();
    await store.commitTransition({ completed: [record('a', '2026-11-16', 1), record('b', '2026-11-16', 2)], active: null });
    await store.setSyncState(['a'], 'synced');
    await store.setSyncState(['b'], 'rejected', 'nope');
    await store.resetSyncState();
    expect(await store.countBySyncState('pending')).toBe(2);
  });

  it('reopens after close', async () => {
    const store = freshStore();
    await store.saveActiveSession(active);
    await store.close();
    expect(await store.getActiveSession()).toEqual(active);
  });
});
