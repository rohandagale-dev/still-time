import type { HTMLAttributes } from 'react';

import { cn } from '@/utils/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-xl border border-border bg-surface shadow-xs', className)} {...rest} />;
}
