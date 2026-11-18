import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrowserObservation, BrowserObserver, IdleState } from '@/background/tab-manager';
import { createTrackingEngine, resolveTrackingTarget } from '@/background/tracking-engine';
import { addWebsites, removeWebsite, setWebsiteEnabled } from '@/background/website-registry';
import { createSessionStore, type SessionStore } from '@/services/session-store';
import { DEFAULT_SETTINGS, createExtensionStorage, createMemoryStore, type ExtensionStorage } from '@/services/storage';
import type { WebsiteRegistry } from '@/types';
import { createSerialQueue } from '@/utils/serial';

const at = (day: number, hours: number, minutes = 0, seconds = 0): number =>
  new Date(2026, 10, day, hours, minutes, seconds).getTime();

const REGISTRY: WebsiteRegistry = addWebsites(
  {},
  [{ domain: 'youtube.com' }, { domain: 'github.com' }, { domain: 'netflix.com' }],
  at(1, 0),
).registry;

let dbCounter = 0;

/** A scripted browser + controllable clock around a real engine and a real (fake) IndexedDB. */
function createHarness(registry: WebsiteRegistry = REGISTRY) {
  const state: BrowserObservation = { windowFocused: true, activeTab: null, idleState: 'active' };
  let time = at(16, 10);
  let ids = 0;
  const heartbeat = { on: false };
  const onSessionsChanged = vi.fn();

  const storage: ExtensionStorage = createExtensionStorage(createMemoryStore({ websites: registry, settings: DEFAULT_SETTINGS }));
  dbCounter += 1;
  const sessions: SessionStore = createSessionStore(`engine-test-${dbCounter}`);
  const browser: BrowserObserver = {
    observe: async () => structuredClone(state),
    setIdleDetectionInterval: vi.fn(),
  };

  const makeEngine = () =>
    createTrackingEngine({
      run: createSerialQueue(),
      storage,
      sessions,
      browser,
      alarms: { setHeartbeat: async (on) => void (heartbeat.on = on) },
      now: () => time,
      newId: () => `s${++ids}`,
      onSessionsChanged,
    });
  let engine = makeEngine();

  const h = {
    storage,
    sessions,
    heartbeat,
    onSessionsChanged,
    reconcile: (reason = 'test') => engine.reconcile(reason),
    /** Simulates a worker restart (all in-memory state lost; storage and IndexedDB survive). */
    restartWorker: () => {
      engine = makeEngine();
    },
    at: (timestamp: number) => {
      time = timestamp;
    },
    advance: (seconds: number) => {
      time += seconds * 1000;
    },
    visit: async (url: string, extra: { audible?: boolean; incognito?: boolean } = {}) => {
      state.activeTab = { id: 1, url, audible: extra.audible ?? false, incognito: extra.incognito ?? false };
      return h.reconcile('visit');
    },
    setFocus: async (focused: boolean) => {
      state.windowFocused = focused;
      return h.reconcile('focus');
    },
    setIdle: async (idleState: IdleState) => {
      state.idleState = idleState;
      return h.reconcile('idle');
    },
    setAudible: async (audible: boolean) => {
      if (state.activeTab) state.activeTab.audible = audible;
      return h.reconcile('audible');
    },
    /** Heartbeats every 30s for `seconds`. */
    stay: async (seconds: number) => {
      for (let elapsed = 0; elapsed < seconds; elapsed += 30) {
        h.advance(Math.min(30, seconds - elapsed));
        await h.reconcile('heartbeat');
      }
    },
    records: async () => (await sessions.getSessionsBetween('2000-01-01', '2100-01-01')).sort((a, b) => a.startedAt - b.startedAt),
    summary: async () =>
      (await h.records()).map((record) => [record.domain, record.durationSeconds, record.status] as const),
  };
  return h;
}

