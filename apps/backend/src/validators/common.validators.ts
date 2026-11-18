import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_FAVICON_URL_LENGTH,
  isValidDateKey,
  isValidTimeZone,
  normalizeDomainInput,
} from '@stilltime/shared';
import { z } from 'zod';

/** Accepts a bare host or URL and yields its canonical website key (e.g. "www.YouTube.com" → "youtube.com"). */
export const domainSchema = z
  .string()
  .trim()
  .min(1, 'is required')
  .max(2048)
  .transform((value, ctx) => {
    const normalized = normalizeDomainInput(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'must be a website domain such as youtube.com' });
      return z.NEVER;
    }
    return normalized.domain;
  });

export const displayNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'must not be empty').max(MAX_DISPLAY_NAME_LENGTH));

export const faviconUrlSchema = z
  .string()
  .max(MAX_FAVICON_URL_LENGTH)
  .refine((value) => {
    try {
      const { protocol } = new URL(value);
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  }, 'must be an http(s) URL')
  .nullable();

export const dateKeySchema = z.string().refine(isValidDateKey, 'must be a calendar date (YYYY-MM-DD)');

export const timeZoneSchema = z.string().max(64).refine(isValidTimeZone, 'must be an IANA time zone, e.g. Europe/Paris');

export const objectIdSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a valid id');

export const idParamsSchema = z.object({ id: objectIdSchema });

/** Optional client calendar context: an explicit date, or a time zone to derive "today" from. */
export const dayQuerySchema = z.object({
  date: dateKeySchema.optional(),
  tz: timeZoneSchema.optional(),
});
