import { AppWindow, CircleAlert, Info, RotateCw, SearchX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/Header';
import { SelectionFooter } from '@/components/SelectionFooter';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { WebsiteSearch } from '@/components/WebsiteSearch';
import { WebsiteSelectionItem } from '@/components/WebsiteSelectionItem';
import { useTrackedWebsites } from '@/hooks/useChromeStorage';
import { useOpenTabs } from '@/hooks/useOpenTabs';
import { describeError, sendRuntimeRequest } from '@/services/messaging';
import {
  filterCandidates,
  groupTabsIntoWebsites,
  pruneSelection,
  retainSelectedCandidates,
  selectAllVisible,
  toggleCandidate,
  type Selection,
} from '@/services/website-grouping';
import type { AddWebsitesResult } from '@/types';
import { pluralize } from '@/utils/format';

function ListSkeleton() {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface" aria-label="Loading open tabs">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-4 rounded-[5px]" />
          <Skeleton className="size-7 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="h-2.5 w-8" />
        </div>
      ))}
    </div>
  );
}

export function AddWebsite({ onBack, onAdded }: { onBack: () => void; onAdded: (result: AddWebsitesResult) => void }) {
  const { tabs, status, error, refresh } = useOpenTabs();
  const { registry, loading: registryLoading } = useTrackedWebsites();
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection>(() => new Map());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const grouping = useMemo(() => groupTabsIntoWebsites(tabs, registry), [tabs, registry]);
  const candidates = useMemo(() => retainSelectedCandidates(grouping.candidates, selection), [grouping.candidates, selection]);
  const visible = useMemo(() => filterCandidates(candidates, query), [candidates, query]);

  // A website can become tracked while this screen is open (e.g. from another window).
  useEffect(() => setSelection((current) => pruneSelection(current, registry)), [registry]);

  const selectableVisible = visible.filter((candidate) => !candidate.alreadyAdded);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((c) => selection.has(c.domain));
  const everythingTracked = grouping.candidates.length > 0 && grouping.candidates.every((c) => c.alreadyAdded);

  const submit = async (): Promise<void> => {
    if (selection.size === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await sendRuntimeRequest({
        type: 'websites/add',
        websites: [...selection.values()].map(({ domain, displayName, faviconUrl }) => ({ domain, displayName, faviconUrl })),
      });
      if (result.added.length === 0) {
        setSubmitError('Those websites are already being tracked.');
        setSubmitting(false);
        return;
      }
      onAdded(result);
    } catch (submitFailure) {
      // Nothing was saved: keep the selection so the user can retry.
      setSubmitError(describeError(submitFailure));
      setSubmitting(false);
    }
  };

  const renderList = () => {
    if (status === 'loading' || registryLoading) return <ListSkeleton />;
    if (status === 'error') {
      return (
        <EmptyState
          icon={<CircleAlert />}
          title="Couldn’t read your open tabs"
          description={error ?? undefined}
          action={
            <Button size="sm" leadingIcon={<RotateCw />} onClick={refresh}>
              Try again
            </Button>
          }
        />
      );
    }
    if (candidates.length === 0) {
      return (
        <EmptyState
          icon={<AppWindow />}
          title="No websites are open"
          description="Open a website you’d like to track in a Chrome tab, then come back. Browser pages like Settings or New Tab can’t be tracked."
        />
      );
    }
    if (visible.length === 0) {
      return (
        <EmptyState
          icon={<SearchX />}
          title="No matching websites"
          description={`None of your open websites match “${query.trim()}”.`}
          action={
            <Button size="sm" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      );
    }
    return (
      <>
        {everythingTracked && (
          <p className="mb-2 flex items-center gap-2 rounded-lg bg-surface-muted px-3 py-2 text-xs text-fg-muted">
            <Info className="size-3.5 shrink-0" aria-hidden />
            Every website you have open is already tracked.
          </p>
        )}
        <ul
          aria-label="Open websites"
          className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
        >
          {visible.map((candidate) => (
            <WebsiteSelectionItem
              key={candidate.domain}
              candidate={candidate}
              selected={selection.has(candidate.domain)}
              onToggle={(target) => setSelection((current) => toggleCandidate(current, target))}
            />
          ))}
        </ul>
      </>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Add websites" subtitle="Only the websites you select will be tracked." onBack={onBack} />

      <div className="shrink-0 space-y-2 px-4 pt-3 pb-2">
        <WebsiteSearch value={query} onChange={setQuery} autoFocus />
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-2xs text-fg-subtle">
            {status === 'ready'
              ? `${pluralize(grouping.totalTabs, 'open tab')} · ${pluralize(grouping.candidates.length, 'website')}`
              : 'Reading open tabs…'}
          </p>
          <div className="-mr-1.5 flex shrink-0 items-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={selectableVisible.length === 0 || allVisibleSelected}
              onClick={() => setSelection((current) => selectAllVisible(current, visible))}
            >
              Select all
            </Button>
            <Button size="sm" variant="ghost" disabled={selection.size === 0} onClick={() => setSelection(new Map())}>
              Clear
            </Button>
          </div>
        </div>
      </div>

      {submitError && (
        <div role="alert" className="mx-4 mb-2 flex animate-fade-in items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium">Nothing was added.</span> {submitError}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">{renderList()}</div>

      <SelectionFooter selectedCount={selection.size} submitting={submitting} onSubmit={() => void submit()} />
    </div>
  );
}
