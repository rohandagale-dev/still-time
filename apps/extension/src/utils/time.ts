import { startOfNextLocalDay, toLocalDateKey } from '@stilltime/shared';

export interface DaySegment {
  /** Local calendar day (YYYY-MM-DD). */
  date: string;
  start: number;
  end: number;
}

/**
 * Splits the interval [start, end) at local midnights, so every piece belongs to exactly one
 * calendar day. Uses local Date arithmetic, which keeps DST transitions correct.
 */
export function splitByLocalDay(start: number, end: number): DaySegment[] {
  const segments: DaySegment[] = [];
  let cursor = start;
  while (cursor < end) {
    const boundary = Math.min(end, startOfNextLocalDay(cursor));
    segments.push({ date: toLocalDateKey(cursor), start: cursor, end: boundary });
    cursor = boundary;
  }
  return segments;
}

/** Whole seconds between two timestamps (never negative). */
export function secondsBetween(start: number, end: number): number {
  return Math.max(0, Math.round((end - start) / 1000));
}
