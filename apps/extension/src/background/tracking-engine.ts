import { normalizeUrl } from '@/services/domain-normalizer';
import type { SessionStore } from '@/services/session-store';
import type { ExtensionStorage } from '@/services/storage';
import type { ActiveSession, SessionRecord, Settings, WebsiteRegistry } from '@/types';
import type { SerialQueue } from '@/utils/serial';

import type { AlarmScheduler } from './alarms';
import { planTransition, type TrackingTarget } from './session-manager';
import type { BrowserObservation, BrowserObserver } from './tab-manager';

/**
 * Decides which website, if any, should be tracked for an observation. All tracking rules live
 * here:
 *  - only the active tab of a focused Chrome window counts;
 *  - only websites in the registry with tracking enabled count; incognito never does;
 *  - a locked screen stops tracking; so does being idle — unless the user opted to count media
 *    and the tab is playing audio (watching a video produces no keyboard/mouse input).
 */
export function resolveTrackingTarget(
  observation: BrowserObservation,
  registry: Readonly<WebsiteRegistry>,
  settings: Pick<Settings, 'countMediaAsActive'>,
): TrackingTarget | null {
  const tab = observation.activeTab;
  if (!observation.windowFocused || !tab || tab.incognito) return null;
  if (observation.idleState === 'locked') return null;
  if (observation.idleState === 'idle' && !(settings.countMediaAsActive && tab.audible)) return null;

  const normalized = normalizeUrl(tab.url);
  if (!normalized) return null;
  const website = registry[normalized.domain];
  if (!website || website.deletedAt !== null || !website.isEnabled) return null;
  return { domain: website.domain, websiteName: website.displayName };
}

export interface TrackingEngineDependencies {
  run: SerialQueue;
  storage: ExtensionStorage;
  sessions: SessionStore;
  browser: BrowserObserver;
  alarms: Pick<AlarmScheduler, 'setHeartbeat'>;
  now: () => number;
  newId: () => string;
  /** Called after sessions started, ended or were recorded (after they are persisted). */
  onSessionsChanged: (completed: readonly SessionRecord[]) => void;
}

/**
 * Event-driven, persistence-first tracking. Every browser event triggers `reconcile`, which
 * re-derives what should be tracked from live browser state and applies the difference to the
 * persisted active session in one atomic write. Reconciliations are serialized, so concurrent
 * events can never create duplicate or overlapping sessions. Nothing relies on timers or
 * in-memory state surviving: a suspended or restarted worker simply reconciles again.
 */
export function createTrackingEngine(deps: TrackingEngineDependencies) {
  const { run, storage, sessions, browser, alarms, now, newId, onSessionsChanged } = deps;

  async function reconcileNow(): Promise<ActiveSession | null> {
    const [settings, registry, active] = await Promise.all([
      storage.getSettings(),
      storage.getRegistry(),
      sessions.getActiveSession(),
    ]);
    const observation = await browser.observe(settings.idleThresholdSeconds);
    const target = resolveTrackingTarget(observation, registry, settings);
    const plan = planTransition({ active, target, now: now(), newId });

    if (plan.changed) {
      await sessions.commitTransition({ completed: plan.completed, active: plan.active });
    } else if (plan.active) {
      await sessions.saveActiveSession(plan.active); // heartbeat checkpoint
    }
    await alarms.setHeartbeat(plan.active !== null);
    if (plan.changed) onSessionsChanged(plan.completed);
    return plan.active;
  }

  return {
    /** Re-checks what should be tracked right now. `reason` is for debugging only. */
    reconcile(reason: string): Promise<ActiveSession | null> {
      void reason;
      return run(reconcileNow);
    },
    applySettings(settings: Settings): void {
      browser.setIdleDetectionInterval(settings.idleThresholdSeconds);
    },
  };
}

export type TrackingEngine = ReturnType<typeof createTrackingEngine>;
