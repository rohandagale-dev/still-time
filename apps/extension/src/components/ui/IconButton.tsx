import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/utils/cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  /** Accessible name; also shown as the native tooltip. */
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md' | undefined;
  tone?: 'default' | 'danger' | undefined;
}

export function IconButton({
  label,
  children,
  size = 'md',
  tone = 'default',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-lg text-fg-muted transition-[background-color,color,opacity,transform] duration-150',
        'hover:bg-surface-muted hover:text-fg active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-7 [&_svg]:size-3.5' : 'size-8 [&_svg]:size-4',
        tone === 'danger' && 'hover:bg-danger-soft hover:text-danger',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
