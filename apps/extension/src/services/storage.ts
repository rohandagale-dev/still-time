import {
  DEFAULT_IDLE_THRESHOLD_SECONDS,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_DOMAIN_LENGTH,
  MAX_IDLE_THRESHOLD_SECONDS,
  MIN_IDLE_THRESHOLD_SECONDS,
} from '@stilltime/shared';

import type {
  Settings,
  SyncState,
  SyncStatus,
  ThemePreference,
  TrackedWebsite,
  WebsiteRegistry,
} from '@/types';

import { sanitizeFaviconUrl } from './domain-normalizer';

/**
 * Extension configuration lives in chrome.storage.local (usage data lives in IndexedDB).
 * Everything read back is sanitized: storage may hold data from older versions or be edited
 * through DevTools, and the UI must never crash on a malformed value.
 */
export interface StorageSchema {
  websites: WebsiteRegistry;
  settings: Settings;
  syncStatus: SyncStatus;
  clientId: string;
}

export type StorageKey = keyof StorageSchema;

/** Minimal async key-value contract, implemented by chrome.storage.local and an in-memory fake. */
export interface KeyValueStore {
  get(key: StorageKey): Promise<unknown>;
  set<K extends StorageKey>(key: K, value: StorageSchema[K]): Promise<void>;
}

export const chromeLocalStore: KeyValueStore = {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },
  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },
};

export function createMemoryStore(initial: Partial<Record<StorageKey, unknown>> = {}): KeyValueStore & {
  snapshot(): Partial<Record<StorageKey, unknown>>;
} {
  const data = new Map<StorageKey, unknown>(Object.entries(initial) as [StorageKey, unknown][]);
  return {
    get: async (key) => structuredClone(data.get(key)),
    set: async (key, value) => {
      data.set(key, structuredClone(value));
    },
    snapshot: () => Object.fromEntries(data),
  };
}

// ─── Defaults & sanitizers ──────────────────────────────────────────────────

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  idleThresholdSeconds: DEFAULT_IDLE_THRESHOLD_SECONDS,
  countMediaAsActive: true,
  theme: 'system',
  syncEnabled: true,
  apiBaseUrl: __API_BASE_URL__,
});

