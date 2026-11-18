import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearDatabase, connectTestDatabase, createTestApp, disconnectTestDatabase, websiteItem } from './helpers.js';

const app = createTestApp();

beforeAll(connectTestDatabase);
beforeEach(clearDatabase);
afterAll(disconnectTestDatabase);

const create = (body: object, user = 'user-a') => request(app).post('/api/websites').set('x-test-user', user).send(body);

describe('POST /api/websites', () => {
  it('normalizes the domain and derives a display name', async () => {
    const response = await create({ domain: 'https://www.YouTube.com/watch?v=1' }).expect(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        id: expect.stringMatching(/^[a-f0-9]{24}$/),
        domain: 'youtube.com',
        displayName: 'YouTube',
        faviconUrl: null,
        isEnabled: true,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
  });

  it('prevents duplicate registration (409), including via aliases of the same website', async () => {
    await create({ domain: 'youtube.com' }).expect(201);
    const duplicate = await create({ domain: 'm.youtube.com' }).expect(409);
    expect(duplicate.body.error).toMatchObject({ code: 'CONFLICT', details: { domain: 'youtube.com' } });
  });

  it('allows different users to track the same website', async () => {
    await create({ domain: 'youtube.com' }, 'user-a').expect(201);
    await create({ domain: 'youtube.com' }, 'user-b').expect(201);
  });

  it('validates input', async () => {
    const response = await create({ domain: 'chrome://settings', isEnabled: 'yes', extra: 1 }).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.map((issue: { path: string }) => issue.path).sort()).toEqual(['', 'domain', 'isEnabled']);
    await create({ domain: 'example.com', faviconUrl: 'javascript:alert(1)' }).expect(400);
  });
});

describe('GET / PATCH / DELETE /api/websites', () => {
  it('lists only the caller’s websites, oldest first, with an enabled filter', async () => {
    await create({ domain: 'youtube.com' });
    await create({ domain: 'github.com', isEnabled: false });
    await create({ domain: 'reddit.com' }, 'user-b');

    const all = await request(app).get('/api/websites').expect(200);
    expect(all.body.data.map((w: { domain: string }) => w.domain)).toEqual(['youtube.com', 'github.com']);
    const enabled = await request(app).get('/api/websites?enabled=true').expect(200);
    expect(enabled.body.data.map((w: { domain: string }) => w.domain)).toEqual(['youtube.com']);
  });

  it('updates a website', async () => {
    const { body } = await create({ domain: 'youtube.com' });
    const response = await request(app)
      .patch(`/api/websites/${body.data.id}`)
      .send({ isEnabled: false, displayName: '  Tube  ' })
      .expect(200);
    expect(response.body.data).toMatchObject({ isEnabled: false, displayName: 'Tube' });
    await request(app).patch(`/api/websites/${body.data.id}`).send({}).expect(400);
  });

  it('soft-deletes, then restores the same record when re-added', async () => {
    const { body } = await create({ domain: 'youtube.com' });
    await request(app).delete(`/api/websites/${body.data.id}`).expect(200, { success: true, data: { id: body.data.id, deleted: true } });
    expect((await request(app).get('/api/websites')).body.data).toEqual([]);
    await request(app).delete(`/api/websites/${body.data.id}`).expect(404);

    const restored = await create({ domain: 'youtube.com' }).expect(201);
    expect(restored.body.data.id).toBe(body.data.id);
  });

  it('isolates users and validates ids', async () => {
    const { body } = await create({ domain: 'youtube.com' }, 'user-a');
    await request(app).patch(`/api/websites/${body.data.id}`).set('x-test-user', 'user-b').send({ isEnabled: false }).expect(404);
    await request(app).delete(`/api/websites/${body.data.id}`).set('x-test-user', 'user-b').expect(404);
    const invalid = await request(app).delete('/api/websites/not-an-id').expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/websites/sync (offline-first, last write wins)', () => {
  const sync = (websites: unknown[], user = 'user-a') =>
    request(app).post('/api/websites/sync').set('x-test-user', user).send({ websites });

  it('applies new state and is idempotent for retries', async () => {
    const item = websiteItem();
    expect((await sync([item]).expect(200)).body.data.results).toEqual([{ domain: 'youtube.com', status: 'applied' }]);
    expect((await sync([item]).expect(200)).body.data.results).toEqual([{ domain: 'youtube.com', status: 'applied' }]);
    const list = await request(app).get('/api/websites');
    expect(list.body.data).toHaveLength(1);
  });

  it('ignores older changes and applies newer ones', async () => {
    await sync([websiteItem({ isEnabled: false, updatedAt: '2026-11-16T12:00:00.000Z' })]);
    const stale = await sync([websiteItem({ isEnabled: true, updatedAt: '2026-11-16T11:00:00.000Z' })]);
    expect(stale.body.data.results).toEqual([{ domain: 'youtube.com', status: 'stale' }]);
    expect((await request(app).get('/api/websites')).body.data[0].isEnabled).toBe(false);

    await sync([websiteItem({ isEnabled: true, updatedAt: '2026-11-16T13:00:00.000Z' })]);
    expect((await request(app).get('/api/websites')).body.data[0].isEnabled).toBe(true);
  });

  it('applies tombstones, and a later re-add wins over them', async () => {
    await sync([websiteItem({ updatedAt: '2026-11-16T10:00:00.000Z' })]);
    await sync([websiteItem({ deleted: true, updatedAt: '2026-11-16T11:00:00.000Z' })]);
    expect((await request(app).get('/api/websites')).body.data).toEqual([]);
    await sync([websiteItem({ updatedAt: '2026-11-16T12:00:00.000Z' })]);
    expect((await request(app).get('/api/websites')).body.data).toHaveLength(1);
  });

  it('rejects invalid items individually without blocking valid ones', async () => {
    const response = await sync([websiteItem({ domain: 'not a domain' }), websiteItem({ domain: 'www.github.com', displayName: 'GitHub' })]);
    expect(response.body.data.results).toEqual([
      { domain: 'not a domain', status: 'rejected', reason: expect.stringContaining('domain') },
      { domain: 'github.com', status: 'applied' },
    ]);
  });

  it('validates the envelope', async () => {
    await sync([]).expect(400);
    await request(app).post('/api/websites/sync').send({ websites: 'nope' }).expect(400);
  });
});
