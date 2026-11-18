import { cn } from '@/utils/cn';

/** The Stilltime mark: a still point inside a ring. */
export function LogoMark({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('shrink-0', className)}>
      <rect width="24" height="24" rx="6.5" fill="var(--st-accent)" />
      <circle cx="12" cy="12" r="5.7" fill="none" stroke="#fff" strokeWidth="2.3" />
      <circle cx="12" cy="12" r="1.9" fill="#fff" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <LogoMark className="size-[22px]" />
      <span className="text-[15px] font-semibold tracking-[-0.015em] text-fg">Stilltime</span>
    </div>
  );
}
