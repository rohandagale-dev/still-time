import {
  FINAL_SESSION_STATUSES,
  MAX_SESSIONS_PER_SYNC,
  MAX_SESSION_DURATION_SECONDS,
  MAX_SESSION_ID_LENGTH,
  toDateKeyInTimeZone,
} from '@stilltime/shared';
import { z } from 'zod';

import { dateKeySchema, displayNameSchema, domainSchema, timeZoneSchema } from './common.validators.js';

/** Allowed client clock skew for "not in the future" checks. */
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
/** Tolerance between durationSeconds and endedAt − startedAt (client rounding). */
const DURATION_TOLERANCE_SECONDS = 2;

/**
 * A finished session uploaded by a client. Besides shapes, it is checked for internal
 * consistency so corrupted or forged data cannot skew statistics.
 */
export const sessionItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(MAX_SESSION_ID_LENGTH)
      .regex(/^[A-Za-z0-9:_-]+$/, 'may only contain letters, digits, ":", "_" and "-"'),
    domain: domainSchema,
    websiteName: displayNameSchema,
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    durationSeconds: z.number().int().min(0).max(MAX_SESSION_DURATION_SECONDS),
    date: dateKeySchema,
    status: z.enum(FINAL_SESSION_STATUSES),
  })
  .superRefine((session, ctx) => {
    const start = Date.parse(session.startedAt);
    const end = Date.parse(session.endedAt);
    if (end < start) {
      ctx.addIssue({ code: 'custom', path: ['endedAt'], message: 'must not be before startedAt' });
      return;
    }
    if (end > Date.now() + MAX_CLOCK_SKEW_MS) {
      ctx.addIssue({ code: 'custom', path: ['endedAt'], message: 'must not be in the future' });
    }
    if (Math.abs((end - start) / 1000 - session.durationSeconds) > DURATION_TOLERANCE_SECONDS) {
      ctx.addIssue({ code: 'custom', path: ['durationSeconds'], message: 'does not match endedAt − startedAt' });
    }
    // The client's local day of startedAt lies between its date at UTC−12 and at UTC+14.
    const earliest = toDateKeyInTimeZone(start, 'Etc/GMT+12');
    const latest = toDateKeyInTimeZone(start, 'Etc/GMT-14');
    if (session.date < earliest || session.date > latest) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'does not match startedAt' });
    }
  });

export type SessionItem = z.output<typeof sessionItemSchema>;

export const sessionsSyncSchema = z.object({
  sessions: z.array(z.unknown()).min(1).max(MAX_SESSIONS_PER_SYNC),
});

export const listSessionsQuerySchema = z
  .object({
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
    domain: domainSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    /** Cursor: return sessions that started strictly before this instant. */
    before: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '"from" must not be after "to"',
    path: ['from'],
  });

export const sessionsTodayQuerySchema = z.object({
  date: dateKeySchema.optional(),
  tz: timeZoneSchema.optional(),
});
