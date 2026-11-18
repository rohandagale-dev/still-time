import { describe, expect, it } from 'vitest';

import { computeUsageSummary, liveSessionEnd } from '@/services/stats';
import { MAX_UNOBSERVED_GAP_MS } from '@/services/tracking-config';
import type { ActiveSession, SessionRecord } from '@/types';
import { splitByLocalDay } from '@/utils/time';

const at = (day: number, hours: number, minutes = 0, seconds = 0): number =>
  new Date(2026, 10, day, hours, minutes, seconds).getTime(); // November 2026, local time

const session = (domain: string, start: number, end: number, overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: `${domain}-${start}`,
  domain,
  websiteName: domain,
  startedAt: start,
  endedAt: end,
  durationSeconds: Math.round((end - start) / 1000),
  date: new Date(start).toLocaleDateString('en-CA'),
  status: 'completed',
  syncState: 'pending',
  syncError: null,
  ...overrides,
});

describe('splitByLocalDay', () => {
  it('returns one segment within a day', () => {
    expect(splitByLocalDay(at(16, 10), at(16, 11))).toEqual([{ date: '2026-11-16', start: at(16, 10), end: at(16, 11) }]);
  });

  it('splits at local midnight', () => {
    expect(splitByLocalDay(at(15, 23, 50), at(16, 0, 20))).toEqual([
      { date: '2026-11-15', start: at(15, 23, 50), end: at(16, 0) },
      { date: '2026-11-16', start: at(16, 0), end: at(16, 0, 20) },
    ]);
  });

  it('is DST-safe (1 Nov 2026 is 25 hours long in New York)', () => {
    const start = new Date(2026, 10, 1, 0, 30).getTime();
    const end = new Date(2026, 10, 2, 0, 30).getTime();
    const segments = splitByLocalDay(start, end);
    expect(segments.map((segment) => segment.date)).toEqual(['2026-11-01', '2026-11-02']);
    expect(segments[0]?.end).toBe(new Date(2026, 10, 2).getTime());
    expect((end - start) / 3_600_000).toBe(25);
  });

  it('returns nothing for empty or inverted intervals', () => {
    expect(splitByLocalDay(at(16, 10), at(16, 10))).toEqual([]);
    expect(splitByLocalDay(at(16, 11), at(16, 10))).toEqual([]);
  });
});

describe('computeUsageSummary', () => {
  const now = at(16, 15);

  it('aggregates today by website and ranks the most-used', () => {
    const summary = computeUsageSummary({
      now,
      active: null,
      sessions: [
        session('youtube.com', at(16, 9), at(16, 9, 30)),
        session('youtube.com', at(16, 10), at(16, 10, 15)),
        session('github.com', at(16, 11), at(16, 11, 50)),
        session('reddit.com', at(15, 20), at(15, 21)),
      ],
    });
    expect(summary.today.seconds).toBe(45 * 60 + 50 * 60);
    expect(summary.today.sessions).toBe(3);
    expect(summary.today.websites.map((w) => [w.domain, w.seconds, w.sessions])).toEqual([
      ['github.com', 3000, 1],
      ['youtube.com', 2700, 2],
    ]);
    expect(summary.today.mostUsed?.domain).toBe('github.com');
  });

  it('builds a zero-filled seven-day window, oldest first', () => {
    const summary = computeUsageSummary({
      now,
      active: null,
      sessions: [session('reddit.com', at(15, 20), at(15, 21)), session('reddit.com', at(1, 20), at(1, 21))],
    });
    expect(summary.week.days.map((day) => day.date)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(summary.week.totalSeconds).toBe(3600); // the Nov 1 session is outside the window
    expect(summary.week.maxSeconds).toBe(3600);
    // Averaged over the days since usage started in the window (Nov 15 and 16).
    expect(summary.week.averageSeconds).toBe(1800);
  });

  it('includes the live session and splits it at midnight', () => {
    const active: ActiveSession = {
      id: 'live',
      domain: 'youtube.com',
      websiteName: 'YouTube',
      startedAt: at(15, 23, 50),
      lastSeenAt: at(16, 0, 9, 50),
    };
    const summary = computeUsageSummary({ now: at(16, 0, 10), active, sessions: [] });
    expect(summary.today.seconds).toBe(600);
    expect(summary.week.days.find((day) => day.date === '2026-11-15')?.seconds).toBe(600);
    expect(summary.live).toEqual({ domain: 'youtube.com', websiteName: 'YouTube', seconds: 1200 });
  });

  it('never counts beyond the unobserved-gap limit of a stale checkpoint', () => {
    const active: ActiveSession = {
      id: 'stale',
      domain: 'netflix.com',
      websiteName: 'Netflix',
      startedAt: at(16, 9),
      lastSeenAt: at(16, 9, 10),
    };
    expect(liveSessionEnd(active, at(16, 14))).toBe(at(16, 9, 10) + MAX_UNOBSERVED_GAP_MS);
    const summary = computeUsageSummary({ now: at(16, 14), active, sessions: [] });
    expect(summary.today.seconds).toBe(10 * 60 + MAX_UNOBSERVED_GAP_MS / 1000);
  });

  it('handles an empty history', () => {
    const summary = computeUsageSummary({ now, active: null, sessions: [] });
    expect(summary.today).toMatchObject({ seconds: 0, sessions: 0, websites: [], mostUsed: null });
    expect(summary.week).toMatchObject({ totalSeconds: 0, averageSeconds: 0, maxSeconds: 0 });
    expect(summary.live).toBeNull();
  });
});
