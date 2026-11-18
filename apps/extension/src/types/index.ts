import type { FinalSessionStatus } from '@stilltime/shared';

export type ThemePreference = 'system' | 'light' | 'dark';

/** User preferences, stored in chrome.storage.local. */
export interface Settings {
  /** Seconds without keyboard/mouse input before the user counts as idle (chrome.idle). */
  idleThresholdSeconds: number;
  /** Keep counting while the active tracked tab plays audio, even if the user is idle. */
  countMediaAsActive: boolean;
  theme: ThemePreference;
  syncEnabled: boolean;
  /** Base URL of the sync API, e.g. `http://localhost:4000/api`. */
  apiBaseUrl: string;
}

/** A website the user chose to track. The registry lives in chrome.storage.local. */
export interface TrackedWebsite {
  /** Canonical website key (see `normalizeUrl` in @stilltime/shared). */
  domain: string;
  displayName: string;
  /** http(s) favicon URL captured from an open tab, if any. */
  faviconUrl: string | null;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** Set when removed. The tombstone is kept until the server acknowledges the removal. */
  deletedAt: number | null;
  /** The `updatedAt` value last acknowledged by the server (`null` = never synced). */
  syncedAt: number | null;
}

/** Domain → website. Keyed by canonical domain, which makes duplicates impossible. */
export type WebsiteRegistry = Record<string, TrackedWebsite>;

/**
 * The session currently being tracked, checkpointed in IndexedDB.
 * `lastSeenAt` is the last moment the session was confirmed valid (events or heartbeat alarm);
 * time after it is never counted unless it is confirmed again.
 */
export interface ActiveSession {
  id: string;
  domain: string;
  websiteName: string;
  startedAt: number;
  lastSeenAt: number;
}

export type SessionSyncState = 'pending' | 'synced' | 'rejected';

/** A finished session, stored in IndexedDB. Sessions never span local midnight. */
export interface SessionRecord {
  id: string;
  domain: string;
  websiteName: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
  /** Local calendar day (YYYY-MM-DD). */
  date: string;
  status: FinalSessionStatus;
  syncState: SessionSyncState;
  syncError: string | null;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'unauthorized' | 'disabled';

export interface SyncStatus {
  state: SyncState;
  pendingSessions: number;
  pendingWebsites: number;
  rejectedSessions: number;
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextRetryAt: number | null;
}

/** An open browser tab, reduced to what the Add Website screen needs. */
export interface OpenTab {
  id: number;
  windowId: number;
  title: string;
  url: string;
  faviconUrl: string | null;
}

/** One selectable website on the Add Website screen (open tabs grouped by website). */
export interface WebsiteCandidate {
  domain: string;
  displayName: string;
  faviconUrl: string | null;
  tabCount: number;
  alreadyAdded: boolean;
}

// ─── Popup → service worker messages ────────────────────────────────────────

export interface AddWebsiteInput {
  domain: string;
  displayName?: string | undefined;
  faviconUrl?: string | null | undefined;
}

export type SkipReason = 'already-added' | 'duplicate' | 'invalid';

export interface AddWebsitesResult {
  added: TrackedWebsite[];
  skipped: { domain: string; reason: SkipReason }[];
}

export type RuntimeRequest =
  | { type: 'websites/add'; websites: AddWebsiteInput[] }
  | { type: 'websites/remove'; domain: string }
  | { type: 'websites/set-enabled'; domain: string; enabled: boolean }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | { type: 'tracking/refresh' }
  | { type: 'sync/run' };

export interface RuntimeResponseMap {
  'websites/add': AddWebsitesResult;
  'websites/remove': { removed: boolean };
  'websites/set-enabled': TrackedWebsite;
  'settings/update': Settings;
  'tracking/refresh': { active: ActiveSession | null };
  'sync/run': SyncStatus;
}

export type RuntimeRequestType = RuntimeRequest['type'];

export type RuntimeResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
