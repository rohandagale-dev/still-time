import { describe, expect, it } from 'vitest';

import { getWebsiteDisplayName } from '../src/domain/display-name.js';

describe('getWebsiteDisplayName', () => {
  it.each([
    ['youtube.com', 'YouTube'],
    ['github.com', 'GitHub'],
    ['x.com', 'X'],
    ['mail.google.com', 'Gmail'],
    ['news.ycombinator.com', 'Hacker News'],
  ])('uses the proper brand name for %s', (domain, expected) => {
    expect(getWebsiteDisplayName(domain)).toBe(expected);
  });

  it.each([
    ['example.co.uk', 'Example'],
    ['my-cool-site.com', 'My Cool Site'],
    ['keep.google.com', 'Google Keep'],
    ['photos.google.com', 'Google Photos'],
  ])('derives a readable name for %s', (domain, expected) => {
    expect(getWebsiteDisplayName(domain)).toBe(expected);
  });

  it.each(['alice.github.io', 'localhost', '127.0.0.1', '[::1]', 'xn--bcher-kva.de', 'github.io'])(
    'falls back to the domain itself for %s',
    (domain) => {
      expect(getWebsiteDisplayName(domain)).toBe(domain);
    },
  );
});
