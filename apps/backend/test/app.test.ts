import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { createDevelopmentAuthStrategy, denyAllAuthStrategy } from '../src/auth/strategies.js';
import { ConfigError, loadConfig } from '../src/config/env.js';
import { silentLogger } from '../src/utils/logger.js';

const app = createApp({
  config: { corsOrigins: ['chrome-extension://*', 'https://dashboard.example.com'], version: '1.2.3' },
  logger: silentLogger,
  authStrategy: denyAllAuthStrategy,
});

describe('app foundation', () => {
  it('serves health without authentication', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toEqual({
      success: true,
      data: expect.objectContaining({ version: '1.2.3', database: 'disconnected', status: 'degraded' }),
    });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('returns the error envelope for unknown routes', async () => {
    const response = await request(app).get('/api/nope').expect(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /api/nope not found' },
    });
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"oops":')
      .expect(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('fails closed: protected routes reject callers when no auth strategy is configured', async () => {
    const response = await request(app).get('/api/websites').expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('answers 503 (retryable) instead of hanging when the database is unreachable', async () => {
    const devApp = createApp({
      config: { corsOrigins: [], version: 'test' },
      logger: silentLogger,
      authStrategy: createDevelopmentAuthStrategy('dev-user'),
    });
    const response = await request(devApp).get('/api/websites').expect(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('propagates a safe incoming request id', async () => {
    const response = await request(app).get('/api/health').set('x-request-id', 'abc-123');
    expect(response.headers['x-request-id']).toBe('abc-123');
  });

  describe('CORS', () => {
    it('allows extension origins via the scheme wildcard', async () => {
      const response = await request(app).get('/api/health').set('Origin', 'chrome-extension://abcdef');
      expect(response.headers['access-control-allow-origin']).toBe('chrome-extension://abcdef');
    });

    it('allows exact origins and blocks everything else', async () => {
      const allowed = await request(app).get('/api/health').set('Origin', 'https://dashboard.example.com');
      expect(allowed.headers['access-control-allow-origin']).toBe('https://dashboard.example.com');
      const blocked = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
      expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('loadConfig', () => {
  const base = { MONGODB_URI: 'mongodb://127.0.0.1:27017/stilltime' };

  it('applies defaults and parses the CORS list', () => {
    const config = loadConfig({ ...base, CORS_ORIGINS: 'chrome-extension://*, https://a.example ' });
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 4000,
      host: '127.0.0.1',
      auth: { mode: 'none' },
      corsOrigins: ['chrome-extension://*', 'https://a.example'],
    });
  });

  it('enables the development user only when explicitly configured', () => {
    expect(loadConfig({ ...base, AUTH_MODE: 'development', DEV_USER_ID: 'dev-1' }).auth).toEqual({
      mode: 'development',
      devUserId: 'dev-1',
    });
    expect(() => loadConfig({ ...base, AUTH_MODE: 'development' })).toThrow(ConfigError);
  });

  it('refuses the development user in production', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', AUTH_MODE: 'development', DEV_USER_ID: 'dev-1' }),
    ).toThrow(/refused when NODE_ENV=production/);
  });

  it('rejects invalid values', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ MONGODB_URI: 'postgres://x' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, PORT: 'eighty' })).toThrow(ConfigError);
  });
});
