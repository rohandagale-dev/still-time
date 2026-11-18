import { describe, expect, it } from 'vitest';

import {
  filterCandidates,
  groupTabsIntoWebsites,
  pruneSelection,
  retainSelectedCandidates,
  selectAllVisible,
  toggleCandidate,
  type Selection,
} from '@/services/website-grouping';
import type { OpenTab, TrackedWebsite, WebsiteCandidate, WebsiteRegistry } from '@/types';

let nextId = 1;
const tab = (url: string, extra: Partial<OpenTab> = {}): OpenTab => ({
  id: nextId++,
  windowId: 1,
  title: '',
  url,
  faviconUrl: null,
  ...extra,
});

const tracked = (domain: string, overrides: Partial<TrackedWebsite> = {}): TrackedWebsite => ({
  domain,
  displayName: domain,
  faviconUrl: null,
  isEnabled: true,
  createdAt: 1,
  updatedAt: 1,
  deletedAt: null,
  syncedAt: null,
  ...overrides,
});

const domains = (candidates: readonly WebsiteCandidate[]): string[] => candidates.map((candidate) => candidate.domain);

describe('groupTabsIntoWebsites', () => {
  it('groups the tabs of one website and counts them (spec example)', () => {
    const { candidates } = groupTabsIntoWebsites(
      [
        tab('https://www.youtube.com/watch?v=123'),
        tab('https://youtube.com/shorts/456'),
        tab('https://m.youtube.com/results'),
        tab('https://www.instagram.com/reels'),
        tab('https://github.com/dashboard'),
      ],
      {},
    );
    expect(candidates.map(({ displayName, tabCount }) => [displayName, tabCount])).toEqual([
      ['YouTube', 3],
      ['GitHub', 1],
      ['Instagram', 1],
    ]);
  });

  it('filters browser-internal and unsupported URLs', () => {
    const grouping = groupTabsIntoWebsites(
      [
        tab('chrome://extensions'),
        tab('chrome-extension://abc/index.html'),
        tab('edge://settings'),
        tab('about:blank'),
        tab('javascript:void(0)'),
        tab('data:text/html,hi'),
        tab('file:///tmp/a.html'),
        tab('not a url'),
        tab('https://example.co.uk/page'),
      ],
      {},
    );
    expect(domains(grouping.candidates)).toEqual(['example.co.uk']);
    expect(grouping.totalTabs).toBe(9);
    expect(grouping.websiteTabs).toBe(1);
  });

  it('keeps distinct services of a multi-service domain separate', () => {
    const { candidates } = groupTabsIntoWebsites(
      [tab('https://mail.google.com/mail/u/0'), tab('https://docs.google.com/d/1'), tab('https://www.google.com/search?q=a')],
      {},
    );
    expect(domains(candidates).sort()).toEqual(['docs.google.com', 'google.com', 'mail.google.com']);
  });

  it('marks websites that are already tracked, but not removed (tombstoned) ones', () => {
    const registry: WebsiteRegistry = {
      'youtube.com': tracked('youtube.com'),
      'reddit.com': tracked('reddit.com', { deletedAt: 5 }),
    };
    const { candidates } = groupTabsIntoWebsites([tab('https://youtube.com/'), tab('https://reddit.com/r/all')], registry);
    expect(candidates.find((c) => c.domain === 'youtube.com')?.alreadyAdded).toBe(true);
    expect(candidates.find((c) => c.domain === 'reddit.com')?.alreadyAdded).toBe(false);
    // Selectable websites are listed first.
    expect(domains(candidates)).toEqual(['reddit.com', 'youtube.com']);
  });

  it('prefers an https favicon and survives tabs without title, favicon or URL details', () => {
    const { candidates } = groupTabsIntoWebsites(
      [
        tab('https://github.com/a', { title: '', faviconUrl: null }),
        tab('https://github.com/b', { faviconUrl: 'chrome://favicon/x' }),
        tab('https://github.com/c', { faviconUrl: 'https://github.githubassets.com/favicon.svg' }),
      ],
      {},
    );
    expect(candidates).toEqual([
      {
        domain: 'github.com',
        displayName: 'GitHub',
        faviconUrl: 'https://github.githubassets.com/favicon.svg',
        tabCount: 3,
        alreadyAdded: false,
      },
    ]);
  });

  it('returns an empty grouping for no tabs', () => {
    expect(groupTabsIntoWebsites([], {})).toEqual({ candidates: [], totalTabs: 0, websiteTabs: 0 });
  });
});

describe('filterCandidates', () => {
  const { candidates } = groupTabsIntoWebsites(
    [tab('https://www.youtube.com/'), tab('https://github.com/'), tab('https://news.ycombinator.com/')],
    {},
  );

  it('matches names and domains case-insensitively', () => {
    expect(domains(filterCandidates(candidates, 'YOU'))).toEqual(['youtube.com']);
    expect(domains(filterCandidates(candidates, 'hacker'))).toEqual(['news.ycombinator.com']);
    expect(domains(filterCandidates(candidates, 'ycombinator'))).toEqual(['news.ycombinator.com']);
  });

  it('tolerates pasted URLs and whitespace', () => {
    expect(domains(filterCandidates(candidates, '  https://www.github.com/settings '))).toEqual(['github.com']);
  });

  it('returns everything for an empty query and nothing for a miss', () => {
    expect(filterCandidates(candidates, '   ')).toHaveLength(3);
    expect(filterCandidates(candidates, 'netflix')).toEqual([]);
  });
});

describe('selection', () => {
  const youtube: WebsiteCandidate = { domain: 'youtube.com', displayName: 'YouTube', faviconUrl: null, tabCount: 2, alreadyAdded: false };
  const github: WebsiteCandidate = { domain: 'github.com', displayName: 'GitHub', faviconUrl: null, tabCount: 1, alreadyAdded: false };
  const reddit: WebsiteCandidate = { domain: 'reddit.com', displayName: 'Reddit', faviconUrl: null, tabCount: 1, alreadyAdded: true };
  const empty: Selection = new Map();

  it('toggles websites but never selects an already-tracked one', () => {
    let selection = toggleCandidate(empty, youtube);
    expect([...selection.keys()]).toEqual(['youtube.com']);
    selection = toggleCandidate(selection, reddit);
    expect([...selection.keys()]).toEqual(['youtube.com']);
    selection = toggleCandidate(selection, youtube);
    expect(selection.size).toBe(0);
  });

  it('"Select all" adds only visible, selectable websites', () => {
    const selection = selectAllVisible(empty, [youtube, reddit]);
    expect([...selection.keys()]).toEqual(['youtube.com']);
    expect([...selectAllVisible(selection, [github]).keys()]).toEqual(['youtube.com', 'github.com']);
  });

  it('keeps a selected website listed after its tabs close', () => {
    const selection = toggleCandidate(empty, youtube);
    const list = retainSelectedCandidates([github], selection);
    expect(list.map(({ domain, tabCount }) => [domain, tabCount])).toEqual([
      ['github.com', 1],
      ['youtube.com', 0],
    ]);
    // Still open → the live entry wins, no duplicate.
    expect(retainSelectedCandidates([youtube, github], selection)).toHaveLength(2);
  });

  it('drops selections that became tracked elsewhere, preserving identity when unchanged', () => {
    const selection = selectAllVisible(empty, [youtube, github]);
    expect(pruneSelection(selection, {})).toBe(selection);
    const pruned = pruneSelection(selection, { 'github.com': tracked('github.com') });
    expect([...pruned.keys()]).toEqual(['youtube.com']);
  });
});
