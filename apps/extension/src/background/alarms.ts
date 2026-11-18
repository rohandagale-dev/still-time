import { HEARTBEAT_PERIOD_MINUTES } from '@/services/tracking-config';

export const ALARMS = {
  /** Checkpoints the active session while one exists (keeps `lastSeenAt` fresh across suspensions). */
  heartbeat: 'stilltime:heartbeat',
  /** Next sync attempt (debounced uploads and retries with backoff). */
  sync: 'stilltime:sync',
} as const;

/** Chrome rejects alarms sooner than 30 seconds out. */
export const MIN_ALARM_DELAY_MS = 30_000;

export interface AlarmScheduler {
  /** Ensures the heartbeat alarm runs exactly when a session is active. */
  setHeartbeat(active: boolean): Promise<void>;
  /** Schedules the sync alarm at `at` unless one is already due earlier. */
  scheduleSync(at: number): Promise<void>;
  clearSync(): Promise<void>;
}

export function createChromeAlarmScheduler(now: () => number = Date.now): AlarmScheduler {
  return {
    async setHeartbeat(active) {
      const existing = await chrome.alarms.get(ALARMS.heartbeat);
      if (active && !existing) {
        await chrome.alarms.create(ALARMS.heartbeat, {
          delayInMinutes: HEARTBEAT_PERIOD_MINUTES,
          periodInMinutes: HEARTBEAT_PERIOD_MINUTES,
        });
      } else if (!active && existing) {
        await chrome.alarms.clear(ALARMS.heartbeat);
      }
    },
    async scheduleSync(at) {
      const when = Math.max(at, now() + MIN_ALARM_DELAY_MS);
      const existing = await chrome.alarms.get(ALARMS.sync);
      if (existing && existing.scheduledTime <= when) return;
      await chrome.alarms.create(ALARMS.sync, { when });
    },
    async clearSync() {
      await chrome.alarms.clear(ALARMS.sync);
    },
  };
}
