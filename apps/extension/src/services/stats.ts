import { addDaysToDateKey, dateKeyRange, toLocalDateKey } from '@stilltime/shared';

import type { ActiveSession, SessionRecord } from '@/types';
import { splitByLocalDay } from '@/utils/time';

import { MAX_UNOBSERVED_GAP_MS } from './tracking-config';

export const WEEK_LENGTH_DAYS = 7;

export interface WebsiteUsage {
  domain: string;
  websiteName: string;
  seconds: number;
  sessions: number;
}

export interface DayUsage {
  date: string;
  seconds: number;
  sessions: number;
}

export interface LiveSession {
  domain: string;
  websiteName: string;
  /** Elapsed seconds of the session in progress. */
  seconds: number;
}

export interface UsageSummary {
  today: {
    date: string;
    seconds: number;
    sessions: number;
    /** Sorted by usage, descending. */
    websites: WebsiteUsage[];
    mostUsed: WebsiteUsage | null;
  };
  week: {
    /** The last seven days including today, oldest first; zero-filled. */
    days: DayUsage[];
    totalSeconds: number;
    /** Average over the days since usage was first recorded in this window (0 when empty). */
    averageSeconds: number;
    maxSeconds: number;
  };
  live: LiveSession | null;
}

/** First date of the seven-day window ending today. */
export function weekStartDate(now: number): string {
  return addDaysToDateKey(toLocalDateKey(now), -(WEEK_LENGTH_DAYS - 1));
}

/**
 * The visible end of an active session. It is never extended past the unobserved-gap limit, so a
 * stale checkpoint (e.g. after sleep, before the service worker reconciles) is not over-counted.
 */
export function liveSessionEnd(active: ActiveSession, now: number): number {
  return Math.min(now, active.lastSeenAt + MAX_UNOBSERVED_GAP_MS);
}

/**
 * Builds today's and this week's statistics from finished sessions plus the session in progress.
 * Pure: the same inputs always produce the same summary.
 */
export function computeUsageSummary(input: {
  sessions: readonly SessionRecord[];
  active: ActiveSession | null;
  now: number;
}): UsageSummary {
  const { sessions, active, now } = input;
  const today = toLocalDateKey(now);
  const days = new Map<string, DayUsage>(
    dateKeyRange(weekStartDate(now), today).map((date) => [date, { date, seconds: 0, sessions: 0 }]),
  );
  const todayByDomain = new Map<string, WebsiteUsage>();

  const add = (domain: string, websiteName: string, date: string, seconds: number): void => {
    const day = days.get(date);
    if (!day) return;
    day.seconds += seconds;
    day.sessions += 1;
    if (date !== today) return;
    const usage = todayByDomain.get(domain) ?? { domain, websiteName, seconds: 0, sessions: 0 };
    usage.seconds += seconds;
    usage.sessions += 1;
    todayByDomain.set(domain, usage);
  };

  for (const session of sessions) add(session.domain, session.websiteName, session.date, session.durationSeconds);

  let live: LiveSession | null = null;
  if (active) {
    const end = liveSessionEnd(active, now);
    if (end > active.startedAt) {
      // The worker splits sessions at midnight, so each day-part counts as its own session.
      for (const segment of splitByLocalDay(active.startedAt, end)) {
        add(active.domain, active.websiteName, segment.date, (segment.end - segment.start) / 1000);
      }
      live = { domain: active.domain, websiteName: active.websiteName, seconds: (end - active.startedAt) / 1000 };
    }
  }

  const websites = [...todayByDomain.values()].sort(
    (a, b) => b.seconds - a.seconds || a.websiteName.localeCompare(b.websiteName),
  );
  const dayList = [...days.values()];
  const totalSeconds = dayList.reduce((sum, day) => sum + day.seconds, 0);
  const firstActiveIndex = dayList.findIndex((day) => day.seconds > 0);
  const activeSpan = firstActiveIndex === -1 ? 0 : dayList.length - firstActiveIndex;
  const todayUsage = days.get(today) ?? { date: today, seconds: 0, sessions: 0 };

  return {
    today: {
      date: today,
      seconds: todayUsage.seconds,
      sessions: todayUsage.sessions,
      websites,
      mostUsed: websites.find((website) => website.seconds > 0) ?? null,
    },
    week: {
      days: dayList,
      totalSeconds,
      averageSeconds: activeSpan === 0 ? 0 : totalSeconds / activeSpan,
      maxSeconds: dayList.reduce((max, day) => Math.max(max, day.seconds), 0),
    },
    live,
  };
}
