import { describe, expect, it } from 'vitest';

import { RequestError } from '@/background/errors';
import {
  addWebsites,
  markWebsitesSynced,
  mergeSettings,
  removeWebsite,
  setWebsiteEnabled,
} from '@/background/website-registry';
import { DEFAULT_SETTINGS } from '@/services/storage';
import type { TrackedWebsite, WebsiteRegistry } from '@/types';

const NOW = 1_700_000_000_000;

const website = (domain: string, overrides: Partial<TrackedWebsite> = {}): TrackedWebsite => ({
  domain,
  displayName: domain,
  faviconUrl: null,
  isEnabled: true,
  createdAt: NOW - 1000,
  updatedAt: NOW - 1000,
  deletedAt: null,
  syncedAt: null,
  ...overrides,
});

describe('addWebsites', () => {
  it('normalizes, names and stores new websites', () => {
    const result = addWebsites({}, [{ domain: 'www.YouTube.com', faviconUrl: 'https://www.youtube.com/favicon.ico' }], NOW);
    expect(result.added).toEqual([
      {
        domain: 'youtube.com',
        displayName: 'YouTube',
        faviconUrl: 'https://www.youtube.com/favicon.ico',
        isEnabled: true,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
        syncedAt: null,
      },
    ]);
    expect(Object.keys(result.registry)).toEqual(['youtube.com']);
  });

  it('detects duplicates within a request and against the registry', () => {
    const registry: WebsiteRegistry = { 'github.com': website('github.com') };
    const result = addWebsites(
      registry,
      [{ domain: 'youtube.com' }, { domain: 'https://m.youtube.com/watch' }, { domain: 'github.com' }],
      NOW,
    );
    expect(result.added.map((w) => w.domain)).toEqual(['youtube.com']);
    expect(result.skipped).toEqual([
      { domain: 'youtube.com', reason: 'duplicate' },
      { domain: 'github.com', reason: 'already-added' },
    ]);
  });

  it('rejects invalid and unsupported input', () => {
    const result = addWebsites({}, [{ domain: 'chrome://settings' }, { domain: '' }, { domain: 'a..b' }], NOW);
    expect(result.added).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual(['invalid', 'invalid', 'invalid']);
  });

  it('sanitizes display names and never persists non-http favicons', () => {
    const [added] = addWebsites(
      {},
      [{ domain: 'example.com', displayName: '   ', faviconUrl: 'data:image/png;base64,AAAA' }],
      NOW,
    ).added;
    expect(added).toMatchObject({ displayName: 'Example', faviconUrl: null });
    const [named] = addWebsites({}, [{ domain: 'example.com', displayName: '  My   Site ' }], NOW).added;
    expect(named?.displayName).toBe('My Site');
  });

  it('revives a tombstone with a newer version and keeps its sync bookkeeping', () => {
    const registry = { 'reddit.com': website('reddit.com', { deletedAt: NOW + 50, updatedAt: NOW + 50, syncedAt: NOW - 1000 }) };
    const [revived] = addWebsites(registry, [{ domain: 'reddit.com' }], NOW).added;
    expect(revived).toMatchObject({ deletedAt: null, isEnabled: true, syncedAt: NOW - 1000 });
    // The clock is behind the tombstone, yet the version still increases.
    expect(revived?.updatedAt).toBe(NOW + 51);
  });

  it('does not mutate its input', () => {
    const registry: WebsiteRegistry = {};
    addWebsites(registry, [{ domain: 'x.com' }], NOW);
    expect(registry).toEqual({});
  });
});

describe('removeWebsite / setWebsiteEnabled', () => {
  const registry: WebsiteRegistry = { 'x.com': website('x.com') };

  it('tombstones a removed website and is idempotent', () => {
    const first = removeWebsite(registry, 'x.com', NOW);
    expect(first.removed).toBe(true);
    expect(first.registry['x.com']).toMatchObject({ deletedAt: NOW, updatedAt: NOW });
    expect(removeWebsite(first.registry, 'x.com', NOW + 1).removed).toBe(false);
    expect(removeWebsite(registry, 'unknown.com', NOW).removed).toBe(false);
  });

  it('toggles tracking with a new version, and is a no-op when unchanged', () => {
    const paused = setWebsiteEnabled(registry, 'x.com', false, NOW);
    expect(paused).toMatchObject({ changed: true, website: { isEnabled: false, updatedAt: NOW } });
    expect(setWebsiteEnabled(paused.registry, 'x.com', false, NOW + 5).changed).toBe(false);
  });

  it('refuses to toggle a website that is not tracked', () => {
    const removed = removeWebsite(registry, 'x.com', NOW).registry;
    expect(() => setWebsiteEnabled(removed, 'x.com', true, NOW)).toThrow(RequestError);
    expect(() => setWebsiteEnabled({}, 'nope.com', true, NOW)).toThrow(/no longer in your tracking list/);
  });
});

describe('markWebsitesSynced', () => {
  it('records acknowledged versions and purges acknowledged tombstones', () => {
    const registry: WebsiteRegistry = {
      'a.com': website('a.com', { updatedAt: 10 }),
      'b.com': website('b.com', { updatedAt: 20, deletedAt: 20 }),
      'c.com': website('c.com', { updatedAt: 31 }), // changed again after version 30 was sent
    };
    const next = markWebsitesSynced(
      registry,
      new Map([
        ['a.com', 10],
        ['b.com', 20],
        ['c.com', 30],
      ]),
    );
    expect(next['a.com']?.syncedAt).toBe(10);
    expect(next['b.com']).toBeUndefined();
    expect(next['c.com']?.syncedAt).toBeNull();
  });
});

describe('mergeSettings', () => {
  it('applies valid changes and clamps the idle threshold', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { theme: 'dark', idleThresholdSeconds: 5 })).toMatchObject({
      theme: 'dark',
      idleThresholdSeconds: 15,
    });
    expect(mergeSettings(DEFAULT_SETTINGS, { apiBaseUrl: 'https://api.example.com/api/' }).apiBaseUrl).toBe(
      'https://api.example.com/api',
    );
  });

  it('ignores unknown keys and rejects invalid values', () => {
    expect(mergeSettings(DEFAULT_SETTINGS, { surprise: true })).toEqual(DEFAULT_SETTINGS);
    expect(() => mergeSettings(DEFAULT_SETTINGS, { theme: 'neon' })).toThrow(RequestError);
    expect(() => mergeSettings(DEFAULT_SETTINGS, { syncEnabled: 'yes' })).toThrow(RequestError);
    expect(() => mergeSettings(DEFAULT_SETTINGS, { apiBaseUrl: 'ftp://x' })).toThrow(/http/);
    expect(() => mergeSettings(DEFAULT_SETTINGS, null)).toThrow(RequestError);
  });
});
