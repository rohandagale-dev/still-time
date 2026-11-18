import { parse } from 'tldts';

import { MAX_DOMAIN_LENGTH } from '../constants/index.js';

/**
 * Website identity
 * ================
 * Stilltime tracks *websites*, not URLs. Every URL is reduced to a canonical "domain key":
 *
 * 1. Only http(s) URLs are websites. chrome://, chrome-extension://, edge://, about:,
 *    javascript:, data:, file:, … are never tracked.
 * 2. By default a website is its registrable domain (eTLD+1, from the Public Suffix List), so
 *    mirrors and sections of one site are grouped together:
 *      www.youtube.com, m.youtube.com, music.youtube.com → youtube.com
 *      old.reddit.com                                    → reddit.com
 *      en.m.wikipedia.org                                → wikipedia.org
 *      www.bbc.co.uk                                     → bbc.co.uk   (multi-label suffix)
 * 3. Private PSL suffixes are honoured, so tenants of hosting platforms are never merged:
 *      alice.github.io ≠ bob.github.io,   my-app.vercel.app ≠ other-app.vercel.app
 * 4. A small allow-list of registrable domains host unrelated products on their subdomains.
 *    For those the first-level service subdomain is kept (alias labels such as www/m ignored):
 *      mail.google.com → mail.google.com,   www.google.com → google.com,
 *      console.aws.amazon.com → aws.amazon.com
 * 5. Hosts without a registrable domain (localhost, IP addresses, a bare public suffix) are
 *    identified by their full hostname.
 */
export interface NormalizedDomain {
  /** Canonical website key, e.g. `youtube.com` or `mail.google.com`. */
  domain: string;
  /** Lower-cased hostname of the input, e.g. `m.youtube.com`. */
  hostname: string;
  /** eTLD+1, or `null` for IP addresses, localhost and similar hosts. */
  registrableDomain: string | null;
  isIp: boolean;
}

const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/** Leading labels that only select a variant (desktop/mobile/AMP mirror) of the same service. */
const ALIAS_LABELS: ReadonlySet<string> = new Set(['www', 'm', 'mobile', 'touch', 'amp', 'mbasic']);
const NUMBERED_WWW = /^www\d{1,2}$/;

/**
 * Registrable domains whose subdomains are distinct products or tenants. Keep this list short
 * and conservative: anything not listed is grouped by registrable domain.
 */
export const MULTI_SERVICE_DOMAINS: ReadonlySet<string> = new Set([
  'amazon.com',
  'apple.com',
  'atlassian.net',
  'google.com',
  'live.com',
  'microsoft.com',
  'office.com',
  'proton.me',
  'tumblr.com',
  'wordpress.com',
  'yahoo.com',
  'ycombinator.com',
  'zoho.com',
]);

const isAliasLabel = (label: string): boolean => ALIAS_LABELS.has(label) || NUMBERED_WWW.test(label);

/** Parses `input` as an absolute http(s) URL. Returns `null` for anything else. */
export function parseWebUrl(input: unknown): URL | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  return WEB_PROTOCOLS.has(url.protocol) && url.hostname.length > 0 ? url : null;
}

/**
 * Reduces a hostname to its canonical website key. Returns `null` for invalid hostnames.
 * The input is expected to come from a URL parser (lower-case, punycode for IDNs).
 */
export function normalizeHostname(rawHostname: string): NormalizedDomain | null {
  let hostname = rawHostname.trim().toLowerCase();

  // IPv6 literals keep their brackets (as produced by the URL parser, e.g. "[::1]").
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return { domain: hostname, hostname, registrableDomain: null, isIp: true };
  }

  hostname = hostname.replace(/\.+$/, ''); // "example.com." (fully-qualified form)
  if (hostname.length === 0 || hostname.length > MAX_DOMAIN_LENGTH) return null;

  // Keep tldts' default extraction path: it is also what validates the hostname syntax.
  const parsed = parse(hostname, { allowPrivateDomains: true });
  if (parsed.isIp) {
    return { domain: hostname, hostname, registrableDomain: null, isIp: true };
  }
  if (parsed.hostname === null) return null; // e.g. "a..b", "-bad-.com"

  const registrableDomain = parsed.domain;
  if (!registrableDomain) {
    return { domain: hostname, hostname, registrableDomain: null, isIp: false };
  }

  if (MULTI_SERVICE_DOMAINS.has(registrableDomain) && parsed.subdomain) {
    const serviceLabels = parsed.subdomain
      .split('.')
      .filter((label) => label.length > 0 && !isAliasLabel(label));
    const service = serviceLabels.at(-1);
    if (service) {
      return { domain: `${service}.${registrableDomain}`, hostname, registrableDomain, isIp: false };
    }
  }

  return { domain: registrableDomain, hostname, registrableDomain, isIp: false };
}

/** Normalizes an absolute http(s) URL (e.g. a tab URL). Returns `null` for unsupported URLs. */
export function normalizeUrl(input: unknown): NormalizedDomain | null {
  const url = parseWebUrl(input);
  return url ? normalizeHostname(url.hostname) : null;
}

/** `true` when the URL is an http(s) website that Stilltime can track. */
export function isTrackableUrl(input: unknown): boolean {
  return normalizeUrl(input) !== null;
}

/**
 * Normalizes user/API input that may be either an http(s) URL or a bare host name such as
 * `www.YouTube.com`. Bare input must not contain a scheme, port, path, query or credentials.
 */
export function normalizeDomainInput(input: unknown): NormalizedDomain | null {
  if (typeof input !== 'string') return null;
  const value = input.trim();
  if (value.length === 0 || value.length > 2048) return null;
  if (/^https?:\/\//i.test(value)) return normalizeUrl(value);
  if (/[\s/\\?#@:]/.test(value)) return null;
  return normalizeUrl(`https://${value}`);
}

/** `true` when `value` is already a canonical website key (normalizing it is a no-op). */
export function isCanonicalDomain(value: unknown): value is string {
  return typeof value === 'string' && normalizeDomainInput(value)?.domain === value;
}
