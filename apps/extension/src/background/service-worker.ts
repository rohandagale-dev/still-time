/**
 * Stilltime service worker (Manifest V3).
 *
 * The worker can be suspended at any time, so it keeps no state in memory that matters: all
 * listeners are registered synchronously at the top level (Chrome only dispatches wake-up events
 * to listeners registered during the first turn of the event loop), and every handler reads and
 * writes persisted state through the tracking engine's serial queue.
 */
import { broadcastEvent } from '@/services/events';
import { createSessionStore } from '@/services/session-store';
import { createExtensionStorage } from '@/services/storage';
import { createSyncManager } from '@/services/sync-manager';
import { createTrackingApi } from '@/services/tracking-api';
import { createSerialQueue } from '@/utils/serial';

import { ALARMS, createChromeAlarmScheduler } from './alarms';
import { createMessageRouter } from './message-router';
import { createChromeBrowserObserver } from './tab-manager';
import { createTrackingEngine } from './tracking-engine';

const storage = createExtensionStorage();
const sessions = createSessionStore();
const alarms = createChromeAlarmScheduler();
const run = createSerialQueue();

const sync = createSyncManager({
  run,
  storage,
  sessions,
  alarms,
  createApi: ({ baseUrl, clientId }) => createTrackingApi({ baseUrl, clientId }),
  now: Date.now,
});

const logError = (context: string) => (error: unknown) => console.error(`[stilltime] ${context} failed`, error);

const tracking = createTrackingEngine({
  run,
  storage,
  sessions,
  browser: createChromeBrowserObserver(),
  alarms,
  now: Date.now,
  newId: () => crypto.randomUUID(),
  onSessionsChanged: (completed) => {
    broadcastEvent({ type: 'sessions-changed' });
    sync.onSessionsCompleted(completed).catch(logError('scheduling session upload'));
  },
});

const route = createMessageRouter({ run, storage, tracking, sync, now: Date.now });

const reconcile = (reason: string): void => {
  tracking.reconcile(reason).catch(logError(`reconcile (${reason})`));
};

// ─── Tracking triggers ──────────────────────────────────────────────────────

chrome.tabs.onActivated.addListener(() => reconcile('tab-activated'));

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  // URL changes include single-page-app navigations (history.pushState); audibility matters
  // when the user is idle and media counts as activity.
  if (!tab.active) return;
  if (changeInfo.url !== undefined || changeInfo.audible !== undefined || changeInfo.status === 'complete') {
    reconcile('tab-updated');
  }
});

chrome.tabs.onRemoved.addListener(() => reconcile('tab-removed'));
chrome.tabs.onReplaced.addListener(() => reconcile('tab-replaced'));

/**
 * Some Linux window managers report "no window focused" right before focus moves to another
 * Chrome window. Settle briefly before treating focus loss as real, so a window switch does
 * not split a session in two.
 */
const FOCUS_LOSS_SETTLE_MS = 250;
let focusLossTimer: ReturnType<typeof setTimeout> | undefined;
chrome.windows.onFocusChanged.addListener((windowId) => {
  clearTimeout(focusLossTimer);
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    focusLossTimer = setTimeout(() => reconcile('focus-lost'), FOCUS_LOSS_SETTLE_MS);
  } else {
    reconcile('focus-changed');
  }
});

chrome.idle.onStateChanged.addListener((state) => reconcile(`idle-${state}`));

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARMS.heartbeat) reconcile('heartbeat');
  if (alarm.name === ALARMS.sync) sync.runScheduled().catch(logError('scheduled sync'));
});

// ─── Messages from extension pages ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only this extension's own pages may talk to the worker.
  if (sender.id !== chrome.runtime.id) return false;
  void route(message).then(sendResponse);
  return true; // keep the channel open for the async response
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────

/**
 * Runs on every worker start (install, browser start, or wake-up after suspension). Re-applies
 * the idle threshold (not persisted by Chrome across restarts) and reconciles, which also closes
 * any session left open by a crash or shutdown at its last confirmed moment.
 */
async function initialize(reason: string): Promise<void> {
  tracking.applySettings(await storage.getSettings());
  await storage.getClientId();
  reconcile(reason);
  await sync.resume();
}

chrome.runtime.onInstalled.addListener((details) => {
  initialize(`installed-${details.reason}`).catch(logError('initialization'));
});
chrome.runtime.onStartup.addListener(() => {
  initialize('browser-startup')
    .then(() => sync.requestSync('browser-startup'))
    .catch(logError('initialization'));
});
initialize('worker-start').catch(logError('initialization'));
