import { randomUUID } from 'node:crypto';

import type { SessionSyncItem, WebsiteSyncItem } from '@stilltime/shared';
import mongoose from 'mongoose';
import { inject } from 'vitest';

import { createApp } from '../src/app.js';
import type { AuthStrategy } from '../src/auth/types.js';
import { ensureIndexes } from '../src/models/index.js';
import { silentLogger } from '../src/utils/logger.js';

/** Test-only strategy: the caller is the user named by `x-test-user` (default "user-a"). */
export const headerAuthStrategy: AuthStrategy = {
  name: 'test',
  authenticate: (req) => ({ userId: req.get('x-test-user') ?? 'user-a', method: 'test' }),
};

export function createTestApp(authStrategy: AuthStrategy = headerAuthStrategy) {
  return createApp({ config: { corsOrigins: [], version: 'test' }, logger: silentLogger, authStrategy });
}

/** Every test file gets its own database on the shared mongod. */
export async function connectTestDatabase(): Promise<void> {
  await mongoose.connect(inject('mongoUri'), { dbName: `stilltime-test-${randomUUID()}` });
  await ensureIndexes();
}

export async function clearDatabase(): Promise<void> {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
}

export async function disconnectTestDatabase(): Promise<void> {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

let sessionCounter = 0;

/** A valid finished session (10 minutes on YouTube on 16 Nov 2026, UTC). */
export function sessionItem(overrides: Partial<SessionSyncItem> = {}): SessionSyncItem {
  sessionCounter += 1;
  return {
    id: `session-${sessionCounter}`,
    domain: 'youtube.com',
    websiteName: 'YouTube',
    startedAt: '2026-11-16T10:00:00.000Z',
    endedAt: '2026-11-16T10:10:00.000Z',
    durationSeconds: 600,
    date: '2026-11-16',
    status: 'completed',
    ...overrides,
  };
}

/** A session of `minutes` minutes starting at `startIso`. */
export function sessionAt(startIso: string, minutes: number, overrides: Partial<SessionSyncItem> = {}): SessionSyncItem {
  const start = Date.parse(startIso);
  return sessionItem({
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + minutes * 60_000).toISOString(),
    durationSeconds: minutes * 60,
    date: startIso.slice(0, 10),
    ...overrides,
  });
}

export function websiteItem(overrides: Partial<WebsiteSyncItem> = {}): WebsiteSyncItem {
  return {
    domain: 'youtube.com',
    displayName: 'YouTube',
    faviconUrl: null,
    isEnabled: true,
    deleted: false,
    updatedAt: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}
