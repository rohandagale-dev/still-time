import {
  MAX_SESSIONS_PER_SYNC,
  MAX_WEBSITES_PER_SYNC,
  type SessionSyncItem,
  type WebsiteSyncItem,
} from '@stilltime/shared';

import { MIN_ALARM_DELAY_MS, type AlarmScheduler } from '@/background/alarms';
import { markWebsitesSynced } from '@/background/website-registry';
import type { SessionRecord, Settings, SyncState, SyncStatus, TrackedWebsite } from '@/types';
import type { SerialQueue } from '@/utils/serial';

import type { SessionStore } from './session-store';
import { listUnsyncedWebsites, type ExtensionStorage } from './storage';
import { ApiRequestError, type TrackingApi } from './tracking-api';

/**
 * Offline-first synchronization.
 *
 * Local persistence is the commit point; the server is a replica that is caught up eventually.
 * The pending queue is derived from durable state, so it survives restarts by construction:
 *   - websites whose latest change the server has not acknowledged (`syncedAt !== updatedAt`,
 *     including removal tombstones), uploaded with last-write-wins versions;
 *   - finished sessions with `syncState: 'pending'` (an IndexedDB index), uploaded in batches.
 * Uploads are idempotent (session ids and website domains are the keys), so a retry after a
 * timeout or crash can never create duplicates. Failures back off exponentially (with jitter)
 * via a `chrome.alarms` alarm, which also survives service-worker suspension.
 */

export const SYNC_BASE_DELAY_MS = 30_000;
export const SYNC_MAX_DELAY_MS = 30 * 60_000;
/** Finished sessions are uploaded in small batches rather than one request per tab switch. */
export const SESSION_UPLOAD_DELAY_MS = 60_000;

/** Exponential backoff with ±20% jitter, 30s → 30min. `random` is in [0, 1). */
export function backoffDelay(consecutiveFailures: number, random: number): number {
  const exponential = Math.min(SYNC_MAX_DELAY_MS, SYNC_BASE_DELAY_MS * 2 ** Math.max(0, consecutiveFailures - 1));
  return Math.max(MIN_ALARM_DELAY_MS, Math.round(exponential * (0.8 + 0.4 * random)));
}

export const toWebsiteSyncItem = (website: TrackedWebsite): WebsiteSyncItem => ({
  domain: website.domain,
  displayName: website.displayName,
  faviconUrl: website.faviconUrl,
  isEnabled: website.isEnabled,
  deleted: website.deletedAt !== null,
  updatedAt: new Date(website.updatedAt).toISOString(),
});

export const toSessionSyncItem = (session: SessionRecord): SessionSyncItem => ({
  id: session.id,
  domain: session.domain,
  websiteName: session.websiteName,
  startedAt: new Date(session.startedAt).toISOString(),
  endedAt: new Date(session.endedAt).toISOString(),
  durationSeconds: session.durationSeconds,
  date: session.date,
  status: session.status,
});

function stateForError(error: unknown): SyncState {
  if (!(error instanceof ApiRequestError)) return 'error';
  if (error.kind === 'network' || error.kind === 'timeout') return 'offline';
  if (error.kind === 'unauthorized') return 'unauthorized';
  return 'error';
}

const messageForError = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'Unknown error';

const invalidResponse = (): ApiRequestError => new ApiRequestError('invalid', 'Unexpected response from the server');

/** Why a sync runs. Only `manual` ignores backoff and always contacts the server. */
export type SyncTrigger = 'manual' | 'alarm' | 'changes' | 'startup';

export interface SyncManagerDependencies {
  /** The worker-wide serial queue (registry and status writes go through it). */
  run: SerialQueue;
  storage: ExtensionStorage;
  sessions: SessionStore;
  alarms: Pick<AlarmScheduler, 'scheduleSync' | 'clearSync'>;
  createApi: (options: { baseUrl: string; clientId: string }) => TrackingApi;
  now: () => number;
  random?: () => number;
}