export const INITIAL_SYNC_STATUS: Readonly<SyncStatus> = Object.freeze({
  state: 'idle',
  pendingSessions: 0,
  pendingWebsites: 0,
  rejectedSessions: 0,
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  consecutiveFailures: 0,
  nextRetryAt: null,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteOr = <T>(value: unknown, fallback: T): number | T =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const SYNC_STATES: readonly SyncState[] = ['idle', 'syncing', 'offline', 'error', 'unauthorized', 'disabled'];

export function clampIdleThreshold(value: unknown): number {
  const seconds = Math.round(finiteOr(value, DEFAULT_IDLE_THRESHOLD_SECONDS));
  return Math.min(MAX_IDLE_THRESHOLD_SECONDS, Math.max(MIN_IDLE_THRESHOLD_SECONDS, seconds));
}

export function sanitizeApiBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function sanitizeSettings(raw: unknown): Settings {
  const value = isRecord(raw) ? raw : {};
  return {
    idleThresholdSeconds: clampIdleThreshold(value['idleThresholdSeconds']),
    countMediaAsActive:
      typeof value['countMediaAsActive'] === 'boolean' ? value['countMediaAsActive'] : DEFAULT_SETTINGS.countMediaAsActive,
    theme: THEMES.includes(value['theme'] as ThemePreference) ? (value['theme'] as ThemePreference) : DEFAULT_SETTINGS.theme,
    syncEnabled: typeof value['syncEnabled'] === 'boolean' ? value['syncEnabled'] : DEFAULT_SETTINGS.syncEnabled,
    apiBaseUrl: sanitizeApiBaseUrl(value['apiBaseUrl']) ?? DEFAULT_SETTINGS.apiBaseUrl,
  };
}

export function sanitizeDisplayName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const name = value.replace(/\s+/g, ' ').trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  return name.length > 0 ? name : fallback;
}

/**
 * Structural check for a stored website key: a lower-case host name, IPv4 or bracketed IPv6.
 * Deliberately cheap (no Public Suffix List): the service worker, the only writer, fully
 * normalizes every domain before it is stored.
 */
const DOMAIN_KEY_PATTERN = /^(?:[a-z0-9_-]+(?:\.[a-z0-9_-]+)*|\[[0-9a-f:.]+\])$/;
export const isDomainKey = (value: string): boolean => value.length <= MAX_DOMAIN_LENGTH && DOMAIN_KEY_PATTERN.test(value);

function sanitizeWebsite(domain: string, raw: unknown): TrackedWebsite | null {
  if (!isRecord(raw) || !isDomainKey(domain) || raw['domain'] !== domain) return null;
  const createdAt = finiteOr(raw['createdAt'], 0);
  const updatedAt = finiteOr(raw['updatedAt'], createdAt);
  return {
    domain,
    displayName: sanitizeDisplayName(raw['displayName'], domain),
    faviconUrl: sanitizeFaviconUrl(raw['faviconUrl']),
    isEnabled: raw['isEnabled'] !== false,
    createdAt,
    updatedAt,
    deletedAt: finiteOr(raw['deletedAt'], null),
    syncedAt: finiteOr(raw['syncedAt'], null),
  };
}

export function sanitizeRegistry(raw: unknown): WebsiteRegistry {
  if (!isRecord(raw)) return {};
  const registry: WebsiteRegistry = {};
  for (const [domain, entry] of Object.entries(raw)) {
    const website = sanitizeWebsite(domain, entry);
    if (website) registry[domain] = website;
  }
  return registry;
}

export function sanitizeSyncStatus(raw: unknown): SyncStatus {
  if (!isRecord(raw)) return { ...INITIAL_SYNC_STATUS };
  const count = (key: string): number => Math.max(0, Math.floor(finiteOr(raw[key], 0)));
  return {
    state: SYNC_STATES.includes(raw['state'] as SyncState) ? (raw['state'] as SyncState) : 'idle',
    pendingSessions: count('pendingSessions'),
    pendingWebsites: count('pendingWebsites'),
    rejectedSessions: count('rejectedSessions'),
    lastSuccessAt: finiteOr(raw['lastSuccessAt'], null),
    lastAttemptAt: finiteOr(raw['lastAttemptAt'], null),
    lastError: typeof raw['lastError'] === 'string' ? raw['lastError'] : null,
    consecutiveFailures: count('consecutiveFailures'),
    nextRetryAt: finiteOr(raw['nextRetryAt'], null),
  };
}

// ─── Registry helpers ───────────────────────────────────────────────────────

/** A website is tracked when it is in the registry and not tombstoned. */
export function isTracked(registry: Readonly<WebsiteRegistry>, domain: string): boolean {
  const website = registry[domain];
  return website !== undefined && website.deletedAt === null;
}

/** Websites visible to the user (tombstones excluded), oldest first. */
export function listTrackedWebsites(registry: Readonly<WebsiteRegistry>): TrackedWebsite[] {
  return Object.values(registry)
    .filter((website) => website.deletedAt === null)
    .sort((a, b) => a.createdAt - b.createdAt || a.domain.localeCompare(b.domain));
}

/** Websites whose latest change has not been acknowledged by the server. */
export function listUnsyncedWebsites(registry: Readonly<WebsiteRegistry>): TrackedWebsite[] {
  return Object.values(registry).filter((website) => website.syncedAt !== website.updatedAt);
}

// ─── Typed access ───────────────────────────────────────────────────────────

export interface ExtensionStorage {
  getRegistry(): Promise<WebsiteRegistry>;
  setRegistry(registry: WebsiteRegistry): Promise<void>;
  getSettings(): Promise<Settings>;
  setSettings(settings: Settings): Promise<void>;
  getSyncStatus(): Promise<SyncStatus>;
  setSyncStatus(status: SyncStatus): Promise<void>;
  /** Stable, random id of this installation (sent to the API for diagnostics). */
  getClientId(): Promise<string>;
}

export function createExtensionStorage(store: KeyValueStore = chromeLocalStore): ExtensionStorage {
  return {
    getRegistry: async () => sanitizeRegistry(await store.get('websites')),
    setRegistry: (registry) => store.set('websites', registry),
    getSettings: async () => sanitizeSettings(await store.get('settings')),
    setSettings: (settings) => store.set('settings', settings),
    getSyncStatus: async () => sanitizeSyncStatus(await store.get('syncStatus')),
    setSyncStatus: (status) => store.set('syncStatus', status),
    async getClientId() {
      const existing = await store.get('clientId');
      if (typeof existing === 'string' && existing.length > 0) return existing;
      const clientId = crypto.randomUUID();
      await store.set('clientId', clientId);
      return clientId;
    },
  };
}
