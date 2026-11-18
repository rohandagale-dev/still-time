import { diffDateKeys } from '@stilltime/shared';
import { z } from 'zod';

import { dateKeySchema, timeZoneSchema } from './common.validators.js';

const MAX_RANGE_DAYS = 366;

export const todayAnalyticsQuerySchema = z.object({
  date: dateKeySchema.optional(),
  tz: timeZoneSchema.optional(),
});

export const weeklyAnalyticsQuerySchema = z.object({
  /** Last day of the seven-day window (defaults to today in `tz`). */
  endDate: dateKeySchema.optional(),
  tz: timeZoneSchema.optional(),
});

export const websitesAnalyticsQuerySchema = z
  .object({
    from: dateKeySchema.optional(),
    to: dateKeySchema.optional(),
    tz: timeZoneSchema.optional(),
  })
  .refine((query) => !query.from || !query.to || diffDateKeys(query.from, query.to) >= 0, {
    message: '"from" must not be after "to"',
    path: ['from'],
  })
  .refine((query) => !query.from || !query.to || diffDateKeys(query.from, query.to) < MAX_RANGE_DAYS, {
    message: `the range may span at most ${MAX_RANGE_DAYS} days`,
    path: ['to'],
  });
