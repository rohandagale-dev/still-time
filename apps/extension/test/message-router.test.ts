import { describe, expect, it, vi } from 'vitest';

import { createMessageRouter, parseRequest, type SyncControl, type TrackingControl } from '@/background/message-router';
import { INITIAL_SYNC_STATUS, createExtensionStorage, createMemoryStore, type KeyValueStore } from '@/services/storage';
import type { AddWebsitesResult, RuntimeResponse, TrackedWebsite } from '@/types';
import { createSerialQueue } from '@/utils/serial';

function setup(store: KeyValueStore = createMemoryStore()) {
  const storage = createExtensionStorage(store);
  const tracking: TrackingControl = { reconcile: vi.fn(async () => null), applySettings: vi.fn() };
  const sync: SyncControl = {
    requestSync: vi.fn(),
    syncNow: vi.fn(async () => ({ ...INITIAL_SYNC_STATUS })),
    onSettingsChanged: vi.fn(async () => undefined),
  };
  let clock = 1_000;
  const route = createMessageRouter({ run: createSerialQueue(), storage, tracking, sync, now: () => (clock += 1) });
  return { route, storage, tracking, sync };
}

const ok = <T>(response: RuntimeResponse<unknown>): T => {
  if (!response.ok) throw new Error(`expected success, got ${response.error.code}: ${response.error.message}`);
  return response.data as T;
};

describe('message router', () => {
  it('persists added websites before reporting success, then reconciles and syncs', async () => {
    const { route, storage, tracking, sync } = setup();
    const result = ok<AddWebsitesResult>(
      await route({ type: 'websites/add', websites: [{ domain: 'youtube.com', displayName: 'YouTube' }] }),
    );
    expect(result.added.map((w) => w.domain)).toEqual(['youtube.com']);
    expect(Object.keys(await storage.getRegistry())).toEqual(['youtube.com']);
    expect(tracking.reconcile).toHaveBeenCalledWith('websites-added');
    expect(sync.requestSync).toHaveBeenCalledWith('websites-changed');
  });

  it('reports failure — and adds nothing — when persistence fails', async () => {
    const failing = createMemoryStore();
    failing.set = async () => {
      throw new Error('QUOTA_BYTES quota exceeded');
    };
    const { route, tracking } = setup(failing);
    const response = await route({ type: 'websites/add', websites: [{ domain: 'youtube.com' }] });
    expect(response).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Your change could not be saved (QUOTA_BYTES quota exceeded).' },
    });
    expect(tracking.reconcile).not.toHaveBeenCalled();
  });

  it('never registers the same website twice under concurrent requests', async () => {
    const { route, storage } = setup();
    const add = (domain: string) => route({ type: 'websites/add', websites: [{ domain }] });
    const results = await Promise.all([add('youtube.com'), add('www.youtube.com'), add('https://m.youtube.com/x')]);
    const added = results.flatMap((response) => ok<AddWebsitesResult>(response).added);
    expect(added).toHaveLength(1);
    expect(Object.keys(await storage.getRegistry())).toEqual(['youtube.com']);
  });

  it('removes, toggles and reports missing websites', async () => {
    const { route, storage } = setup();
    ok(await route({ type: 'websites/add', websites: [{ domain: 'github.com' }] }));

    const paused = ok<TrackedWebsite>(await route({ type: 'websites/set-enabled', domain: 'github.com', enabled: false }));
    expect(paused.isEnabled).toBe(false);

    expect(ok(await route({ type: 'websites/remove', domain: 'github.com' }))).toEqual({ removed: true });
    expect((await storage.getRegistry())['github.com']?.deletedAt).not.toBeNull();

    const missing = await route({ type: 'websites/set-enabled', domain: 'github.com', enabled: true });
    expect(missing).toMatchObject({ ok: false, error: { code: 'not-found' } });
  });

  it('updates settings and applies them to tracking and sync', async () => {
    const { route, tracking, sync } = setup();
    const next = ok<{ idleThresholdSeconds: number }>(
      await route({ type: 'settings/update', patch: { idleThresholdSeconds: 120 } }),
    );
    expect(next.idleThresholdSeconds).toBe(120);
    expect(tracking.applySettings).toHaveBeenCalledWith(expect.objectContaining({ idleThresholdSeconds: 120 }));
    expect(sync.onSettingsChanged).toHaveBeenCalled();
  });

  it('rejects malformed requests without throwing', async () => {
    const { route } = setup();
    for (const message of [null, 'hi', { type: 'nope' }, { type: 'websites/add', websites: [] }, { type: 'websites/remove' }]) {
      expect((await route(message)).ok).toBe(false);
    }
  });
});

describe('parseRequest', () => {
  it('coerces add entries defensively', () => {
    expect(parseRequest({ type: 'websites/add', websites: [{ domain: 'a.com', faviconUrl: 3 }, 'junk'] })).toEqual({
      type: 'websites/add',
      websites: [
        { domain: 'a.com', displayName: undefined, faviconUrl: null },
        { domain: '' },
      ],
    });
  });

  it('caps the number of websites per request', () => {
    const websites = Array.from({ length: 501 }, (_, index) => ({ domain: `site${index}.com` }));
    expect(() => parseRequest({ type: 'websites/add', websites })).toThrow(/At most 500/);
  });
});
