import type { OpenTab, WebsiteCandidate, WebsiteRegistry } from '@/types';

import { displayableFaviconUrl, getWebsiteDisplayName, normalizeUrl } from './domain-normalizer';
import { isTracked } from './storage';

export interface WebsiteGrouping {
  /** One entry per website, sorted: selectable first, then by tab count, then by name. */
  candidates: WebsiteCandidate[];
  /** All open tabs that were inspected. */
  totalTabs: number;
  /** Tabs showing an http(s) website. */
  websiteTabs: number;
}

const httpsFirst = (url: string | null): number => (url?.startsWith('https:') ? 2 : url ? 1 : 0);

export function compareCandidates(a: WebsiteCandidate, b: WebsiteCandidate): number {
  if (a.alreadyAdded !== b.alreadyAdded) return a.alreadyAdded ? 1 : -1;
  if (a.tabCount !== b.tabCount) return b.tabCount - a.tabCount;
  return a.displayName.localeCompare(b.displayName) || a.domain.localeCompare(b.domain);
}

/**
 * Groups open tabs into websites. Unsupported URLs (chrome://, chrome-extension://, about:,
 * data:, file:, …) are skipped; tabs of one website (www./m./subpages) collapse into one entry.
 */
export function groupTabsIntoWebsites(
  tabs: readonly OpenTab[],
  registry: Readonly<WebsiteRegistry>,
): WebsiteGrouping {
  const groups = new Map<string, WebsiteCandidate>();
  let websiteTabs = 0;

  for (const tab of tabs) {
    const normalized = normalizeUrl(tab.url);
    if (!normalized) continue;
    websiteTabs += 1;

    const favicon = displayableFaviconUrl(tab.faviconUrl);
    const existing = groups.get(normalized.domain);
    if (existing) {
      existing.tabCount += 1;
      if (httpsFirst(favicon) > httpsFirst(existing.faviconUrl)) existing.faviconUrl = favicon;
      continue;
    }
    groups.set(normalized.domain, {
      domain: normalized.domain,
      displayName: getWebsiteDisplayName(normalized.domain),
      faviconUrl: favicon,
      tabCount: 1,
      alreadyAdded: isTracked(registry, normalized.domain),
    });
  }

  return { candidates: [...groups.values()].sort(compareCandidates), totalTabs: tabs.length, websiteTabs };
}

/** Case-insensitive match on name or domain; tolerates pasted URLs ("https://www.x.com"). */
export function filterCandidates(candidates: readonly WebsiteCandidate[], query: string): WebsiteCandidate[] {
  const needle = query
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
  if (!needle) return [...candidates];
  return candidates.filter(
    (candidate) => candidate.domain.includes(needle) || candidate.displayName.toLowerCase().includes(needle),
  );
}

/**
 * The selection maps each selected domain to the candidate as it looked when selected. Keeping
 * the snapshot lets a selection survive its tabs being closed while the screen is open.
 */
export type Selection = ReadonlyMap<string, WebsiteCandidate>;

/**
 * Keeps websites the user already selected visible even after all of their tabs were closed,
 * so a selection is never silently lost. Retained entries report `tabCount: 0`.
 */
export function retainSelectedCandidates(candidates: readonly WebsiteCandidate[], selection: Selection): WebsiteCandidate[] {
  const present = new Set(candidates.map((candidate) => candidate.domain));
  const retained = [...selection.values()]
    .filter((snapshot) => !present.has(snapshot.domain))
    .map((snapshot) => ({ ...snapshot, tabCount: 0 }));
  return [...candidates, ...retained].sort(compareCandidates);
}

/** Selects or deselects one website. Already-tracked websites can never be selected. */
export function toggleCandidate(selection: Selection, candidate: WebsiteCandidate): Selection {
  const next = new Map(selection);
  if (next.has(candidate.domain)) next.delete(candidate.domain);
  else if (!candidate.alreadyAdded) next.set(candidate.domain, candidate);
  return next;
}

/** "Select all": adds every visible website that is not already tracked. */
export function selectAllVisible(selection: Selection, visible: readonly WebsiteCandidate[]): Selection {
  const next = new Map(selection);
  for (const candidate of visible) if (!candidate.alreadyAdded) next.set(candidate.domain, candidate);
  return next;
}

/**
 * Drops selected websites that became tracked in the meantime (e.g. added from another window).
 * Returns the same instance when nothing changed, so React can skip a re-render.
 */
export function pruneSelection(selection: Selection, registry: Readonly<WebsiteRegistry>): Selection {
  const kept = [...selection].filter(([domain]) => !isTracked(registry, domain));
  return kept.length === selection.size ? selection : new Map(kept);
}
