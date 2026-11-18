import { CircleAlert, EyeOff, Globe, Plus, WifiOff } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { AppHeader } from '@/components/Header';
import { LogoMark } from '@/components/Logo';
import { TodaySummary } from '@/components/TodaySummary';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { WebsiteList } from '@/components/WebsiteList';
import { WeeklyChart } from '@/components/WeeklyChart';
import { useSyncStatus, useTrackedWebsites } from '@/hooks/useChromeStorage';
import { useNow } from '@/hooks/useNow';
import { useUsageData } from '@/hooks/useUsageData';
import { describeError, sendRuntimeRequest } from '@/services/messaging';
import { computeUsageSummary } from '@/services/stats';

function DashboardSkeleton() {
  return (
    <div className="space-y-3 px-4 py-3" aria-label="Loading">
      <div className="rounded-xl border border-border bg-surface p-4">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="mt-3 h-10 w-36" />
        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-border pt-3">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-4">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-4 h-24" />
      </div>
    </div>
  );
}

const PROMISES = [
  { icon: <Globe />, text: 'Only websites you add are ever tracked' },
  { icon: <EyeOff />, text: 'Just the domain and time — never pages or content' },
  { icon: <WifiOff />, text: 'Works offline; syncing is optional' },
];

function Onboarding({ onAdd }: { onAdd: () => void }) {
  return (
    <main className="flex min-h-0 flex-1 animate-fade-in flex-col items-center justify-center px-8 text-center">
      <LogoMark className="size-11" />
      <h1 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-fg">Choose what to track</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        See where your time goes on the websites that matter to you — and nowhere else.
      </p>
      <ul className="mt-6 space-y-2.5 text-left">
        {PROMISES.map((promise) => (
          <li key={promise.text} className="flex items-center gap-2.5 text-xs text-fg-muted">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-soft-fg [&_svg]:size-3.5">
              {promise.icon}
            </span>
            {promise.text}
          </li>
        ))}
      </ul>
      <Button variant="primary" size="lg" className="mt-7" leadingIcon={<Plus />} onClick={onAdd}>
        Add websites
      </Button>
    </main>
  );
}

export function Dashboard({
  newDomains,
  onAddWebsite,
  onOpenSettings,
}: {
  newDomains: ReadonlySet<string>;
  onAddWebsite: () => void;
  onOpenSettings: () => void;
}) {
  const toast = useToast();
  const { websites, loading: websitesLoading } = useTrackedWebsites();
  const usage = useUsageData();
  const { status: syncStatus } = useSyncStatus();
  const now = useNow(usage.active ? 1_000 : 30_000);

  const summary = useMemo(
    () => computeUsageSummary({ sessions: usage.sessions, active: usage.active, now }),
    [usage.sessions, usage.active, now],
  );
  const secondsByDomain = useMemo(
    () => new Map(summary.today.websites.map((website) => [website.domain, website.seconds])),
    [summary],
  );

  // Rank by usage as of the last data load rather than every tick, so rows never jump under the pointer.
  const ordered = useMemo(() => {
    const atLoad = computeUsageSummary({ sessions: usage.sessions, active: usage.active, now: usage.loadedAt });
    const seconds = new Map(atLoad.today.websites.map((website) => [website.domain, website.seconds]));
    return [...websites].sort(
      (a, b) => (seconds.get(b.domain) ?? 0) - (seconds.get(a.domain) ?? 0) || a.createdAt - b.createdAt,
    );
  }, [websites, usage.sessions, usage.active, usage.loadedAt]);

  const setEnabled = useCallback(
    async (domain: string, enabled: boolean) => {
      try {
        await sendRuntimeRequest({ type: 'websites/set-enabled', domain, enabled });
      } catch (error) {
        toast({
          tone: 'error',
          title: enabled ? 'Couldn’t resume tracking' : 'Couldn’t pause tracking',
          description: describeError(error),
        });
        throw error;
      }
    },
    [toast],
  );

  const remove = useCallback(
    async (domain: string) => {
      const name = websites.find((website) => website.domain === domain)?.displayName ?? domain;
      try {
        await sendRuntimeRequest({ type: 'websites/remove', domain });
        toast({ tone: 'success', title: `Stopped tracking ${name}` });
      } catch (error) {
        toast({ tone: 'error', title: `Couldn’t remove ${name}`, description: describeError(error) });
        throw error;
      }
    },
    [toast, websites],
  );

  const loading = websitesLoading || usage.loading;
  const enabledCount = websites.filter((website) => website.isEnabled).length;

  return (
    <div className="flex h-full flex-col">
      <AppHeader syncStatus={syncStatus} now={now} onOpenSettings={onOpenSettings} />
      {loading ? (
        <DashboardSkeleton />
      ) : websites.length === 0 ? (
        <Onboarding onAdd={onAddWebsite} />
      ) : (
        <>
          <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {usage.error && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
                <CircleAlert className="size-3.5 shrink-0" aria-hidden />
                Couldn’t load usage history: {usage.error}
              </p>
            )}
            <TodaySummary
              today={summary.today}
              live={summary.live}
              trackedCount={websites.length}
              enabledCount={enabledCount}
            />
            <WeeklyChart week={summary.week} today={summary.today.date} />
            <WebsiteList
              websites={ordered}
              secondsByDomain={secondsByDomain}
              liveDomain={summary.live?.domain ?? null}
              newDomains={newDomains}
              onSetEnabled={setEnabled}
              onRemove={remove}
            />
          </main>
          <footer className="shrink-0 border-t border-border bg-surface/85 px-4 py-3 backdrop-blur-sm">
            <Button variant="primary" size="lg" className="w-full" leadingIcon={<Plus />} onClick={onAddWebsite}>
              Add website
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}
