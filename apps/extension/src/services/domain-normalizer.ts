/**
 * Website identity for the extension. The normalization rules live in @stilltime/shared so the
 * extension and the backend always agree on what "the same website" means.
 */
export {
  getWebsiteDisplayName,
  isTrackableUrl,
  normalizeDomainInput,
  normalizeUrl,
  type NormalizedDomain,
} from '@stilltime/shared';

import { MAX_FAVICON_URL_LENGTH } from '@stilltime/shared';

/**
 * Favicons are only persisted as http(s) URLs: never data: URLs (unbounded size) or
 * browser-internal schemes. Returns `null` when the URL is unusable.
 */
export function sanitizeFaviconUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_FAVICON_URL_LENGTH) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Favicons that are fine to *display* (not persist): http(s) plus inline images. */
export function displayableFaviconUrl(value: unknown): string | null {
  if (typeof value === 'string' && /^data:image\/[a-z0-9.+-]+[;,]/i.test(value)) return value;
  return sanitizeFaviconUrl(value);
}
