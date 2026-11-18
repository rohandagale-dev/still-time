import 'fake-indexeddb/auto';

import type { SessionSyncItem, SessionsSyncResponse, WebsiteSyncItem, WebsitesSyncResponse } from '@stilltime/shared';
import { describe, expect, it, vi } from 'vitest';

import { addWebsites, removeWebsite } from '@/background/website-registry';
import { createSessionStore } from '@/services/session-store';
import { DEFAULT_SETTINGS, createExtensionStorage, createMemoryStore } from '@/services/storage';
import { SESSION_UPLOAD_DELAY_MS, backoffDelay, createSyncManager } from '@/services/sync-manager';
import { ApiRequestError, type TrackingApi } from '@/services/tracking-api';
import type { SessionRecord, Settings } from '@/types';
import { createSerialQueue } from '@/utils/serial';

const T0 = Date.UTC(2026, 10, 16, 12);
let dbCounter = 0;

const record = (id: string, overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id,
  domain: 'youtube.com',
  websiteName: 'YouTube',
  startedAt: T0 - 600_000,
  endedAt: T0,
  durationSeconds: 600,
  date: '2026-11-16',
  status: 'completed',
  syncState: 'pending',
  syncError: null,
  ...overrides,
});

/** A fake server that accepts everything unless told otherwise. */
function fakeServer() {
  const received = { websites: [] as WebsiteSyncItem[][], sessions: [] as SessionSyncItem[][] };
  const server = {
    received,
    fail: null as ApiRequestError | null,
    reject: new Set<string>(),
    known: new Set<string>(),
    api: {
      health: vi.fn(async () => {
        if (server.fail) throw server.fail;
        return { status: 'ok' as const, database: 'connected' as const, uptimeSeconds: 1, version: 'test' };
      }),
      syncWebsites: vi.fn(async (websites: WebsiteSyncItem[]): Promise<WebsitesSyncResponse> => {
        if (server.fail) throw server.fail;
        received.websites.push(websites);
        return { results: websites.map((w) => ({ domain: w.domain, status: 'applied' as const })) };
      }),
      syncSessions: vi.fn(async (sessions: SessionSyncItem[]): Promise<SessionsSyncResponse> => {
        if (server.fail) throw server.fail;
        received.sessions.push(sessions);
        const response: SessionsSyncResponse = { accepted: [], duplicates: [], rejected: [] };
        for (const session of sessions) {
          if (server.reject.has(session.id)) response.rejected.push({ id: session.id, reason: 'durationSeconds: does not match' });
          else if (server.known.has(session.id)) response.duplicates.push(session.id);
          else {
            server.known.add(session.id);
            response.accepted.push(session.id);
          }
        }
        return response;
      }),
    } satisfies TrackingApi,
  };
  return server;
}

async function setup(options: { settings?: Partial<Settings>; sessions?: SessionRecord[]; withWebsites?: boolean } = {}) {
  let time = T0;
  dbCounter += 1;
  const registry = options.withWebsites === false ? {} : addWebsites({}, [{ domain: 'youtube.com' }, { domain: 'github.com' }], T0 - 5000).registry;
  const storage = createExtensionStorage(
    createMemoryStore({ websites: registry, settings: { ...DEFAULT_SETTINGS, ...options.settings } }),
  );
  const sessions = createSessionStore(`sync-test-${dbCounter}`);
  if (options.sessions) await sessions.commitTransition({ completed: options.sessions, active: null });
  const server = fakeServer();
  const alarms = { scheduled: [] as number[], scheduleSync: vi.fn(async (at: number) => void alarms.scheduled.push(at)), clearSync: vi.fn(async () => undefined) };
  const manager = createSyncManager({
    run: createSerialQueue(),
    storage,
    sessions,
    alarms,
    createApi: () => server.api,
    now: () => time,
    random: () => 0.5, // no jitter
  });
  return {
    manager,
    storage,
    sessions,
    server,
    alarms,
    advance: (ms: number) => {
      time += ms;
    },
    now: () => time,
  };
}

describe('backoffDelay', () => {
  it('doubles from 30s up to 30 minutes', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10].map((failures) => backoffDelay(failures, 0.5) / 1000)).toEqual([
      30, 60, 120, 240, 480, 960, 1800, 1800,
    ]);
  });

  it('adds ±20% jitter but never goes below the 30s alarm minimum', () => {
    expect(backoffDelay(3, 0)).toBe(96_000);
    expect(backoffDelay(3, 0.999_999)).toBe(144_000);
    expect(backoffDelay(1, 0)).toBe(30_000);
  });
});

