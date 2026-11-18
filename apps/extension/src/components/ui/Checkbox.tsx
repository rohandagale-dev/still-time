import { Check } from 'lucide-react';

import { cn } from '@/utils/cn';

export interface CheckboxIndicatorProps {
  checked: boolean;
  /** Visual state for items that cannot change (e.g. already tracked). */
  locked?: boolean | undefined;
  className?: string | undefined;
}

/**
 * The visual part of a checkbox. Pair it with a visually hidden native
 * `<input type="checkbox" className="peer sr-only">` inside a `<label>`, so keyboard and screen
 * reader behaviour stay native.
 */
export function CheckboxIndicator({ checked, locked = false, className }: CheckboxIndicatorProps) {
  const filled = checked || locked;
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[5px] border transition-[background-color,border-color] duration-150',
        locked
          ? 'border-border bg-surface-muted text-fg-subtle'
          : checked
            ? 'border-accent bg-accent text-accent-fg'
            : 'border-border-strong bg-surface',
        className,
      )}
    >
      <Check
        strokeWidth={3}
        className={cn('size-3 transition-transform duration-150 ease-out', filled ? 'scale-100' : 'scale-0')}
      />
    </span>
  );
}
