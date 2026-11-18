import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DailyUsageModel } from '../src/models/daily-usage.model.js';
import { WebsiteSessionModel } from '../src/models/website-session.model.js';

import { clearDatabase, connectTestDatabase, createTestApp, disconnectTestDatabase, sessionAt, sessionItem } from './helpers.js';

const app = createTestApp();

beforeAll(connectTestDatabase);
beforeEach(clearDatabase);
afterAll(disconnectTestDatabase);

const sync = (sessions: unknown[], user = 'user-a') =>
  request(app).post('/api/sessions/sync').set('x-test-user', user).set('x-stilltime-client-id', 'device-1').send({ sessions });

describe('POST /api/sessions/sync', () => {
  it('stores new sessions and reports them as accepted', async () => {
    const a = sessionItem();
    const b = sessionItem({ domain: 'github.com', websiteName: 'GitHub' });
    const response = await sync([a, b]).expect(200);
    expect(response.body.data).toEqual({ accepted: [a.id, b.id], duplicates: [], rejected: [] });

    const stored = await WebsiteSessionModel.findOne({ clientSessionId: a.id }).lean();
    expect(stored).toMatchObject({ userId: 'user-a', clientId: 'device-1', domain: 'youtube.com', durationSeconds: 600, status: 'completed' });
  });

  it('is idempotent: re-sending a batch never creates duplicates', async () => {
    const batch = [sessionItem(), sessionItem()];
    await sync(batch).expect(200);
    const again = await sync(batch).expect(200);
    expect(again.body.data).toEqual({ accepted: [], duplicates: batch.map((s) => s.id), rejected: [] });
    expect(await WebsiteSessionModel.countDocuments()).toBe(2);
  });

  it('handles duplicates within one batch and concurrent uploads of the same sessions', async () => {
    const session = sessionItem();
    const inBatch = await sync([session, session]).expect(200);
    expect(inBatch.body.data).toEqual({ accepted: [session.id], duplicates: [session.id], rejected: [] });

    const racing = [sessionItem(), sessionItem(), sessionItem()];
    const results = await Promise.all([sync(racing), sync(racing), sync(racing)]);
    const accepted = results.flatMap((r) => r.body.data.accepted);
    expect(accepted.sort()).toEqual(racing.map((s) => s.id).sort());
    expect(await WebsiteSessionModel.countDocuments()).toBe(4);
  });

  it('scopes idempotency per user', async () => {
    const session = sessionItem();
    await sync([session], 'user-a');
    const other = await sync([session], 'user-b');
    expect(other.body.data.accepted).toEqual([session.id]);
  });

  it.each([
    ['end before start', { endedAt: '2026-11-16T09:00:00.000Z', durationSeconds: 0 }, 'endedAt'],
    ['duration mismatch', { durationSeconds: 1234 }, 'durationSeconds'],
    ['future session', { startedAt: '2099-01-01T00:00:00.000Z', endedAt: '2099-01-01T00:10:00.000Z', date: '2099-01-01' }, 'endedAt'],
    ['date unrelated to start', { date: '2026-11-10' }, 'date'],
    ['unsupported domain', { domain: 'chrome://settings' }, 'domain'],
    ['active status', { status: 'active' }, 'status'],
    ['malformed id', { id: 'bad id!' }, 'id'],
  ])('rejects invalid sessions individually: %s', async (_label, overrides, field) => {
    const good = sessionItem();
    const bad = { ...sessionItem(), ...overrides };
    const response = await sync([bad, good]).expect(200);
    expect(response.body.data.accepted).toEqual([good.id]);
    expect(response.body.data.rejected).toEqual([{ id: bad.id, reason: expect.stringContaining(field) }]);
  });

  it('links sessions to the tracked website when registered', async () => {
    const { body } = await request(app).post('/api/websites').send({ domain: 'youtube.com' }).expect(201);
    await sync([sessionItem()]);
    const stored = await WebsiteSessionModel.findOne().lean();
    expect(stored?.websiteId?.toString()).toBe(body.data.id);
  });

  it('recomputes the DailyUsage rollup from sessions', async () => {
    await sync([
      sessionAt('2026-11-16T09:00:00.000Z', 30),
      sessionAt('2026-11-16T11:00:00.000Z', 15),
      sessionAt('2026-11-16T12:00:00.000Z', 50, { domain: 'github.com', websiteName: 'GitHub' }),
      sessionAt('2026-11-15T20:00:00.000Z', 10),
    ]);
    const day = await DailyUsageModel.findOne({ userId: 'user-a', date: '2026-11-16' }).lean();
    expect(day).toMatchObject({
      totalTrackedSeconds: 95 * 60,
      totalSessions: 3,
      websiteBreakdown: [
        { domain: 'github.com', websiteName: 'GitHub', totalSeconds: 3000, sessions: 1 },
        { domain: 'youtube.com', websiteName: 'YouTube', totalSeconds: 2700, sessions: 2 },
      ],
    });
    expect(await DailyUsageModel.countDocuments({ userId: 'user-a' })).toBe(2);
  });

  it('validates the envelope (size limits included)', async () => {
    await sync([]).expect(400);
    await sync(Array.from({ length: 201 }, () => sessionItem())).expect(400);
    await request(app).post('/api/sessions/sync').send({}).expect(400);
  });
});

