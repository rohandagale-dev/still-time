import { useEffect, useRef } from 'react';

import type { TrackedWebsite } from '@/types';

import { WebsiteCard } from './WebsiteCard';

export interface WebsiteListProps {
  /** Already in display order. */
  websites: readonly TrackedWebsite[];
  secondsByDomain: ReadonlyMap<string, number>;
  liveDomain: string | null;
  newDomains: ReadonlySet<string>;
  onSetEnabled: (domain: string, enabled: boolean) => Promise<void>;
  onRemove: (domain: string) => Promise<void>;
}

/** The tracked-website registry with today's usage: a meter list, most-used first. */
export function WebsiteList({ websites, secondsByDomain, liveDomain, newDomains, onSetEnabled, onRemove }: WebsiteListProps) {
  const maxSeconds = websites.reduce((max, website) => Math.max(max, secondsByDomain.get(website.domain) ?? 0), 0);
  const sectionRef = useRef<HTMLElement>(null);
  const hasNew = newDomains.size > 0;

  // Just added websites: bring the list into view so the user sees them arrive.
  useEffect(() => {
    if (hasNew) sectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [hasNew]);

  return (
    <section ref={sectionRef} aria-labelledby="tracked-websites-heading" className="scroll-mt-3">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h2 id="tracked-websites-heading" className="text-xs font-medium text-fg-muted">
          Tracked websites <span className="text-fg-subtle">· {websites.length}</span>
        </h2>
        <span className="text-2xs text-fg-subtle">Today</span>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
        {websites.map((website) => (
          <WebsiteCard
            key={website.domain}
            website={website}
            seconds={secondsByDomain.get(website.domain) ?? 0}
            maxSeconds={maxSeconds}
            isLive={liveDomain === website.domain}
            isNew={newDomains.has(website.domain)}
            onSetEnabled={onSetEnabled}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  );
}