describe('sync manager', () => {
  it('uploads changed websites and pending sessions, then reports synced', async () => {
    const h = await setup({ sessions: [record('a'), record('b')] });
    const status = await h.manager.syncNow();

    expect(h.server.received.websites.flat().map((w) => w.domain).sort()).toEqual(['github.com', 'youtube.com']);
    expect(h.server.received.sessions.flat().map((s) => s.id)).toEqual(['a', 'b']);
    expect(h.server.received.sessions[0]?.[0]).toEqual({
      id: 'a',
      domain: 'youtube.com',
      websiteName: 'YouTube',
      startedAt: '2026-11-16T11:50:00.000Z',
      endedAt: '2026-11-16T12:00:00.000Z',
      durationSeconds: 600,
      date: '2026-11-16',
      status: 'completed',
    });
    expect(status).toMatchObject({ state: 'idle', pendingSessions: 0, pendingWebsites: 0, lastSuccessAt: T0, consecutiveFailures: 0 });
    expect(await h.sessions.countBySyncState('synced')).toBe(2);
    expect(Object.values(await h.storage.getRegistry()).every((w) => w.syncedAt === w.updatedAt)).toBe(true);
  });

  it('never re-uploads synced data (duplicate prevention on the client)', async () => {
    const h = await setup({ sessions: [record('a')] });
    await h.manager.syncNow();
    h.server.api.syncSessions.mockClear();
    h.server.api.syncWebsites.mockClear();
    await h.manager.syncNow();
    expect(h.server.api.syncSessions).not.toHaveBeenCalled();
    expect(h.server.api.syncWebsites).not.toHaveBeenCalled();
  });

  it('treats server duplicates as synced and rejected sessions as final (never retried)', async () => {
    const h = await setup({ sessions: [record('known'), record('bad'), record('new')] });
    h.server.known.add('known');
    h.server.reject.add('bad');
    const status = await h.manager.syncNow();
    expect(status).toMatchObject({ state: 'idle', pendingSessions: 0, rejectedSessions: 1 });

    h.server.api.syncSessions.mockClear();
    await h.manager.syncNow();
    expect(h.server.api.syncSessions).not.toHaveBeenCalled();
  });

  it('keeps data pending when offline and retries with exponential backoff', async () => {
    const h = await setup({ sessions: [record('a')] });
    h.server.fail = new ApiRequestError('network', 'The server could not be reached');

    const first = await h.manager.syncNow();
    expect(first).toMatchObject({ state: 'offline', consecutiveFailures: 1, nextRetryAt: T0 + 30_000, pendingSessions: 1 });
    expect(h.alarms.scheduled.at(-1)).toBe(T0 + 30_000);

    // Before the retry time, scheduled syncs do not hit the network.
    h.server.api.health.mockClear();
    h.advance(10_000);
    await h.manager.runScheduled();
    expect(h.server.api.syncSessions).not.toHaveBeenCalled();

    h.advance(20_000);
    const second = await h.manager.runScheduled();
    expect(second).toMatchObject({ state: 'offline', consecutiveFailures: 2, nextRetryAt: h.now() + 60_000 });

    h.server.fail = null;
    h.advance(60_000);
    const recovered = await h.manager.runScheduled();
    expect(recovered).toMatchObject({ state: 'idle', consecutiveFailures: 0, nextRetryAt: null, pendingSessions: 0 });
    expect(h.server.received.sessions.flat().map((s) => s.id)).toEqual(['a']);
  });

  it('a manual sync ignores backoff', async () => {
    const h = await setup({ sessions: [record('a')] });
    h.server.fail = new ApiRequestError('server', 'HTTP 503', 503);
    expect((await h.manager.syncNow()).state).toBe('error');
    h.server.fail = null;
    expect((await h.manager.syncNow()).state).toBe('idle');
  });

  it('reports rejected credentials distinctly', async () => {
    const h = await setup({ sessions: [record('a')] });
    h.server.fail = new ApiRequestError('unauthorized', 'Authentication required', 401);
    expect(await h.manager.syncNow()).toMatchObject({ state: 'unauthorized', lastError: 'Authentication required' });
  });

  it('uploads large backlogs in bounded batches', async () => {
    const h = await setup({ sessions: Array.from({ length: 450 }, (_, i) => record(`s${String(i).padStart(3, '0')}`, { endedAt: T0 + i })) });
    await h.manager.syncNow();
    expect(h.server.received.sessions.map((batch) => batch.length)).toEqual([200, 200, 50]);
    expect(await h.sessions.countBySyncState('synced')).toBe(450);
  });

  it('fails (instead of looping forever) when the server does not acknowledge a batch', async () => {
    const h = await setup({ sessions: [record('a'), record('b')] });
    h.server.api.syncSessions.mockImplementationOnce(async () => ({ accepted: ['a'], duplicates: [], rejected: [] }));
    const status = await h.manager.syncNow();
    expect(status).toMatchObject({ state: 'error', lastError: 'The server did not acknowledge every session', pendingSessions: 1 });
  });

  it('keeps a website change made during an upload pending (no lost updates)', async () => {
    const h = await setup();
    h.server.api.syncWebsites.mockImplementationOnce(async (websites) => {
      // The user removes YouTube while the request is in flight.
      await h.storage.setRegistry(removeWebsite(await h.storage.getRegistry(), 'youtube.com', T0 + 1).registry);
      return { results: websites.map((w) => ({ domain: w.domain, status: 'applied' as const })) };
    });
    const status = await h.manager.syncNow();
    expect(status.pendingWebsites).toBe(1);
    await h.manager.syncNow();
    expect(h.server.received.websites.at(-1)).toEqual([expect.objectContaining({ domain: 'youtube.com', deleted: true })]);
    expect((await h.storage.getRegistry())['youtube.com']).toBeUndefined(); // acknowledged tombstone purged
  });

  it('does nothing over the network while sync is disabled', async () => {
    const h = await setup({ settings: { syncEnabled: false }, sessions: [record('a')] });
    const status = await h.manager.syncNow();
    expect(status).toMatchObject({ state: 'disabled', pendingSessions: 1 });
    expect(h.server.api.health).not.toHaveBeenCalled();
    expect(h.alarms.clearSync).toHaveBeenCalled();
  });

  it('coalesces concurrent sync requests into one run', async () => {
    const h = await setup({ sessions: [record('a')] });
    await Promise.all([h.manager.syncNow(), h.manager.syncNow(), h.manager.runScheduled()]);
    expect(h.server.api.syncSessions).toHaveBeenCalledTimes(1);
  });

  it('schedules an upload shortly after sessions finish', async () => {
    const h = await setup({ withWebsites: false });
    await h.sessions.commitTransition({ completed: [record('a')], active: null });
    await h.manager.onSessionsCompleted([record('a')]);
    expect(h.alarms.scheduled.at(-1)).toBe(T0 + SESSION_UPLOAD_DELAY_MS);
    expect((await h.storage.getSyncStatus()).pendingSessions).toBe(1);
  });

  it('re-uploads everything after switching to another server', async () => {
    const h = await setup({ sessions: [record('a'), record('b')] });
    await h.manager.syncNow();
    expect((await h.storage.getSyncStatus()).pendingSessions).toBe(0);

    h.server.api.syncSessions.mockClear();
    h.server.api.syncWebsites.mockClear();
    await h.manager.onSettingsChanged(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, apiBaseUrl: 'https://other.example/api' });
    await vi.waitFor(() => expect(h.server.api.syncSessions).toHaveBeenCalled());
    expect(h.server.api.syncWebsites.mock.calls.flatMap(([websites]) => websites.map((w) => w.domain)).sort()).toEqual([
      'github.com',
      'youtube.com',
    ]);
    expect(h.server.api.syncSessions.mock.calls.flatMap(([sessions]) => sessions.map((s) => s.id))).toEqual(['a', 'b']);
  });

  it('resets backoff and syncs when sync is re-enabled', async () => {
    const h = await setup({ sessions: [record('a')] });
    await h.storage.setSyncStatus({ ...(await h.storage.getSyncStatus()), state: 'disabled', consecutiveFailures: 4, nextRetryAt: T0 + 999_999 });
    await h.manager.onSettingsChanged({ ...DEFAULT_SETTINGS, syncEnabled: false }, { ...DEFAULT_SETTINGS, syncEnabled: true });
    await vi.waitFor(async () => expect((await h.storage.getSyncStatus()).state).toBe('idle'));
    await vi.waitFor(() => expect(h.server.api.syncSessions).toHaveBeenCalled());
  });
});
