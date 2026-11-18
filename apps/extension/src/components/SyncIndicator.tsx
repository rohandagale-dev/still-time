import { Cloud, CloudAlert, CloudCheck, CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SyncStatus } from '@/types';
import { cn } from '@/utils/cn';
import { formatRelativeTime, pluralize } from '@/utils/format';

import { IconButton } from './ui/IconButton';

export type SyncTone = 'neutral' | 'warning' | 'danger';

export interface SyncDescription {
  icon: ReactNode;
  label: string;
  tone: SyncTone;
}

/** One sentence describing the sync state, for the header indicator and the settings screen. */
export function describeSync(status: SyncStatus, now: number): SyncDescription {
  const pending = status.pendingSessions + status.pendingWebsites;
  const waiting = pending > 0 ? ` · ${pluralize(pending, 'change')} waiting` : '';
  switch (status.state) {
    case 'disabled':
      return { icon: <CloudOff />, label: 'Sync is off — data stays on this device', tone: 'neutral' };
    case 'syncing':
      return { icon: <RefreshCw className="animate-spin" />, label: 'Syncing…', tone: 'neutral' };
    case 'offline':
      return { icon: <CloudOff />, label: `Server unreachable${waiting}`, tone: 'warning' };
    case 'unauthorized':
      return { icon: <CloudAlert />, label: 'The server rejected this device’s credentials', tone: 'danger' };
    case 'error':
      return { icon: <CloudAlert />, label: `Sync failed${status.lastError ? `: ${status.lastError}` : ''}${waiting}`, tone: 'danger' };
    case 'idle':
      if (pending > 0) return { icon: <CloudUpload />, label: `${pluralize(pending, 'change')} waiting to sync`, tone: 'neutral' };
      if (status.lastSuccessAt !== null) {
        return { icon: <CloudCheck />, label: `Synced ${formatRelativeTime(status.lastSuccessAt, now)}`, tone: 'neutral' };
      }
      return { icon: <Cloud />, label: 'Not synced yet', tone: 'neutral' };
  }
}

export function SyncIndicator({ status, now, onClick }: { status: SyncStatus; now: number; onClick: () => void }) {
  const { icon, label, tone } = describeSync(status, now);
  return (
    <IconButton label={label} onClick={onClick} className="relative">
      {icon}
      {tone !== 'neutral' && (
        <span
          aria-hidden
          className={cn(
            'absolute top-1.5 right-1.5 size-1.5 rounded-full ring-2 ring-bg',
            tone === 'warning' ? 'bg-warning' : 'bg-danger',
          )}
        />
      )}
    </IconButton>
  );
}