describe('POST /api/sessions', () => {
  it('creates a session once (201), then reports it as existing (200)', async () => {
    const session = sessionItem();
    const first = await request(app).post('/api/sessions').send(session).expect(201);
    expect(first.body.data).toMatchObject({ created: true, session: { clientSessionId: session.id, domain: 'youtube.com' } });
    const second = await request(app).post('/api/sessions').send(session).expect(200);
    expect(second.body.data.created).toBe(false);
    await request(app).post('/api/sessions').send({ ...session, durationSeconds: -1 }).expect(400);
  });
});

describe('GET /api/sessions and /api/sessions/today', () => {
  it('lists recent sessions with filters and cursor pagination', async () => {
    await sync([
      sessionAt('2026-11-14T10:00:00.000Z', 5),
      sessionAt('2026-11-15T10:00:00.000Z', 5, { domain: 'github.com', websiteName: 'GitHub' }),
      sessionAt('2026-11-16T10:00:00.000Z', 5),
      sessionAt('2026-11-16T11:00:00.000Z', 5),
    ]);
    const page1 = await request(app).get('/api/sessions?limit=2').expect(200);
    expect(page1.body.data.sessions.map((s: { startedAt: string }) => s.startedAt)).toEqual([
      '2026-11-16T11:00:00.000Z',
      '2026-11-16T10:00:00.000Z',
    ]);
    const page2 = await request(app).get(`/api/sessions?limit=2&before=${page1.body.data.nextBefore}`).expect(200);
    expect(page2.body.data.sessions).toHaveLength(2);
    expect(page2.body.data.nextBefore).toBeNull();

    const filtered = await request(app).get('/api/sessions?domain=www.youtube.com&from=2026-11-15&to=2026-11-16').expect(200);
    expect(filtered.body.data.sessions).toHaveLength(2);
    await request(app).get('/api/sessions?from=2026-11-16&to=2026-11-01').expect(400);
    await request(app).get('/api/sessions?limit=1000').expect(400);
  });

  it('returns the sessions of the client’s day', async () => {
    await sync([sessionAt('2026-11-16T10:00:00.000Z', 5), sessionAt('2026-11-15T10:00:00.000Z', 5)]);
    const response = await request(app).get('/api/sessions/today?date=2026-11-16').expect(200);
    expect(response.body.data.date).toBe('2026-11-16');
    expect(response.body.data.sessions).toHaveLength(1);
    await request(app).get('/api/sessions/today?tz=Mars/Base').expect(400);
  });
});
