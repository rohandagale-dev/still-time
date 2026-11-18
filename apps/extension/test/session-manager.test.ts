import { describe, expect, it } from 'vitest';

import { finishSession, isUnobserved, planTransition } from '@/background/session-manager';
import { MAX_UNOBSERVED_GAP_MS } from '@/services/tracking-config';
import type { ActiveSession } from '@/types';

const at = (day: number, hours: number, minutes = 0, seconds = 0, ms = 0): number =>
  new Date(2026, 10, day, hours, minutes, seconds, ms).getTime();

const youtube = { domain: 'youtube.com', websiteName: 'YouTube' };
const github = { domain: 'github.com', websiteName: 'GitHub' };
const active = (overrides: Partial<ActiveSession> = {}): ActiveSession => ({
  id: 'root',
  ...youtube,
  startedAt: at(16, 10),
  lastSeenAt: at(16, 10, 5),
  ...overrides,
});
const ids = () => {
  let n = 0;
  return () => `new-${++n}`;
};

describe('finishSession', () => {
  it('computes the duration from timestamps', () => {
    expect(finishSession(active(), at(16, 10, 45), 'completed')).toEqual([
      {
        id: 'root',
        domain: 'youtube.com',
        websiteName: 'YouTube',
        startedAt: at(16, 10),
        endedAt: at(16, 10, 45),
        durationSeconds: 2700,
        date: '2026-11-16',
        status: 'completed',
        syncState: 'pending',
        syncError: null,
      },
    ]);
  });

  it('splits at midnight with deterministic continuation ids', () => {
    const records = finishSession(active({ startedAt: at(16, 23, 50) }), at(17, 0, 20), 'completed');
    expect(records.map((r) => [r.id, r.date, r.durationSeconds])).toEqual([
      ['root', '2026-11-16', 600],
      ['root:2026-11-17', '2026-11-17', 1200],
    ]);
  });

  it('drops noise-length sessions', () => {
    expect(finishSession(active(), at(16, 10, 0, 0, 900), 'completed')).toEqual([]);
    expect(finishSession(active(), at(16, 9), 'completed')).toEqual([]);
  });
});

describe('isUnobserved', () => {
  it('flags long gaps and a clock that went backwards', () => {
    const session = active({ lastSeenAt: at(16, 10) });
    expect(isUnobserved(session, at(16, 10) + MAX_UNOBSERVED_GAP_MS)).toBe(false);
    expect(isUnobserved(session, at(16, 10) + MAX_UNOBSERVED_GAP_MS + 1)).toBe(true);
    expect(isUnobserved(session, at(16, 9, 59))).toBe(true);
  });
});

describe('planTransition', () => {
  it('does nothing when nothing is tracked and nothing should be', () => {
    expect(planTransition({ active: null, target: null, now: at(16, 10), newId: ids() })).toEqual({
      completed: [],
      active: null,
      changed: false,
    });
  });

  it('starts a session', () => {
    const plan = planTransition({ active: null, target: youtube, now: at(16, 10), newId: ids() });
    expect(plan).toEqual({
      completed: [],
      active: { id: 'new-1', ...youtube, startedAt: at(16, 10), lastSeenAt: at(16, 10) },
      changed: true,
    });
  });

  it('extends the same website as a heartbeat (no change)', () => {
    const plan = planTransition({ active: active(), target: youtube, now: at(16, 10, 5, 30), newId: ids() });
    expect(plan).toEqual({ completed: [], active: active({ lastSeenAt: at(16, 10, 5, 30) }), changed: false });
  });

  it('ends the session when switching websites and starts the next at the same instant', () => {
    const plan = planTransition({ active: active(), target: github, now: at(16, 10, 5, 20), newId: ids() });
    expect(plan.completed.map((r) => [r.domain, r.endedAt, r.status])).toEqual([['youtube.com', at(16, 10, 5, 20), 'completed']]);
    expect(plan.active).toMatchObject({ ...github, startedAt: at(16, 10, 5, 20) });
    expect(plan.changed).toBe(true);
  });

  it('ends the session when nothing should be tracked', () => {
    const plan = planTransition({ active: active(), target: null, now: at(16, 10, 5, 20), newId: ids() });
    expect(plan.completed).toHaveLength(1);
    expect(plan.active).toBeNull();
  });

  it('recovers an unobserved session at its last confirmation, never counting the gap', () => {
    // Laptop slept at 10:05 with YouTube open, woke at 18:00 still on YouTube.
    const plan = planTransition({ active: active(), target: youtube, now: at(16, 18), newId: ids() });
    expect(plan.completed.map((r) => [r.endedAt, r.durationSeconds, r.status])).toEqual([
      [at(16, 10, 5), 300, 'recovered'],
    ]);
    expect(plan.active).toMatchObject({ id: 'new-1', startedAt: at(16, 18) });
  });

  it('continues across midnight by splitting off yesterday', () => {
    const plan = planTransition({
      active: active({ startedAt: at(16, 23, 59, 30), lastSeenAt: at(16, 23, 59, 55) }),
      target: youtube,
      now: at(17, 0, 0, 20),
      newId: ids(),
    });
    expect(plan.completed.map((r) => [r.id, r.date, r.endedAt, r.durationSeconds])).toEqual([
      ['root', '2026-11-16', at(17, 0), 30],
    ]);
    expect(plan.active).toEqual({ id: 'root:2026-11-17', ...youtube, startedAt: at(17, 0), lastSeenAt: at(17, 0, 0, 20) });
    expect(plan.changed).toBe(true);
  });
});