describe('resolveTrackingTarget', () => {
  const observation = (overrides: Partial<BrowserObservation> = {}): BrowserObservation => ({
    windowFocused: true,
    idleState: 'active',
    activeTab: { id: 1, url: 'https://www.youtube.com/watch?v=1', audible: false, incognito: false },
    ...overrides,
  });
  const resolve = (o: BrowserObservation, countMediaAsActive = true) =>
    resolveTrackingTarget(o, REGISTRY, { countMediaAsActive })?.domain ?? null;

  it('tracks the active tab of a focused window on a registered website', () => {
    expect(resolve(observation())).toBe('youtube.com');
  });

  it.each([
    ['window not focused', { windowFocused: false }],
    ['no active tab', { activeTab: null }],
    ['locked screen', { idleState: 'locked' as const }],
    ['idle without media', { idleState: 'idle' as const }],
    ['incognito tab', { activeTab: { id: 1, url: 'https://youtube.com/', audible: false, incognito: true } }],
    ['unregistered website', { activeTab: { id: 1, url: 'https://reddit.com/', audible: false, incognito: false } }],
    ['browser page', { activeTab: { id: 1, url: 'chrome://newtab/', audible: false, incognito: false } }],
    ['unknown URL', { activeTab: { id: 1, url: undefined, audible: false, incognito: false } }],
  ])('does not track: %s', (_label, overrides) => {
    expect(resolve(observation(overrides))).toBeNull();
  });

  it('keeps tracking audible media while idle only when that setting is on', () => {
    const watching = observation({
      idleState: 'idle',
      activeTab: { id: 1, url: 'https://netflix.com/watch/1', audible: true, incognito: false },
    });
    expect(resolve(watching, true)).toBe('netflix.com');
    expect(resolve(watching, false)).toBeNull();
    expect(resolve({ ...watching, idleState: 'locked' }, true)).toBeNull();
  });

  it('ignores disabled and removed websites', () => {
    const disabled = setWebsiteEnabled(REGISTRY, 'youtube.com', false, at(2, 0)).registry;
    expect(resolveTrackingTarget(observation(), disabled, { countMediaAsActive: true })).toBeNull();
    const removed = removeWebsite(REGISTRY, 'youtube.com', at(2, 0)).registry;
    expect(resolveTrackingTarget(observation(), removed, { countMediaAsActive: true })).toBeNull();
  });
});

