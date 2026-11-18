import type { SessionsSyncResponse, WebsiteSessionDto } from '@stilltime/shared';
import mongoose, { type Types } from 'mongoose';

import { TrackedWebsiteModel } from '../models/tracked-website.model.js';
import { WebsiteSessionModel, type WebsiteSession } from '../models/website-session.model.js';
import { AppError } from '../utils/errors.js';
import { describeFirstIssue, parseInput } from '../utils/validation.js';
import { sessionItemSchema, type SessionItem } from '../validators/session.validators.js';

import { recomputeDailyUsage } from './daily-usage.service.js';
import { toSessionDto } from './mappers.js';

const idOf = (raw: unknown): string => {
  const id = (raw as { id?: unknown } | null)?.id;
  return typeof id === 'string' ? id.slice(0, 100) : '';
};

async function websiteIdsByDomain(userId: string, domains: readonly string[]): Promise<Map<string, Types.ObjectId>> {
  const websites = await TrackedWebsiteModel.find({ userId, domain: { $in: [...new Set(domains)] } }, { domain: 1 }).lean();
  return new Map(websites.map((website) => [website.domain, website._id]));
}

/**
 * Stores sessions idempotently. Each session is inserted only if (userId, clientSessionId) is
 * new — `$setOnInsert` with upsert never modifies an existing session — so retries and
 * duplicate uploads are harmless. Returns which sessions were new and which already existed.
 */
async function insertSessions(
  userId: string,
  sessions: readonly SessionItem[],
  clientId: string | null,
): Promise<{ inserted: SessionItem[]; existing: SessionItem[] }> {
  if (sessions.length === 0) return { inserted: [], existing: [] };
  const websiteIds = await websiteIdsByDomain(userId, sessions.map((session) => session.domain));

  const operations = sessions.map((session) => {
    const document: Omit<WebsiteSession, 'createdAt' | 'updatedAt'> = {
      userId,
      clientSessionId: session.id,
      clientId,
      websiteId: websiteIds.get(session.domain) ?? null,
      domain: session.domain,
      websiteName: session.websiteName,
      startedAt: new Date(session.startedAt),
      endedAt: new Date(session.endedAt),
      durationSeconds: session.durationSeconds,
      date: session.date,
      status: session.status,
    };
    return {
      updateOne: {
        filter: { userId, clientSessionId: session.id },
        update: { $setOnInsert: document },
        upsert: true,
      },
    };
  });

  let upsertedIndexes: Set<number>;
  try {
    const result = await WebsiteSessionModel.bulkWrite(operations, { ordered: false, timestamps: true });
    upsertedIndexes = new Set(Object.keys(result.upsertedIds).map(Number));
  } catch (error) {
    // Two uploads of the same session racing each other: the loser hits the unique index.
    // Those sessions exist, so they are reported as already stored; anything else is a real error.
    if (!(error instanceof mongoose.mongo.MongoBulkWriteError)) throw error;
    const writeErrors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
    if (writeErrors.some((writeError) => writeError.code !== 11000)) throw error;
    upsertedIndexes = new Set(Object.keys(error.result.upsertedIds).map(Number));
  }

  const inserted: SessionItem[] = [];
  const existing: SessionItem[] = [];
  sessions.forEach((session, index) => (upsertedIndexes.has(index) ? inserted : existing).push(session));
  return { inserted, existing };
}

/** Batch upload from an offline-first client. Items are validated individually. */
export async function syncSessions(
  userId: string,
  items: readonly unknown[],
  clientId: string | null = null,
): Promise<SessionsSyncResponse> {
  const rejected: SessionsSyncResponse['rejected'] = [];
  const duplicates: string[] = [];
  const valid: SessionItem[] = [];
  const seen = new Set<string>();

  for (const raw of items) {
    const parsed = sessionItemSchema.safeParse(raw);
    if (!parsed.success) {
      rejected.push({ id: idOf(raw), reason: describeFirstIssue(parsed.error) });
    } else if (seen.has(parsed.data.id)) {
      duplicates.push(parsed.data.id);
    } else {
      seen.add(parsed.data.id);
      valid.push(parsed.data);
    }
  }

  const { inserted, existing } = await insertSessions(userId, valid, clientId);
  await recomputeDailyUsage(userId, inserted.map((session) => session.date));

  return {
    accepted: inserted.map((session) => session.id),
    duplicates: [...existing.map((session) => session.id), ...duplicates],
    rejected,
  };
}

/** Stores one session (idempotent). `created` is false when it already existed. */
export async function createSession(
  userId: string,
  body: unknown,
  clientId: string | null = null,
): Promise<{ session: WebsiteSessionDto; created: boolean }> {
  const item = parseInput(sessionItemSchema, body);
  const { inserted } = await insertSessions(userId, [item], clientId);
  if (inserted.length > 0) await recomputeDailyUsage(userId, [item.date]);
  const stored = await WebsiteSessionModel.findOne({ userId, clientSessionId: item.id }).lean();
  if (!stored) throw AppError.serviceUnavailable('The session could not be stored');
  return { session: toSessionDto(stored), created: inserted.length > 0 };
}

export interface ListSessionsFilter {
  from?: string | undefined;
  to?: string | undefined;
  domain?: string | undefined;
  limit: number;
  before?: string | undefined;
}

/** Most recent first, paginated by start time (`nextBefore` is the cursor for the next page). */
export async function listSessions(
  userId: string,
  filter: ListSessionsFilter,
): Promise<{ sessions: WebsiteSessionDto[]; nextBefore: string | null }> {
  const date = {
    ...(filter.from ? { $gte: filter.from } : {}),
    ...(filter.to ? { $lte: filter.to } : {}),
  };
  const sessions = await WebsiteSessionModel.find({
    userId,
    ...(Object.keys(date).length > 0 ? { date } : {}),
    ...(filter.domain ? { domain: filter.domain } : {}),
    ...(filter.before ? { startedAt: { $lt: new Date(filter.before) } } : {}),
  })
    .sort({ startedAt: -1 })
    .limit(filter.limit + 1)
    .lean();

  const page = sessions.slice(0, filter.limit);
  const last = page.at(-1);
  return {
    sessions: page.map(toSessionDto),
    nextBefore: sessions.length > filter.limit && last ? last.startedAt.toISOString() : null,
  };
}

export async function listSessionsForDay(userId: string, date: string): Promise<WebsiteSessionDto[]> {
  const sessions = await WebsiteSessionModel.find({ userId, date }).sort({ startedAt: 1 }).lean();
  return sessions.map(toSessionDto);
}
