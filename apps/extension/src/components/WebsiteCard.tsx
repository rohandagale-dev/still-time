import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { TrackedWebsite } from '@/types';
import { cn } from '@/utils/cn';
import { formatDuration, formatDurationLong } from '@/utils/format';

import { Favicon } from './Favicon';
import { LiveDot } from './LiveDot';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Switch } from './ui/Switch';

/** Today's share of the most-used site: a thin meter on a same-hue track. */
function UsageMeter({ seconds, maxSeconds, muted }: { seconds: number; maxSeconds: number; muted: boolean }) {
  const percent = maxSeconds > 0 ? Math.min(100, (seconds / maxSeconds) * 100) : 0;
  return (
    <div aria-hidden className={cn('h-1 w-full overflow-hidden rounded-full', muted ? 'bg-surface-muted' : 'bg-accent-soft')}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-500 ease-out', muted ? 'bg-fg-subtle/50' : 'bg-accent')}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export interface WebsiteCardProps {
  website: TrackedWebsite;
  /** Tracked seconds today. */
  seconds: number;
  /** Today's most-used site's seconds (meter scale). */
  maxSeconds: number;
  isLive: boolean;
  isNew: boolean;
  /** Resolve on success, reject on failure (the caller reports the error). */
  onSetEnabled: (domain: string, enabled: boolean) => Promise<void>;
  onRemove: (domain: string) => Promise<void>;
}

export function WebsiteCard({ website, seconds, maxSeconds, isLive, isNew, onSetEnabled, onRemove }: WebsiteCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<'toggle' | 'remove' | null>(null);
  // Optimistic switch state, held until the stored registry catches up with the change.
  const [optimisticEnabled, setOptimisticEnabled] = useState<boolean | null>(null);
  const enabled = optimisticEnabled ?? website.isEnabled;

  useEffect(() => {
    if (optimisticEnabled !== null && website.isEnabled === optimisticEnabled) setOptimisticEnabled(null);
  }, [website.isEnabled, optimisticEnabled]);

  const toggle = async (next: boolean): Promise<void> => {
    setOptimisticEnabled(next);
    setPending('toggle');
    try {
      await onSetEnabled(website.domain, next);
    } catch {
      setOptimisticEnabled(null);
    } finally {
      setPending(null);
    }
  };

  const remove = async (): Promise<void> => {
    setPending('remove');
    try {
      await onRemove(website.domain);
    } catch {
      setPending(null);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <li className="flex animate-fade-in items-center gap-3 bg-danger-soft/50 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">Stop tracking {website.displayName}?</p>
          <p className="text-2xs text-fg-muted">Time already tracked stays in your history.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending === 'remove'}>
          Cancel
        </Button>
        <Button size="sm" variant="danger" loading={pending === 'remove'} onClick={() => void remove()} autoFocus>
          Remove
        </Button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        'group relative flex items-center gap-3 px-3 py-2.5 transition-colors duration-700',
        isNew ? 'animate-rise-in bg-accent-soft/60' : 'bg-transparent',
      )}
    >
      <Favicon src={website.faviconUrl} name={website.displayName} className={cn(!enabled && 'opacity-60 grayscale')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn('truncate text-sm font-medium', enabled ? 'text-fg' : 'text-fg-muted')}>{website.displayName}</p>
          {isLive && enabled && (
            <span className="flex shrink-0 items-center gap-1 text-2xs text-fg-muted">
              <LiveDot />
              Tracking
            </span>
          )}
          {!enabled && <Badge>Paused</Badge>}
        </div>
        <p className="truncate text-2xs text-fg-subtle">{website.domain}</p>
        <div className="mt-1.5">
          <UsageMeter seconds={seconds} maxSeconds={maxSeconds} muted={!enabled} />
        </div>
      </div>
      <span
        className={cn('w-11 shrink-0 text-right text-sm tabular-nums', enabled ? 'text-fg' : 'text-fg-muted')}
        aria-label={`${formatDurationLong(seconds)} today`}
      >
        {formatDuration(seconds)}
      </span>
      <Switch
        size="sm"
        checked={enabled}
        disabled={pending !== null}
        onCheckedChange={(next) => void toggle(next)}
        label={enabled ? `Pause tracking ${website.displayName}` : `Resume tracking ${website.displayName}`}
      />
      <IconButton
        size="sm"
        tone="danger"
        label={`Remove ${website.displayName}`}
        onClick={() => setConfirming(true)}
        className="-mr-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Trash2 />
      </IconButton>
    </li>
  );
}
