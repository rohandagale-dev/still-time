import { ChartColumn, List } from 'lucide-react';
import { useState, type CSSProperties } from 'react';

import type { DayUsage, UsageSummary } from '@/services/stats';
import { cn } from '@/utils/cn';
import { formatDayLong, formatDuration, formatDurationLong, formatWeekdayShort, pluralize } from '@/utils/format';

import { Card } from './ui/Card';
import { SegmentedControl } from './ui/SegmentedControl';

const PLOT_HEIGHT = 84;
/** Clean axis maxima whose halves are clean too (2m/1m … 24h/12h). */
const NICE_MAXIMA = [120, 600, 1800, 3600, 7200, 14_400, 21_600, 28_800, 43_200, 57_600, 86_400];

export function niceScaleMax(seconds: number): number {
  return NICE_MAXIMA.find((step) => step >= seconds) ?? Math.ceil(seconds / 3600) * 3600;
}

const dayLabel = (day: DayUsage, today: string): string => (day.date === today ? 'Today' : formatDayLong(day.date));

/**
 * Seven daily totals as columns. Emphasis form: today in the accent, earlier days in the context
 * gray. Each column is a focusable hit target (taller than its bar) with a tooltip; the table
 * view is the accessible twin that never requires hovering.
 */
function ColumnChart({
  days,
  today,
  maxSeconds,
  showScale,
}: {
  days: DayUsage[];
  today: string;
  maxSeconds: number;
  showScale: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const scaleMax = niceScaleMax(Math.max(1, maxSeconds));
  const barHeight = (seconds: number): number =>
    seconds > 0 ? Math.max(2, Math.round((seconds / scaleMax) * PLOT_HEIGHT)) : 0;
  const activeDay = active === null ? undefined : days[active];

  const tooltipStyle = (index: number): CSSProperties => {
    if (index === 0) return { left: 0 };
    if (index === days.length - 1) return { right: 0 };
    return { left: `${((index + 0.5) / days.length) * 100}%`, transform: 'translateX(-50%)' };
  };

  return (
    <div className="mt-4 flex gap-2">
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: PLOT_HEIGHT }}>
          <div aria-hidden className="absolute inset-x-0 top-0 border-t border-chart-grid" />
          <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-chart-grid" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 border-t border-chart-axis" />

          <ol className="absolute inset-0 grid grid-cols-7" aria-label="Tracked time per day">
            {days.map((day, index) => {
              const isToday = day.date === today;
              return (
                <li key={day.date} className="h-full">
                  <button
                    type="button"
                    className="group flex h-full w-full items-end justify-center focus-visible:outline-offset-0"
                    aria-label={`${dayLabel(day, today)}: ${formatDurationLong(day.seconds)}, ${pluralize(day.sessions, 'session')}`}
                    onPointerEnter={() => setActive(index)}
                    onPointerLeave={() => setActive((current) => (current === index ? null : current))}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive((current) => (current === index ? null : current))}
                  >
                    <span
                      className={cn(
                        'block w-[18px] rounded-t-[4px] transition-[filter,height] duration-300 ease-out group-hover:brightness-110 group-focus-visible:brightness-110',
                        isToday ? 'bg-chart-emphasis' : 'bg-chart-context',
                      )}
                      style={{ height: barHeight(day.seconds) }}
                    />
                  </button>
                </li>
              );
            })}
          </ol>

          {activeDay && active !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute z-10 animate-fade-in rounded-md border border-border bg-surface px-2 py-1.5 whitespace-nowrap shadow-md"
              style={{ ...tooltipStyle(active), bottom: barHeight(activeDay.seconds) + 8 }}
            >
              <p className="text-sm font-semibold text-fg">{formatDuration(activeDay.seconds)}</p>
              <p className="text-2xs text-fg-muted">
                {dayLabel(activeDay, today)} · {pluralize(activeDay.sessions, 'session')}
              </p>
            </div>
          )}
        </div>
        <ol aria-hidden className="mt-1.5 grid grid-cols-7 text-center text-2xs">
          {days.map((day) => (
            <li key={day.date} className={day.date === today ? 'font-semibold text-fg' : 'text-fg-subtle'}>
              {formatWeekdayShort(day.date)}
            </li>
          ))}
        </ol>
      </div>
      <div aria-hidden className="relative w-7 shrink-0 text-2xs text-fg-subtle tabular-nums" style={{ height: PLOT_HEIGHT }}>
        {showScale && (
          <>
            <span className="absolute top-0 left-0 -translate-y-1/2">{formatDuration(scaleMax)}</span>
            <span className="absolute top-1/2 left-0 -translate-y-1/2">{formatDuration(scaleMax / 2)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DayTable({ days, today }: { days: DayUsage[]; today: string }) {
  return (
    <table className="mt-3 w-full animate-fade-in text-sm">
      <caption className="sr-only">Tracked time per day, last 7 days</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Day</th>
          <th scope="col">Tracked time</th>
          <th scope="col">Sessions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {[...days].reverse().map((day) => (
          <tr key={day.date}>
            <th scope="row" className={cn('py-1.5 text-left font-normal', day.date === today ? 'font-medium text-fg' : 'text-fg-muted')}>
              {dayLabel(day, today)}
            </th>
            <td className="py-1.5 text-right text-fg tabular-nums">{formatDuration(day.seconds)}</td>
            <td className="w-24 py-1.5 text-right text-xs text-fg-subtle tabular-nums">{pluralize(day.sessions, 'session')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type WeeklyView = 'chart' | 'table';

export function WeeklyChart({ week, today }: { week: UsageSummary['week']; today: string }) {
  const [view, setView] = useState<WeeklyView>('chart');
  const isEmpty = week.totalSeconds === 0;

  return (
    <Card className="p-4" aria-labelledby="weekly-heading">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="weekly-heading" className="text-xs font-medium text-fg-muted">
            Last 7 days
          </h2>
          <p className="mt-0.5 text-sm text-fg">
            <span className="font-semibold">{formatDuration(week.totalSeconds)}</span>
            <span className="text-fg-muted"> total · {formatDuration(week.averageSeconds)} daily avg</span>
          </p>
        </div>
        <SegmentedControl<WeeklyView>
          label="Weekly usage view"
          value={view}
          onChange={setView}
          options={[
            { value: 'chart', label: <ChartColumn />, title: 'Chart view' },
            { value: 'table', label: <List />, title: 'Table view' },
          ]}
        />
      </div>
      {view === 'chart' ? (
        <div className="relative">
          <ColumnChart days={week.days} today={today} maxSeconds={week.maxSeconds} showScale={!isEmpty} />
          {isEmpty && (
            <p className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-xs text-fg-subtle">
              No tracked time this week yet
            </p>
          )}
        </div>
      ) : (
        <DayTable days={week.days} today={today} />
      )}
    </Card>
  );
}