export function createSyncManager({ run, storage, sessions, alarms, createApi, now, random = Math.random }: SyncManagerDependencies) {
  let inFlight: Promise<SyncStatus> | null = null;

  const updateStatus = (patch: Partial<SyncStatus>): Promise<SyncStatus> =>
    run(async () => {
      const next: SyncStatus = { ...(await storage.getSyncStatus()), ...patch };
      await storage.setSyncStatus(next);
      return next;
    });

  async function queueCounts(): Promise<Pick<SyncStatus, 'pendingSessions' | 'pendingWebsites' | 'rejectedSessions'>> {
    const [pendingSessions, rejectedSessions, registry] = await Promise.all([
      sessions.countBySyncState('pending'),
      sessions.countBySyncState('rejected'),
      storage.getRegistry(),
    ]);
    return { pendingSessions, rejectedSessions, pendingWebsites: listUnsyncedWebsites(registry).length };
  }

  async function pushWebsites(api: TrackingApi): Promise<void> {
    const unsynced = listUnsyncedWebsites(await storage.getRegistry());
    for (let start = 0; start < unsynced.length; start += MAX_WEBSITES_PER_SYNC) {
      const chunk = unsynced.slice(start, start + MAX_WEBSITES_PER_SYNC);
      const response = await api.syncWebsites(chunk.map(toWebsiteSyncItem));
      if (!Array.isArray(response?.results)) throw invalidResponse();

      // Every result acknowledges the version that was sent: applied, stale (the server holds a
      // newer change) or rejected (would never succeed). Changes made meanwhile stay pending.
      const sent = new Map(chunk.map((website) => [website.domain, website.updatedAt]));
      const acknowledged = new Map<string, number>();
      for (const result of response.results) {
        const version = sent.get(result.domain);
        if (version !== undefined) acknowledged.set(result.domain, version);
      }
      await run(async () => storage.setRegistry(markWebsitesSynced(await storage.getRegistry(), acknowledged)));
    }
  }

  async function pushSessions(api: TrackingApi): Promise<void> {
    for (;;) {
      const batch = await sessions.getPendingSessions(MAX_SESSIONS_PER_SYNC);
      if (batch.length === 0) return;
      const response = await api.syncSessions(batch.map(toSessionSyncItem));
      if (!Array.isArray(response?.accepted) || !Array.isArray(response.duplicates) || !Array.isArray(response.rejected)) {
        throw invalidResponse();
      }

      const ids = new Set(batch.map((session) => session.id));
      const stored = [...response.accepted, ...response.duplicates].filter((id) => ids.has(id));
      await sessions.setSyncState(stored, 'synced');
      for (const { id, reason } of response.rejected) {
        if (ids.has(id)) await sessions.setSyncState([id], 'rejected', String(reason));
      }

      // Never loop on a batch the server did not fully acknowledge.
      const handled = new Set([...stored, ...response.rejected.map((rejection) => rejection.id)]);
      if (![...ids].every((id) => handled.has(id))) {
        throw new ApiRequestError('invalid', 'The server did not acknowledge every session');
      }
    }
  }

  async function perform(trigger: SyncTrigger): Promise<SyncStatus> {
    const settings = await storage.getSettings();
    const counts = await queueCounts();
    if (!settings.syncEnabled) {
      await alarms.clearSync();
      return updateStatus({ state: 'disabled', nextRetryAt: null, ...counts });
    }

    const before = await storage.getSyncStatus();
    if (trigger !== 'manual') {
      // Backing off: the sync alarm will retry at nextRetryAt.
      if (before.nextRetryAt !== null && now() < before.nextRetryAt) return before;
      if (counts.pendingSessions + counts.pendingWebsites === 0) {
        const state = before.state === 'syncing' || before.state === 'disabled' ? 'idle' : before.state;
        return updateStatus({ state, ...counts });
      }
    }

    await updateStatus({ state: 'syncing', lastAttemptAt: now(), ...counts });
    try {
      const api = createApi({ baseUrl: settings.apiBaseUrl, clientId: await storage.getClientId() });
      // A manual sync always confirms the server is reachable, even with nothing to upload.
      if (trigger === 'manual') await api.health();
      await pushWebsites(api);
      await pushSessions(api);

      const after = await queueCounts();
      if (after.pendingSessions + after.pendingWebsites > 0) await alarms.scheduleSync(now() + SESSION_UPLOAD_DELAY_MS);
      return await updateStatus({
        state: 'idle',
        lastSuccessAt: now(),
        lastError: null,
        consecutiveFailures: 0,
        nextRetryAt: null,
        ...after,
      });
    } catch (error) {
      const consecutiveFailures = before.consecutiveFailures + 1;
      const nextRetryAt = now() + backoffDelay(consecutiveFailures, random());
      await alarms.scheduleSync(nextRetryAt);
      return updateStatus({
        state: stateForError(error),
        lastError: messageForError(error),
        consecutiveFailures,
        nextRetryAt,
        ...(await queueCounts()),
      });
    }
  }

  /** At most one sync runs at a time; concurrent requests share its result. */
  function sync(trigger: SyncTrigger): Promise<SyncStatus> {
    inFlight ??= perform(trigger).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  const logFailure = (error: unknown): void => console.error('[stilltime] sync failed unexpectedly', error);

  return {
    /** "Sync now": ignores backoff and always contacts the server. */
    syncNow: (): Promise<SyncStatus> => sync('manual'),

    /** The sync alarm fired. */
    runScheduled: (): Promise<SyncStatus> => sync('alarm'),

    /** Configuration changed: upload right away (backoff still applies). */
    requestSync(reason: string): void {
      void reason;
      sync('changes').catch(logFailure);
    },

    /** New finished sessions: refresh the pending count and upload them in a minute. */
    async onSessionsCompleted(completed: readonly SessionRecord[]): Promise<void> {
      if (completed.length === 0) return;
      await updateStatus(await queueCounts());
      if ((await storage.getSettings()).syncEnabled) await alarms.scheduleSync(now() + SESSION_UPLOAD_DELAY_MS);
    },

    async onSettingsChanged(previous: Settings, next: Settings): Promise<void> {
      if (!next.syncEnabled) {
        if (previous.syncEnabled) {
          await alarms.clearSync();
          await updateStatus({ state: 'disabled', nextRetryAt: null });
        }
        return;
      }
      if (previous.apiBaseUrl !== next.apiBaseUrl) {
        // A different server has none of our data: upload everything again (uploads are
        // idempotent, so data the server already has is simply acknowledged as duplicate).
        await run(async () => {
          const registry = await storage.getRegistry();
          await storage.setRegistry(
            Object.fromEntries(Object.entries(registry).map(([domain, website]) => [domain, { ...website, syncedAt: null }])),
          );
        });
        await sessions.resetSyncState();
      }
      if (!previous.syncEnabled || previous.apiBaseUrl !== next.apiBaseUrl) {
        await updateStatus({ state: 'idle', consecutiveFailures: 0, nextRetryAt: null, lastError: null, ...(await queueCounts()) });
        sync('changes').catch(logFailure);
      }
    },

    /** Worker started: make sure pending data has a sync scheduled (no network here). */
    async resume(): Promise<void> {
      const counts = await queueCounts();
      const status = await updateStatus({
        ...counts,
        // A worker killed mid-sync leaves "syncing" behind.
        ...((await storage.getSyncStatus()).state === 'syncing' ? { state: 'idle' as const } : {}),
      });
      if (counts.pendingSessions + counts.pendingWebsites > 0 && (await storage.getSettings()).syncEnabled) {
        await alarms.scheduleSync(status.nextRetryAt ?? now());
      }
    },
  };
}

export type SyncManager = ReturnType<typeof createSyncManager>;
