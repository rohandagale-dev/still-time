import { cn } from '@/utils/cn';

export function Skeleton({ className }: { className?: string | undefined }) {
  return <span aria-hidden className={cn('block animate-shimmer rounded-md bg-surface-muted', className)} />;
}
