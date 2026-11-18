/**
 * Calendar-day helpers. A "date key" is a `YYYY-MM-DD` string naming a calendar day in some
 * time zone. Sessions are attributed to the day (in the user's local time zone) they happened on.
 */

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MS_PER_DAY = 86_400_000;

const pad2 = (value: number): string => String(value).padStart(2, '0');

export function formatDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** Date key of an instant in the runtime's local time zone. */
export function toLocalDateKey(input: Date | number): string {
  const date = new Date(input);
  return formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Date key of an instant in an IANA time zone (e.g. `Asia/Kolkata`). */
export function toDateKeyInTimeZone(input: Date | number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(input));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** `true` for a well-formed date key naming a real calendar day. */
export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** UTC midnight of a date key, used for pure calendar arithmetic (no DST involved). */
function dateKeyToUtcMs(key: string): number {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) throw new RangeError(`Invalid date key: ${key}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Calendar arithmetic on date keys: `addDaysToDateKey('2026-02-28', 1) === '2026-03-01'`. */
export function addDaysToDateKey(key: string, days: number): string {
  const date = new Date(dateKeyToUtcMs(key) + days * MS_PER_DAY);
  return formatDateKey(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function diffDateKeys(fromKey: string, toKey: string): number {
  return Math.round((dateKeyToUtcMs(toKey) - dateKeyToUtcMs(fromKey)) / MS_PER_DAY);
}

/** Inclusive list of date keys from `startKey` to `endKey`, oldest first. */
export function dateKeyRange(startKey: string, endKey: string): string[] {
  const days = diffDateKeys(startKey, endKey);
  if (days < 0) return [];
  return Array.from({ length: days + 1 }, (_, index) => addDaysToDateKey(startKey, index));
}

/** Local midnight at the start of the day containing `ms`. DST-safe. */
export function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Local midnight at the start of the day after the one containing `ms`. DST-safe. */
export function startOfNextLocalDay(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}
