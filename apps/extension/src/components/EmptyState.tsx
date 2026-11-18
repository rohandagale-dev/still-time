import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex animate-fade-in flex-col items-center px-6 py-10 text-center', className)}>
      <div className="mb-3 grid size-10 place-items-center rounded-xl border border-border bg-surface text-fg-muted shadow-xs [&_svg]:size-[18px]">
        {icon}
      </div>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-[270px] text-xs text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
