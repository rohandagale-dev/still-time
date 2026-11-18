import type { FinalSessionStatus } from '@stilltime/shared';

import { MAX_UNOBSERVED_GAP_MS, MIN_SESSION_DURATION_MS } from '@/services/tracking-config';
import type { ActiveSession, SessionRecord } from '@/types';
import { secondsBetween, splitByLocalDay } from '@/utils/time';

/**
 * Session lifecycle — pure functions, no I/O.
 *
 * A session is a continuous period of active use of one website. It is identified by a random id
 * generated when it starts; that id is also the sync idempotency key. Sessions never span local
 * midnight: a session that does is split, and every part after the first gets a deterministic id
 * (`<root id>:<date>`), so re-running the same split after a crash produces the same records.
 */

export interface TrackingTarget {
  domain: string;
  websiteName: string;
}

export interface TransitionPlan {
  /** Finished sessions to record (already split per day; noise-length sessions dropped). */
  completed: SessionRecord[];
  /** The active session after the transition (`null` when nothing is tracked). */
  active: ActiveSession | null;
  /**
   * `true` when sessions started, ended or were split; `false` for a pure heartbeat (only
   * `lastSeenAt` advanced) or when nothing happened at all.
   */
  changed: boolean;
}

const rootId = (id: string): string => id.split(':')[0] ?? id;
const continuationId = (id: string, date: string): string => `${rootId(id)}:${date}`;

/**
 * Turns an active session that ends at `endAt` into finished records, one per local day. Parts
 * shorter than {@link MIN_SESSION_DURATION_MS} are dropped as noise.
 */
export function finishSession(active: ActiveSession, endAt: number, status: FinalSessionStatus): SessionRecord[] {
  return splitByLocalDay(active.startedAt, Math.max(active.startedAt, endAt))
    .map((segment, index): SessionRecord => ({
      id: index === 0 ? active.id : continuationId(active.id, segment.date),
      domain: active.domain,
      websiteName: active.websiteName,
      startedAt: segment.start,
      endedAt: segment.end,
      durationSeconds: secondsBetween(segment.start, segment.end),
      date: segment.date,
      status,
      syncState: 'pending',
      syncError: null,
    }))
    .filter((record) => record.endedAt - record.startedAt >= MIN_SESSION_DURATION_MS);
}

/** `true` when nothing confirmed the session for too long (sleep, crash, shutdown) or the clock went back. */
export function isUnobserved(active: ActiveSession, now: number): boolean {
  return now < active.lastSeenAt || now - active.lastSeenAt > MAX_UNOBSERVED_GAP_MS;
}

/**
 * Computes the transition from the persisted active session to what should be tracked now.
 *
 * 1. An active session whose last confirmation is too old is closed at that last confirmation
 *    ("recovered") — the unobserved time is never counted.
 * 2. Same website as before → the session continues; it is split if it crossed local midnight.
 * 3. Different website or nothing → the session ends now, and a new one starts if needed.
 */
export function planTransition({
  active,
  target,
  now,
  newId,
}: {
  active: ActiveSession | null;
  target: TrackingTarget | null;
  now: number;
  newId: () => string;
}): TransitionPlan {
  const completed: SessionRecord[] = [];
  let current = active;
  let changed = false;

  if (current && isUnobserved(current, now)) {
    completed.push(...finishSession(current, current.lastSeenAt, 'recovered'));
    current = null;
    changed = true;
  }

  if (current && target && target.domain === current.domain) {
    const segments = splitByLocalDay(current.startedAt, now);
    const today = segments.at(-1);
    if (segments.length > 1 && today) {
      completed.push(...finishSession(current, today.start, 'completed'));
      return {
        completed,
        active: { ...current, id: continuationId(current.id, today.date), startedAt: today.start, lastSeenAt: now },
        changed: true,
      };
    }
    return { completed, active: { ...current, lastSeenAt: now }, changed };
  }

  if (current) {
    completed.push(...finishSession(current, now, 'completed'));
    changed = true;
  }

  if (!target) return { completed, active: null, changed };

  return {
    completed,
    active: { id: newId(), domain: target.domain, websiteName: target.websiteName, startedAt: now, lastSeenAt: now },
    changed: true,
  };
}
