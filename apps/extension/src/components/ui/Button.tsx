import { LoaderCircle } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

import { cn } from '@/utils/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg shadow-xs hover:bg-accent-hover',
  secondary: 'border border-border bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-surface-hover',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  soft: 'bg-accent-soft text-accent-soft-fg hover:bg-accent-soft/70',
  danger: 'bg-danger text-white shadow-xs hover:bg-danger-hover',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 rounded-md px-2.5 text-xs [&_svg]:size-3.5',
  md: 'h-8 gap-1.5 rounded-lg px-3 text-sm [&_svg]:size-4',
  lg: 'h-9 gap-2 rounded-lg px-3.5 text-sm [&_svg]:size-4',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean | undefined;
  leadingIcon?: ReactNode;
  ref?: Ref<HTMLButtonElement> | undefined;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  leadingIcon,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : leadingIcon}
      {children}
    </button>
  );
}
