import { describe, expect, it } from 'vitest';

import { formatClock, formatDuration, formatDurationLong, formatRelativeTime, pluralize } from '@/utils/format';

describe('formatting', () => {
  it.each([
    [0, '0m'],
    [42, '42s'],
    [60, '1m'],
    [299, '4m'],
    [3600, '1h'],
    [8040, '2h 14m'],
    [-5, '0m'],
    [Number.NaN, '0m'],
  ])('formatDuration(%s) = %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('formats long durations for screen readers', () => {
    expect(formatDurationLong(3660)).toBe('1 hour 1 minute');
    expect(formatDurationLong(8040)).toBe('2 hours 14 minutes');
  });

  it('formats a running clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(247)).toBe('4:07');
    expect(formatClock(3729)).toBe('1:02:09');
  });

  it('formats relative times', () => {
    const now = 1_000_000_000;
    expect(formatRelativeTime(now - 10_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 3 * 60_000, now)).toBe('3 min ago');
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toBe('2 h ago');
    expect(formatRelativeTime(now - 26 * 3_600_000, now)).toBe('yesterday');
  });

  it('pluralizes', () => {
    expect(pluralize(1, 'tab')).toBe('1 tab');
    expect(pluralize(3, 'tab')).toBe('3 tabs');
    expect(pluralize(0, 'website')).toBe('0 websites');
  });
});
