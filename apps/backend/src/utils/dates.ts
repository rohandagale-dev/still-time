import { toDateKeyInTimeZone } from '@stilltime/shared';

/**
 * The client's "today". Clients know their own calendar, so an explicit `date` wins; otherwise
 * today is derived in the given IANA time zone (UTC by default).
 */
export function resolveDay({ date, tz }: { date?: string | undefined; tz?: string | undefined }, now: Date = new Date()): string {
  return date ?? toDateKeyInTimeZone(now, tz ?? 'UTC');
}
