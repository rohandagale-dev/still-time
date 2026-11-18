import { cn } from '@/utils/cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name (also the native tooltip). */
  label: string;
  disabled?: boolean | undefined;
  size?: 'sm' | 'md' | undefined;
  className?: string | undefined;
}

export function Switch({ checked, onCheckedChange, label, disabled = false, size = 'md', className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out disabled:opacity-50',
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        checked ? 'bg-accent' : 'bg-border-strong',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-sm transition-transform duration-200 ease-out',
          size === 'sm' ? 'size-3' : 'size-4',
          checked ? (size === 'sm' ? 'translate-x-3.5' : 'translate-x-4.5') : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
