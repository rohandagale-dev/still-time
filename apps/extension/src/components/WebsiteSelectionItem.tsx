import { Check } from 'lucide-react';
import { useId } from 'react';

import type { WebsiteCandidate } from '@/types';
import { cn } from '@/utils/cn';
import { pluralize } from '@/utils/format';

import { Favicon } from './Favicon';
import { Badge } from './ui/Badge';
import { CheckboxIndicator } from './ui/Checkbox';

/** One website (all of its open tabs) on the Add Website screen. */
export function WebsiteSelectionItem({
  candidate,
  selected,
  onToggle,
}: {
  candidate: WebsiteCandidate;
  selected: boolean;
  onToggle: (candidate: WebsiteCandidate) => void;
}) {
  const metaId = useId();
  const locked = candidate.alreadyAdded;
  const tabsLabel = candidate.tabCount === 0 ? 'Tab closed' : pluralize(candidate.tabCount, 'tab');

  return (
    <li>
      <label
        className={cn(
          'group flex items-center gap-3 px-3 py-2 transition-colors duration-150',
          locked ? 'cursor-default' : 'cursor-pointer hover:bg-surface-hover',
          selected && 'bg-accent-soft/50 hover:bg-accent-soft/70',
        )}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={selected}
          disabled={locked}
          onChange={() => onToggle(candidate)}
          aria-describedby={metaId}
        />
        <CheckboxIndicator
          checked={selected}
          locked={locked}
          className="peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-surface"
        />
        <Favicon src={candidate.faviconUrl} name={candidate.displayName} size="sm" className={cn(locked && 'opacity-60')} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium', locked ? 'text-fg-muted' : 'text-fg')}>
            {candidate.displayName}
          </span>
          <span className="block truncate text-2xs text-fg-subtle">{candidate.domain}</span>
        </span>
        <span id={metaId} className="shrink-0">
          {locked ? (
            <Badge>
              <Check strokeWidth={2.5} />
              Already added
            </Badge>
          ) : (
            <span className="text-2xs text-fg-subtle tabular-nums">{tabsLabel}</span>
          )}
        </span>
      </label>
    </li>
  );
}
