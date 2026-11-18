export interface DurationPart {
  value: string;
  unit: 'h' | 'm' | 's';
}

/**
 * Splits a duration into display parts: 8040s → [2h, 14m], 300s → [5m], 42s → [42s], 0 → [0m].
 * Seconds are only shown below one minute; hours drop a zero-minute part (2h, not 2h 0m).
 */
export function durationParts(totalSeconds: number): DurationPart[] {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  if (seconds === 0) return [{ value: '0', unit: 'm' }];
  if (seconds < 60) return [{ value: String(seconds), unit: 's' }];
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return [{ value: String(minutes), unit: 'm' }];
  return minutes === 0
    ? [{ value: String(hours), unit: 'h' }]
    : [
        { value: String(hours), unit: 'h' },
        { value: String(minutes), unit: 'm' },
      ];
}

/** Compact duration: "2h 14m", "5m", "42s", "0m". */
export function formatDuration(totalSeconds: number): string {
  return durationParts(totalSeconds)
    .map((part) => `${part.value}${part.unit}`)
    .join(' ');
}

/** Spoken-friendly duration for accessible labels: "2 hours 14 minutes". */
export function formatDurationLong(totalSeconds: number): string {
  const names = { h: ['hour', 'hours'], m: ['minute', 'minutes'], s: ['second', 'seconds'] } as const;
  return durationParts(totalSeconds)
    .map((part) => `${part.value} ${names[part.unit][part.value === '1' ? 0 : 1]}`)
    .join(' ');
}

/** Stopwatch format for a running session: "4:07", "1:02:09". */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(rest).padStart(2, '0')}`;
}

/** "just now", "3 min ago", "2 h ago", "yesterday", "4 days ago". */
export function formatRelativeTime(timestamp: number, now: number): string {
  const diffSeconds = Math.round((now - timestamp) / 1000);
  if (diffSeconds < 45) return 'just now';
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

const dateKeyToLocalDate = (key: string): Date => {
  const [year = 1970, month = 1, day = 1] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/** "Mon" for a date key. */
export function formatWeekdayShort(dateKey: string): string {
  return weekdayShort.format(dateKeyToLocalDate(dateKey));
}

/** "Monday, Nov 16" for a date key. */
export function formatDayLong(dateKey: string): string {
  return weekdayLong.format(dateKeyToLocalDate(dateKey));
}
