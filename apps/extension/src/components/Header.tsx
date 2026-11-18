import { ArrowLeft, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SyncStatus } from '@/types';

import { Logo } from './Logo';
import { SyncIndicator } from './SyncIndicator';
import { IconButton } from './ui/IconButton';

/** Dashboard header: brand, sync state, settings. */
export function AppHeader({
  syncStatus,
  now,
  onOpenSettings,
}: {
  syncStatus: SyncStatus;
  now: number;
  onOpenSettings: () => void;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
      <Logo />
      <div className="-mr-1.5 flex items-center gap-0.5">
        <SyncIndicator status={syncStatus} now={now} onClick={onOpenSettings} />
        <IconButton label="Settings" onClick={onOpenSettings}>
          <Settings2 />
        </IconButton>
      </div>
    </header>
  );
}

/** Header of secondary screens: back button, title, optional subtitle and actions. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  onBack: () => void;
  actions?: ReactNode;
}) {
  return (
    <header className="flex shrink-0 items-start gap-1.5 border-b border-border px-2.5 py-2">
      <IconButton label="Back" onClick={onBack}>
        <ArrowLeft />
      </IconButton>
      <div className="min-w-0 flex-1 py-1">
        <h1 className="text-base font-semibold tracking-[-0.01em] text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
