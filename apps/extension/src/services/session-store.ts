import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { ActiveSession, SessionRecord, SessionSyncState } from '@/types';

/**
 * IndexedDB persistence for usage data — the reliable, local source of truth.
 *
 *   sessions  finished sessions, keyed by their client-generated id (the idempotency key)
 *   state     the active-session checkpoint (key "activeSession")
 *
 * Session transitions (finish one session and start the next) are written in a single
 * transaction across both stores, so a crash can never leave a session both active and finished.
 */
interface StilltimeDb extends DBSchema {
  sessions: {
    key: string;
    value: SessionRecord;
    indexes: {
      'by-date': string;
      'by-sync': [SessionSyncState, number];
    };
  };
  state: {
    key: 'activeSession';
    value: ActiveSession;
  };
}

export const DEFAULT_DB_NAME = 'stilltime';
const DB_VERSION = 1;

export interface SessionTransition {
  /** Finished sessions to record. */
  completed: readonly SessionRecord[];
  /** The new active session, or `null` when nothing is being tracked. */
  active: ActiveSession | null;
}

export interface SessionStore {
  getActiveSession(): Promise<ActiveSession | null>;
  /** Checkpoints the active session (heartbeat). */
  saveActiveSession(session: ActiveSession): Promise<void>;
  /** Atomically records finished sessions and replaces the active session. */
  commitTransition(transition: SessionTransition): Promise<void>;
  /** Finished sessions whose local date is within [fromDate, toDate] (inclusive). */
  getSessionsBetween(fromDate: string, toDate: string): Promise<SessionRecord[]>;
  /** Oldest finished sessions that still have to be uploaded. */
  getPendingSessions(limit: number): Promise<SessionRecord[]>;
  setSyncState(ids: readonly string[], syncState: SessionSyncState, syncError?: string | null): Promise<void>;
  /** Marks every session as not yet uploaded (e.g. after switching to another sync server). */
  resetSyncState(): Promise<void>;
  countBySyncState(syncState: SessionSyncState): Promise<number>;
  close(): Promise<void>;
}

const syncRange = (state: SessionSyncState): IDBKeyRange =>
  IDBKeyRange.bound([state, -Infinity], [state, Infinity]);

export function createSessionStore(dbName: string = DEFAULT_DB_NAME): SessionStore {
  let connection: Promise<IDBPDatabase<StilltimeDb>> | null = null;

  const db = (): Promise<IDBPDatabase<StilltimeDb>> => {
    connection ??= openDB<StilltimeDb>(dbName, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
          sessions.createIndex('by-date', 'date');
          sessions.createIndex('by-sync', ['syncState', 'endedAt']);
          database.createObjectStore('state');
        }
      },
      // Another context (e.g. an updated service worker) needs a newer schema: let it proceed.
      blocking() {
        const current = connection;
        connection = null;
        void current?.then((database) => database.close());
      },
      terminated() {
        connection = null;
      },
    }).catch((error: unknown) => {
      connection = null;
      throw error;
    });
    return connection;
  };

  return {
    async getActiveSession() {
      return (await (await db()).get('state', 'activeSession')) ?? null;
    },

    async saveActiveSession(session) {
      await (await db()).put('state', session, 'activeSession');
    },

    async commitTransition({ completed, active }) {
      const tx = (await db()).transaction(['sessions', 'state'], 'readwrite');
      const sessions = tx.objectStore('sessions');
      const state = tx.objectStore('state');
      await Promise.all([
        ...completed.map((record) => sessions.put(record)),
        active ? state.put(active, 'activeSession') : state.delete('activeSession'),
        tx.done,
      ]);
    },

    async getSessionsBetween(fromDate, toDate) {
      if (fromDate > toDate) return [];
      return (await db()).getAllFromIndex('sessions', 'by-date', IDBKeyRange.bound(fromDate, toDate));
    },

    async getPendingSessions(limit) {
      return (await db()).getAllFromIndex('sessions', 'by-sync', syncRange('pending'), limit);
    },

    async setSyncState(ids, syncState, syncError = null) {
      if (ids.length === 0) return;
      const tx = (await db()).transaction('sessions', 'readwrite');
      for (const id of ids) {
        const record = await tx.store.get(id);
        if (record) await tx.store.put({ ...record, syncState, syncError });
      }
      await tx.done;
    },

    async resetSyncState() {
      const tx = (await db()).transaction('sessions', 'readwrite');
      for await (const cursor of tx.store) {
        if (cursor.value.syncState !== 'pending') await cursor.update({ ...cursor.value, syncState: 'pending', syncError: null });
      }
      await tx.done;
    },

    async countBySyncState(syncState) {
      return (await db()).countFromIndex('sessions', 'by-sync', syncRange(syncState));
    },

    async close() {
      const current = connection;
      connection = null;
      (await current)?.close();
    },
  };
}
