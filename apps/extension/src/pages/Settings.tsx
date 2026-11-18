import { ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { ScreenHeader } from '@/components/Header';
import { describeSync } from '@/components/SyncIndicator';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/Toast';
import { useSettings, useSyncStatus } from '@/hooks/useChromeStorage';
import { useNow } from '@/hooks/useNow';
import { describeError, sendRuntimeRequest } from '@/services/messaging';
import type { Settings as SettingsValue, ThemePreference } from '@/types';
import { cn } from '@/utils/cn';

const IDLE_OPTIONS = [
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
  { value: '120', label: '2 minutes' },
  { value: '300', label: '5 minutes' },
  { value: '600', label: '10 minutes' },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-0.5 text-2xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h2>
      <div className="divide-y divide-border rounded-xl border border-border bg-surface shadow-xs">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{label}</p>
        {description && <p className="mt-0.5 text-2xs text-fg-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function Settings({ onBack }: { onBack: () => void }) {
  const toast = useToast();
  const { settings } = useSettings();
  const { status } = useSyncStatus();
  const now = useNow(15_000);
  const [syncing, setSyncing] = useState(false);

  const update = async (patch: Partial<SettingsValue>): Promise<void> => {
    try {
      await sendRuntimeRequest({ type: 'settings/update', patch });
    } catch (error) {
      toast({ tone: 'error', title: 'Couldn’t save the setting', description: describeError(error) });
    }
  };

  const syncNow = async (): Promise<void> => {
    setSyncing(true);
    try {
      const result = await sendRuntimeRequest({ type: 'sync/run' });
      if (result.state === 'idle') toast({ tone: 'success', title: 'Everything is synced' });
      else toast({ tone: 'error', title: 'Sync didn’t complete', description: describeSync(result, Date.now()).label });
    } catch (error) {
      toast({ tone: 'error', title: 'Sync didn’t complete', description: describeError(error) });
    } finally {
      setSyncing(false);
    }
  };

  const idleValue = String(settings.idleThresholdSeconds);
  const idleOptions = IDLE_OPTIONS.some((option) => option.value === idleValue)
    ? IDLE_OPTIONS
    : [...IDLE_OPTIONS, { value: idleValue, label: `${settings.idleThresholdSeconds} seconds` }];
  const sync = describeSync(status, now);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Settings" onBack={onBack} />
      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <Group title="Appearance">
          <Row label="Theme">
            <SegmentedControl<ThemePreference>
              label="Theme"
              value={settings.theme}
              onChange={(theme) => void update({ theme })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
        </Group>

        <Group title="Tracking">
          <Row label="Idle after" description="Tracking pauses without keyboard or mouse activity.">
            <Select
              label="Idle after"
              className="w-32 shrink-0"
              value={idleValue}
              options={idleOptions}
              onChange={(value) => void update({ idleThresholdSeconds: Number(value) })}
            />
          </Row>
          <Row label="Count media as activity" description="Keep counting while a tracked tab plays audio, even without input.">
            <Switch
              label="Count media as activity"
              checked={settings.countMediaAsActive}
              onCheckedChange={(countMediaAsActive) => void update({ countMediaAsActive })}
            />
          </Row>
        </Group>

        <Group title="Sync">
          <Row label="Back up to server" description={<span className="break-all">{settings.apiBaseUrl}</span>}>
            <Switch
              label="Back up to server"
              checked={settings.syncEnabled}
              onCheckedChange={(syncEnabled) => void update({ syncEnabled })}
            />
          </Row>
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <p
              className={cn(
                'flex min-w-0 items-center gap-2 text-xs [&_svg]:size-3.5 [&_svg]:shrink-0',
                sync.tone === 'danger' ? 'text-danger' : sync.tone === 'warning' ? 'text-warning' : 'text-fg-muted',
              )}
            >
              {sync.icon}
              <span className="min-w-0">{sync.label}</span>
            </p>
            <Button size="sm" loading={syncing} disabled={!settings.syncEnabled} onClick={() => void syncNow()}>
              Sync now
            </Button>
          </div>
        </Group>

        <section className="flex gap-3 rounded-xl bg-surface-muted px-3 py-3">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-2xs leading-relaxed text-fg-muted">
            Stilltime records only the domain and how long you were active on websites you added — never page
            addresses, titles, content, or anything you type. Incognito windows are never tracked.
          </p>
        </section>

        <p className="text-center text-2xs text-fg-subtle">Stilltime {chrome.runtime.getManifest().version}</p>
      </main>
    </div>
  );
}
