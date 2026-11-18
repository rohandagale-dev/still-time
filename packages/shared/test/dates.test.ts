import { describe, expect, it } from 'vitest';

import {
  addDaysToDateKey,
  dateKeyRange,
  diffDateKeys,
  isValidDateKey,
  isValidTimeZone,
  startOfLocalDay,
  startOfNextLocalDay,
  toDateKeyInTimeZone,
  toLocalDateKey,
} from '../src/utils/dates.js';

describe('date keys', () => {
  it('formats local dates', () => {
    expect(toLocalDateKey(new Date(2026, 10, 16, 23, 59))).toBe('2026-11-16');
    expect(toLocalDateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
  });

  it('formats dates in a specific time zone', () => {
    const instant = Date.UTC(2026, 10, 16, 20, 0); // 20:00 UTC
    expect(toDateKeyInTimeZone(instant, 'UTC')).toBe('2026-11-16');
    expect(toDateKeyInTimeZone(instant, 'Asia/Kolkata')).toBe('2026-11-17'); // 01:30 next day
    expect(toDateKeyInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-11-16');
  });

  it('validates real calendar days', () => {
    expect(isValidDateKey('2026-11-16')).toBe(true);
    expect(isValidDateKey('2028-02-29')).toBe(true);
    expect(isValidDateKey('2026-02-29')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2026-1-1')).toBe(false);
    expect(isValidDateKey(20261116)).toBe(false);
  });

  it('does calendar arithmetic across month and year boundaries', () => {
    expect(addDaysToDateKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysToDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(diffDateKeys('2026-11-10', '2026-11-16')).toBe(6);
    expect(dateKeyRange('2026-11-14', '2026-11-16')).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(dateKeyRange('2026-11-16', '2026-11-14')).toEqual([]);
  });

  it('finds local day boundaries', () => {
    const noon = new Date(2026, 10, 16, 12, 30).getTime();
    expect(startOfLocalDay(noon)).toBe(new Date(2026, 10, 16).getTime());
    expect(startOfNextLocalDay(noon)).toBe(new Date(2026, 10, 17).getTime());
  });

  it('validates IANA time zones', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
