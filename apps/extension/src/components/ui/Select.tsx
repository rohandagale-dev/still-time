import { ChevronDown } from 'lucide-react';

import { cn } from '@/utils/cn';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/** A native select (keyboard and screen-reader behaviour for free), styled to match. */
export function Select({ value, options, onChange, label, disabled = false, className }: SelectProps) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-8 w-full cursor-pointer appearance-none rounded-lg border border-border bg-surface pr-7 pl-2.5 text-sm text-fg shadow-xs',
          'transition-colors duration-150 hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-fg-subtle"
      />
    </div>
  );
}
