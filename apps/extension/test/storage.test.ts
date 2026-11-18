import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SETTINGS,
  createExtensionStorage,
  createMemoryStore,
  listTrackedWebsites,
  listUnsyncedWebsites,
  sanitizeRegistry,
  sanitizeSettings,
  sanitizeSyncStatus,
} from '@/services/storage';

describe('storage sanitizers', () => {
  it('drops malformed registry entries instead of crashing', () => {
    const registry = sanitizeRegistry({
      'youtube.com': { domain: 'youtube.com', displayName: 'YouTube', isEnabled: true, createdAt: 1, updatedAt: 2 },
      'mismatch.com': { domain: 'other.com' },
      'Bad Key': { domain: 'Bad Key' },
      'null.com': null,
      'num.com': 42,
    });
    expect(Object.keys(registry)).toEqual(['youtube.com']);
    expect(registry['youtube.com']).toEqual({
      domain: 'youtube.com',
      displayName: 'YouTube',
      faviconUrl: null,
      isEnabled: true,
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
      syncedAt: null,
    });
    expect(sanitizeRegistry('garbage')).toEqual({});
    expect(sanitizeRegistry(undefined)).toEqual({});
  });

  it('fills in and clamps settings', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ idleThresholdSeconds: 1, theme: 'neon', apiBaseUrl: 'nope' })).toEqual({
      ...DEFAULT_SETTINGS,
      idleThresholdSeconds: 15,
    });
    expect(sanitizeSettings({ idleThresholdSeconds: 99_999 }).idleThresholdSeconds).toBe(3600);
  });

  it('normalizes sync status', () => {
    expect(sanitizeSyncStatus({ state: 'weird', pendingSessions: -4, lastError: 7 })).toMatchObject({
      state: 'idle',
      pendingSessions: 0,
      lastError: null,
    });
  });
});

describe('registry helpers', () => {
  const registry = sanitizeRegistry({
    'b.com': { domain: 'b.com', createdAt: 2, updatedAt: 5, syncedAt: 5 },
    'a.com': { domain: 'a.com', createdAt: 1, updatedAt: 3, syncedAt: 1 },
    'gone.com': { domain: 'gone.com', createdAt: 0, updatedAt: 9, deletedAt: 9, syncedAt: 4 },
  });

  it('lists visible websites oldest first, excluding tombstones', () => {
    expect(listTrackedWebsites(registry).map((w) => w.domain)).toEqual(['a.com', 'b.com']);
  });

  it('lists websites with unsynchronized changes, including tombstones', () => {
    expect(listUnsyncedWebsites(registry).map((w) => w.domain).sort()).toEqual(['a.com', 'gone.com']);
  });
});

describe('createExtensionStorage', () => {
  it('creates a stable client id once', async () => {
    const storage = createExtensionStorage(createMemoryStore());
    const first = await storage.getClientId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await storage.getClientId()).toBe(first);
  });
});
