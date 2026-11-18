import { cn } from '@/utils/cn';

/** Pulsing status dot for "tracking right now". Always paired with a text label. */
export function LiveDot({ className }: { className?: string | undefined }) {
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 animate-live rounded-full bg-success', className)} />;
}
