import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resolveDay } from '../src/utils/dates.js';

import { clearDatabase, connectTestDatabase, createTestApp, disconnectTestDatabase, sessionAt } from './helpers.js';

const app = createTestApp();

beforeAll(connectTestDatabase);
beforeEach(async () => {
  await clearDatabase();
  await request(app)
    .post('/api/sessions/sync')
    .send({
      sessions: [
        sessionAt('2026-11-16T09:00:00.000Z', 30),
        sessionAt('2026-11-16T13:00:00.000Z', 20),
        sessionAt('2026-11-16T15:00:00.000Z', 45, { domain: 'github.com', websiteName: 'GitHub' }),
        sessionAt('2026-11-14T15:00:00.000Z', 60, { domain: 'netflix.com', websiteName: 'Netflix' }),
        sessionAt('2026-11-01T15:00:00.000Z', 10), // outside the week
      ],
    })
    .expect(200);
});
afterAll(disconnectTestDatabase);

describe('GET /api/analytics/today', () => {
  it('summarizes the requested day', async () => {
    const response = await request(app).get('/api/analytics/today?date=2026-11-16').expect(200);
    expect(response.body.data).toEqual({
      date: '2026-11-16',
      totalTrackedSeconds: 95 * 60,
      totalSessions: 3,
      websiteCount: 2,
      mostUsed: { domain: 'youtube.com', websiteName: 'YouTube', totalSeconds: 3000, sessions: 2 },
      websites: [
        { domain: 'youtube.com', websiteName: 'YouTube', totalSeconds: 3000, sessions: 2 },
        { domain: 'github.com', websiteName: 'GitHub', totalSeconds: 2700, sessions: 1 },
      ],
    });
  });

  it('returns zeros for a day without usage, and isolates users', async () => {
    const empty = await request(app).get('/api/analytics/today?date=2026-11-17').expect(200);
    expect(empty.body.data).toMatchObject({ totalTrackedSeconds: 0, totalSessions: 0, mostUsed: null, websites: [] });
    const other = await request(app).get('/api/analytics/today?date=2026-11-16').set('x-test-user', 'user-b').expect(200);
    expect(other.body.data.totalTrackedSeconds).toBe(0);
  });
});

describe('GET /api/analytics/weekly', () => {
  it('returns seven zero-filled days ending on endDate', async () => {
    const response = await request(app).get('/api/analytics/weekly?endDate=2026-11-16').expect(200);
    const { data } = response.body;
    expect(data.startDate).toBe('2026-11-10');
    expect(data.days.map((day: { date: string; totalTrackedSeconds: number }) => [day.date, day.totalTrackedSeconds])).toEqual([
      ['2026-11-10', 0],
      ['2026-11-11', 0],
      ['2026-11-12', 0],
      ['2026-11-13', 0],
      ['2026-11-14', 3600],
      ['2026-11-15', 0],
      ['2026-11-16', 5700],
    ]);
    expect(data.totalTrackedSeconds).toBe(9300);
    expect(data.averageDailySeconds).toBe(Math.round(9300 / 7));
  });

  it('validates parameters', async () => {
    await request(app).get('/api/analytics/weekly?endDate=2026-02-30').expect(400);
    await request(app).get('/api/analytics/weekly?tz=Nowhere/City').expect(400);
  });
});

describe('GET /api/analytics/websites', () => {
  it('ranks websites over a range', async () => {
    const response = await request(app).get('/api/analytics/websites?from=2026-11-10&to=2026-11-16').expect(200);
    expect(response.body.data.websites.map((w: { domain: string; totalSeconds: number }) => [w.domain, w.totalSeconds])).toEqual([
      ['netflix.com', 3600],
      ['youtube.com', 3000],
      ['github.com', 2700],
    ]);
    await request(app).get('/api/analytics/websites?from=2026-11-16&to=2026-11-10').expect(400);
  });
});

describe('resolveDay', () => {
  it('prefers an explicit date, else derives today in the time zone', () => {
    const now = new Date('2026-11-16T20:00:00.000Z');
    expect(resolveDay({ date: '2026-01-01', tz: 'Asia/Kolkata' }, now)).toBe('2026-01-01');
    expect(resolveDay({ tz: 'Asia/Kolkata' }, now)).toBe('2026-11-17');
    expect(resolveDay({}, now)).toBe('2026-11-16');
  });
});
