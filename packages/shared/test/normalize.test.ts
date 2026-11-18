import { describe, expect, it } from 'vitest';

import {
  isCanonicalDomain,
  isTrackableUrl,
  normalizeDomainInput,
  normalizeHostname,
  normalizeUrl,
} from '../src/domain/normalize.js';

const key = (url: string): string | null => normalizeUrl(url)?.domain ?? null;

describe('normalizeUrl — website identity', () => {
  it.each([
    ['https://www.youtube.com/watch?v=123', 'youtube.com'],
    ['https://m.youtube.com/shorts/456', 'youtube.com'],
    ['https://youtube.com/results?search_query=x', 'youtube.com'],
    ['https://music.youtube.com/', 'youtube.com'],
    ['https://www.instagram.com/reels/', 'instagram.com'],
    ['https://github.com/dashboard', 'github.com'],
    ['https://old.reddit.com/r/all', 'reddit.com'],
    ['https://en.m.wikipedia.org/wiki/Time', 'wikipedia.org'],
    ['https://WWW.NETFLIX.COM/browse', 'netflix.com'],
    ['https://www2.example.com/', 'example.com'],
  ])('groups mirrors and sections of one site: %s → %s', (url, expected) => {
    expect(key(url)).toBe(expected);
  });

  it.each([
    ['https://example.co.uk/page', 'example.co.uk'],
    ['https://www.bbc.co.uk/news', 'bbc.co.uk'],
    ['https://shop.example.com.au/', 'example.com.au'],
    ['https://www.amazon.co.jp/', 'amazon.co.jp'],
  ])('respects multi-label public suffixes: %s → %s', (url, expected) => {
    expect(key(url)).toBe(expected);
  });

  it.each([
    ['https://mail.google.com/mail/u/0/#inbox', 'mail.google.com'],
    ['https://docs.google.com/document/d/abc', 'docs.google.com'],
    ['https://www.google.com/search?q=x', 'google.com'],
    ['https://google.com/', 'google.com'],
    ['https://m.google.com/', 'google.com'],
    ['https://console.aws.amazon.com/ec2', 'aws.amazon.com'],
    ['https://us-east-1.console.aws.amazon.com/', 'aws.amazon.com'],
    ['https://www.amazon.com/dp/123', 'amazon.com'],
    ['https://news.ycombinator.com/item?id=1', 'news.ycombinator.com'],
    ['https://outlook.live.com/mail/', 'outlook.live.com'],
  ])('keeps distinct products of multi-service domains apart: %s → %s', (url, expected) => {
    expect(key(url)).toBe(expected);
  });

  it('never merges unrelated domains', () => {
    expect(key('https://mail.google.com/')).not.toBe(key('https://docs.google.com/'));
    expect(key('https://mail.google.com/')).not.toBe(key('https://www.google.com/'));
    expect(key('https://alice.github.io/')).toBe('alice.github.io');
    expect(key('https://bob.github.io/')).toBe('bob.github.io');
    expect(key('https://my-app.vercel.app/')).toBe('my-app.vercel.app');
    expect(key('https://example.co.uk/')).not.toBe(key('https://other.co.uk/'));
    expect(key('https://youtube.com/')).not.toBe(key('https://youtu.be/'));
  });

  it('identifies hosts without a registrable domain by hostname', () => {
    expect(normalizeUrl('http://localhost:3000/app')).toEqual({
      domain: 'localhost',
      hostname: 'localhost',
      registrableDomain: null,
      isIp: false,
    });
    expect(normalizeUrl('http://192.168.1.10:8080/')).toMatchObject({ domain: '192.168.1.10', isIp: true });
    expect(normalizeUrl('http://[::1]:5173/')).toMatchObject({ domain: '[::1]', isIp: true });
    expect(key('https://github.io/')).toBe('github.io');
  });

  it('ignores ports, credentials, paths, queries and fragments', () => {
    expect(key('https://user:pass@www.example.com:8443/a/b?c=d#e')).toBe('example.com');
  });

  it('handles fully-qualified hostnames and IDNs', () => {
    expect(key('https://www.youtube.com./watch')).toBe('youtube.com');
    expect(key('https://bücher.de/')).toBe('xn--bcher-kva.de');
  });

  it.each([
    'chrome://extensions',
    'chrome-extension://abcdefghijklmnop/index.html',
    'edge://settings',
    'about:blank',
    'javascript:alert(1)',
    'data:text/html,<p>hi</p>',
    'file:///home/user/file.html',
    'ftp://example.com/',
    'view-source:https://example.com',
    'blob:https://example.com/uuid',
    'not a url',
    '',
  ])('rejects unsupported or invalid URL %j', (url) => {
    expect(normalizeUrl(url)).toBeNull();
    expect(isTrackableUrl(url)).toBe(false);
  });

  it('rejects non-string input without throwing', () => {
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(42)).toBeNull();
    expect(isTrackableUrl(undefined)).toBe(false);
  });
});

describe('normalizeHostname', () => {
  it('rejects malformed hostnames', () => {
    expect(normalizeHostname('a..b')).toBeNull();
    expect(normalizeHostname('-bad-.com')).toBeNull();
    expect(normalizeHostname('')).toBeNull();
    expect(normalizeHostname(`${'a'.repeat(250)}.com`)).toBeNull();
  });

  it('reports the registrable domain alongside the website key', () => {
    expect(normalizeHostname('mail.google.com')).toEqual({
      domain: 'mail.google.com',
      hostname: 'mail.google.com',
      registrableDomain: 'google.com',
      isIp: false,
    });
  });
});

describe('normalizeDomainInput — API / user input', () => {
  it.each([
    ['youtube.com', 'youtube.com'],
    ['  WWW.YouTube.com  ', 'youtube.com'],
    ['https://m.youtube.com/watch?v=1', 'youtube.com'],
    ['mail.google.com', 'mail.google.com'],
    ['example.co.uk', 'example.co.uk'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeDomainInput(input)?.domain).toBe(expected);
  });

  it.each([
    'youtube.com/watch',
    'youtube.com:443',
    'user@youtube.com',
    'you tube.com',
    'mailto:me@example.com',
    'javascript:alert(1)',
    'chrome://settings',
    '',
    '   ',
  ])('rejects %j', (input) => {
    expect(normalizeDomainInput(input)).toBeNull();
  });

  it('isCanonicalDomain accepts only already-normalized keys', () => {
    expect(isCanonicalDomain('youtube.com')).toBe(true);
    expect(isCanonicalDomain('mail.google.com')).toBe(true);
    expect(isCanonicalDomain('www.youtube.com')).toBe(false);
    expect(isCanonicalDomain('YouTube.com')).toBe(false);
    expect(isCanonicalDomain('https://youtube.com')).toBe(false);
    expect(isCanonicalDomain(42)).toBe(false);
  });
});
