import type { LiveSession, UsageSummary } from '@/services/stats';
import { durationParts, formatClock, formatDurationLong } from '@/utils/format';

import { LiveDot } from './LiveDot';
import { Card } from './ui/Card';

function HeroDuration({ seconds }: { seconds: number }) {
  return (
    <p className="mt-1 flex items-baseline gap-2 text-fg" aria-label={formatDurationLong(seconds)}>
      {durationParts(seconds).map((part) => (
        <span key={part.unit} aria-hidden className="flex items-baseline">
          <span className="text-[48px] leading-none font-semibold tracking-[-0.035em]">{part.value}</span>
          <span className="ml-0.5 text-xl leading-none font-medium text-fg-muted">{part.unit}</span>
        </span>
      ))}
    </p>
  );
}

function LivePill({ live }: { live: LiveSession }) {
  return (
    <div
      className="flex max-w-[170px] animate-fade-in items-center gap-1.5 rounded-full border border-border bg-surface py-1 pr-2.5 pl-2 text-2xs font-medium shadow-xs"
      title={`Tracking ${live.websiteName}`}
    >
      <LiveDot />
      <span className="truncate text-fg">{live.websiteName}</span>
      <span className="text-fg-muted tabular-nums">{formatClock(live.seconds)}</span>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div className="min-w-0 px-3 first:pl-0 last:pr-0">
      <dt className="text-2xs font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 flex items-baseline gap-1.5">
        <span className="truncate text-base font-semibold text-fg">{value}</span>
        {hint && <span className="shrink-0 text-2xs text-fg-subtle">{hint}</span>}
      </dd>
    </div>
  );
}

export function TodaySummary({
  today,
  live,
  trackedCount,
  enabledCount,
}: {
  today: UsageSummary['today'];
  live: LiveSession | null;
  trackedCount: number;
  enabledCount: number;
}) {
  return (
    <Card className="p-4" aria-label="Today’s usage">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium text-fg-muted">Today</h2>
          <HeroDuration seconds={today.seconds} />
        </div>
        {live && <LivePill live={live} />}
      </div>
      <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
        <StatTile
          label="Websites"
          value={String(trackedCount)}
          hint={enabledCount < trackedCount ? `${enabledCount} active` : undefined}
        />
        <StatTile label="Sessions" value={String(today.sessions)} />
        <StatTile label="Most used" value={today.mostUsed?.websiteName ?? '—'} />
      </dl>
    </Card>
  );
}