describe('tracking engine', () => {
  let h: ReturnType<typeof createHarness>;
  beforeEach(() => {
    h = createHarness();
  });

  it('records a session from first visit until switching to an untracked site', async () => {
    await h.visit('https://www.youtube.com/watch?v=1');
    expect(h.heartbeat.on).toBe(true);
    await h.stay(300);
    await h.visit('https://example.org/');
    expect(await h.summary()).toEqual([['youtube.com', 300, 'completed']]);
    expect(await h.sessions.getActiveSession()).toBeNull();
    expect(h.heartbeat.on).toBe(false);
  });

  it('treats tabs and pages of the same website as one continuous session (incl. SPA navigation)', async () => {
    await h.visit('https://www.youtube.com/watch?v=1');
    h.advance(20);
    await h.visit('https://m.youtube.com/shorts/2'); // another tab, same website
    h.advance(20);
    await h.visit('https://youtube.com/results?q=calm'); // pushState navigation
    h.advance(20);
    await h.visit('https://github.com/');
    expect(await h.summary()).toEqual([['youtube.com', 60, 'completed']]);
    expect((await h.sessions.getActiveSession())?.domain).toBe('github.com');
  });

  it('splits sessions when switching between tracked websites, without gaps or overlaps', async () => {
    await h.visit('https://youtube.com/');
    h.advance(10);
    await h.visit('https://github.com/');
    h.advance(10);
    await h.visit('https://youtube.com/');
    h.advance(10);
    await h.visit('about:blank');
    const records = await h.records();
    expect(records.map((r) => [r.domain, r.durationSeconds])).toEqual([
      ['youtube.com', 10],
      ['github.com', 10],
      ['youtube.com', 10],
    ]);
    for (let i = 1; i < records.length; i += 1) expect(records[i]?.startedAt).toBe(records[i - 1]?.endedAt);
  });

  it('stops when Chrome loses focus and resumes on refocus', async () => {
    await h.visit('https://youtube.com/');
    h.advance(40);
    await h.setFocus(false);
    h.advance(600); // working in another app
    await h.setFocus(true);
    h.advance(15);
    await h.setFocus(false);
    expect(await h.summary()).toEqual([
      ['youtube.com', 40, 'completed'],
      ['youtube.com', 15, 'completed'],
    ]);
  });

  it('stops when the user becomes idle and resumes when active again', async () => {
    await h.visit('https://github.com/');
    await h.stay(120);
    await h.setIdle('idle');
    h.advance(900);
    await h.setIdle('active');
    h.advance(30);
    await h.setIdle('locked');
    expect(await h.summary()).toEqual([
      ['github.com', 120, 'completed'],
      ['github.com', 30, 'completed'],
    ]);
  });

  it('keeps counting media playback while idle, and stops when the audio stops', async () => {
    await h.visit('https://netflix.com/watch/1', { audible: true });
    await h.setIdle('idle');
    await h.stay(600);
    expect(await h.records()).toEqual([]);
    await h.setAudible(false);
    expect(await h.summary()).toEqual([['netflix.com', 600, 'completed']]);
  });

  it('stops tracking as soon as a website is disabled or removed', async () => {
    await h.visit('https://youtube.com/');
    h.advance(30);
    await h.storage.setRegistry(setWebsiteEnabled(REGISTRY, 'youtube.com', false, at(16, 10)).registry);
    await h.reconcile('website-disabled');
    expect(await h.summary()).toEqual([['youtube.com', 30, 'completed']]);
    expect(await h.sessions.getActiveSession()).toBeNull();
  });

  it('never tracks incognito tabs or browser pages', async () => {
    await h.visit('https://youtube.com/', { incognito: true });
    await h.visit('chrome://settings/');
    expect(await h.sessions.getActiveSession()).toBeNull();
    expect(h.onSessionsChanged).not.toHaveBeenCalled();
  });

  it('does not count time while the computer slept (unobserved gap)', async () => {
    await h.visit('https://youtube.com/');
    await h.stay(60);
    h.advance(3 * 3600); // lid closed: no heartbeats, no events
    await h.reconcile('idle-active'); // first event after waking, still on YouTube
    expect(await h.summary()).toEqual([['youtube.com', 60, 'recovered']]);
    expect(await h.sessions.getActiveSession()).toMatchObject({ domain: 'youtube.com', startedAt: at(16, 13, 1) });
  });

  it('recovers after a browser crash or restart without losing or inflating data', async () => {
    await h.visit('https://github.com/');
    await h.stay(90);
    h.restartWorker(); // all in-memory state is gone
    h.advance(45 * 60); // Chrome was closed for 45 minutes
    await h.visit('about:blank'); // first reconcile of the new worker
    expect(await h.summary()).toEqual([['github.com', 90, 'recovered']]);
  });

  it('survives service-worker suspension transparently (heartbeats keep the session alive)', async () => {
    await h.visit('https://youtube.com/');
    for (let i = 0; i < 10; i += 1) {
      h.advance(30);
      h.restartWorker(); // the alarm wakes a fresh worker every time
      await h.reconcile('heartbeat');
    }
    await h.visit('https://example.org/');
    expect(await h.summary()).toEqual([['youtube.com', 300, 'completed']]);
  });

  it('never creates duplicate or overlapping sessions under concurrent events', async () => {
    await Promise.all([
      h.visit('https://youtube.com/'),
      h.reconcile('tab-activated'),
      h.reconcile('tab-updated'),
      h.reconcile('focus-changed'),
      h.reconcile('heartbeat'),
    ]);
    expect(await h.sessions.getActiveSession()).toMatchObject({ id: 's1' });
    expect(h.onSessionsChanged).toHaveBeenCalledTimes(1);
    expect(await h.records()).toEqual([]);
  });

  it('splits a session that runs across midnight', async () => {
    h.at(at(16, 23, 59, 30));
    await h.visit('https://youtube.com/');
    await h.stay(90); // until 00:01:00
    await h.visit('about:blank');
    const records = await h.records();
    expect(records.map((r) => [r.date, r.durationSeconds])).toEqual([
      ['2026-11-16', 30],
      ['2026-11-17', 60],
    ]);
    expect(records.map((r) => r.id)).toEqual(['s1', 's1:2026-11-17']);
  });

  it('closes a session at its last checkpoint if the clock jumps backwards', async () => {
    await h.visit('https://youtube.com/');
    await h.stay(60);
    h.advance(-600);
    await h.reconcile('heartbeat');
    expect(await h.summary()).toEqual([['youtube.com', 60, 'recovered']]);
  });

  it('notifies listeners only when sessions change, not on heartbeats', async () => {
    await h.visit('https://youtube.com/');
    await h.stay(120);
    expect(h.onSessionsChanged).toHaveBeenCalledTimes(1);
    await h.visit('about:blank');
    expect(h.onSessionsChanged).toHaveBeenCalledTimes(2);
    expect(h.onSessionsChanged).toHaveBeenLastCalledWith([expect.objectContaining({ domain: 'youtube.com' })]);
  });
});
