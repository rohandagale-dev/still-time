import { getWebsiteDisplayName, normalizeDomainInput, sanitizeFaviconUrl } from '@/services/domain-normalizer';
import { clampIdleThreshold, sanitizeApiBaseUrl, sanitizeDisplayName } from '@/services/storage';
import type { AddWebsiteInput, AddWebsitesResult, Settings, ThemePreference, TrackedWebsite, WebsiteRegistry } from '@/types';

import { RequestError } from './errors';

/**
 * Pure registry operations. They never mutate their input and return the next registry, so the
 * caller can persist it atomically and nothing changes if persistence fails.
 *
 * `updatedAt` is strictly increasing per website, even if the system clock moves backwards:
 * last-write-wins sync relies on it to order changes.
 */
const nextVersion = (now: number, previous: number | undefined): number =>
  previous === undefined ? now : Math.max(now, previous + 1);

export const MAX_WEBSITES_PER_REQUEST = 500;

export function addWebsites(
  registry: Readonly<WebsiteRegistry>,
  inputs: readonly AddWebsiteInput[],
  now: number,
): AddWebsitesResult & { registry: WebsiteRegistry } {
  const next: WebsiteRegistry = { ...registry };
  const added: TrackedWebsite[] = [];
  const skipped: AddWebsitesResult['skipped'] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    // Normalize again here: the worker never trusts the caller to have done it.
    const normalized = normalizeDomainInput(input.domain);
    if (!normalized) {
      skipped.push({ domain: String(input.domain), reason: 'invalid' });
      continue;
    }
    const { domain } = normalized;
    if (seen.has(domain)) {
      skipped.push({ domain, reason: 'duplicate' });
      continue;
    }
    seen.add(domain);

    const existing = next[domain];
    if (existing && existing.deletedAt === null) {
      skipped.push({ domain, reason: 'already-added' });
      continue;
    }

    // A tombstoned website is revived: it keeps its sync bookkeeping so the server sees an update.
    const version = nextVersion(now, existing?.updatedAt);
    const website: TrackedWebsite = {
      domain,
      displayName: sanitizeDisplayName(input.displayName, getWebsiteDisplayName(domain)),
      faviconUrl: sanitizeFaviconUrl(input.faviconUrl),
      isEnabled: true,
      createdAt: version,
      updatedAt: version,
      deletedAt: null,
      syncedAt: existing?.syncedAt ?? null,
    };
    next[domain] = website;
    added.push(website);
  }

  return { registry: next, added, skipped };
}

/**
 * Removes a website. A tombstone is kept until the server acknowledges the removal, so the
 * deletion is synchronized even if it happens offline. Tracked history is not touched.
 */
export function removeWebsite(
  registry: Readonly<WebsiteRegistry>,
  domain: string,
  now: number,
): { registry: WebsiteRegistry; removed: boolean } {
  const existing = registry[domain];
  if (!existing || existing.deletedAt !== null) return { registry: { ...registry }, removed: false };
  const version = nextVersion(now, existing.updatedAt);
  return {
    registry: { ...registry, [domain]: { ...existing, deletedAt: version, updatedAt: version } },
    removed: true,
  };
}

export function setWebsiteEnabled(
  registry: Readonly<WebsiteRegistry>,
  domain: string,
  enabled: boolean,
  now: number,
): { registry: WebsiteRegistry; website: TrackedWebsite; changed: boolean } {
  const existing = registry[domain];
  if (!existing || existing.deletedAt !== null) {
    throw new RequestError('not-found', 'This website is no longer in your tracking list.');
  }
  if (existing.isEnabled === enabled) return { registry: { ...registry }, website: existing, changed: false };
  const website: TrackedWebsite = { ...existing, isEnabled: enabled, updatedAt: nextVersion(now, existing.updatedAt) };
  return { registry: { ...registry, [domain]: website }, website, changed: true };
}

/**
 * Removes acknowledged tombstones and records which versions the server now holds.
 * `acknowledged` maps a domain to the `updatedAt` version the server accepted; an entry that was
 * changed again in the meantime keeps its newer, still-unsynced version.
 */
export function markWebsitesSynced(
  registry: Readonly<WebsiteRegistry>,
  acknowledged: ReadonlyMap<string, number>,
): WebsiteRegistry {
  const next: WebsiteRegistry = { ...registry };
  for (const [domain, version] of acknowledged) {
    const website = next[domain];
    if (!website || website.updatedAt !== version) continue;
    if (website.deletedAt !== null) delete next[domain];
    else next[domain] = { ...website, syncedAt: version };
  }
  return next;
}

const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Applies a validated partial update. Unknown keys are ignored; invalid values are rejected. */
export function mergeSettings(current: Settings, patch: unknown): Settings {
  if (!isRecord(patch)) throw new RequestError('invalid-settings', 'Invalid settings update.');
  const next: Settings = { ...current };

  if ('idleThresholdSeconds' in patch) {
    if (typeof patch['idleThresholdSeconds'] !== 'number' || !Number.isFinite(patch['idleThresholdSeconds'])) {
      throw new RequestError('invalid-settings', 'The idle timeout must be a number of seconds.');
    }
    next.idleThresholdSeconds = clampIdleThreshold(patch['idleThresholdSeconds']);
  }
  if ('countMediaAsActive' in patch) {
    if (typeof patch['countMediaAsActive'] !== 'boolean') throw new RequestError('invalid-settings', 'Invalid media setting.');
    next.countMediaAsActive = patch['countMediaAsActive'];
  }
  if ('theme' in patch) {
    if (!THEMES.includes(patch['theme'] as ThemePreference)) throw new RequestError('invalid-settings', 'Unknown theme.');
    next.theme = patch['theme'] as ThemePreference;
  }
  if ('syncEnabled' in patch) {
    if (typeof patch['syncEnabled'] !== 'boolean') throw new RequestError('invalid-settings', 'Invalid sync setting.');
    next.syncEnabled = patch['syncEnabled'];
  }
  if ('apiBaseUrl' in patch) {
    const url = sanitizeApiBaseUrl(patch['apiBaseUrl']);
    if (!url) throw new RequestError('invalid-settings', 'The server URL must be an http:// or https:// address.');
    next.apiBaseUrl = url;
  }
  return next;
}
