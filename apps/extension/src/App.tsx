import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider, useDismissToasts, useToast } from '@/components/ui/Toast';
import { useSettings } from '@/hooks/useChromeStorage';
import { useThemeEffect } from '@/hooks/useTheme';
import { sendRuntimeRequest } from '@/services/messaging';
import type { AddWebsitesResult } from '@/types';
import { cn } from '@/utils/cn';
import { pluralize } from '@/utils/format';

import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';

// The Add Website screen carries URL normalization (and the Public Suffix List), which the
// dashboard never needs. Load it on demand, prefetching once the dashboard has rendered.
const loadAddWebsite = () => import('./pages/AddWebsite');
const AddWebsite = lazy(() => loadAddWebsite().then((module) => ({ default: module.AddWebsite })));

type ScreenName = 'dashboard' | 'add' | 'settings';
type Transition = 'initial' | 'forward' | 'back';

/** How long newly added websites stay highlighted on the dashboard. */
const NEW_HIGHLIGHT_MS = 2_400;

function Screens() {
  const toast = useToast();
  const dismissToasts = useDismissToasts();
  const { settings } = useSettings();
  useThemeEffect(settings.theme);

  const [screen, setScreen] = useState<{ name: ScreenName; transition: Transition }>({
    name: 'dashboard',
    transition: 'initial',
  });
  const [newDomains, setNewDomains] = useState<ReadonlySet<string>>(() => new Set());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Opening the popup asks the worker to re-check what should be tracked right now (this also
  // closes a stale session left behind by sleep or a crash before its numbers are shown).
  useEffect(() => {
    sendRuntimeRequest({ type: 'tracking/refresh' }).catch(() => undefined);
    const prefetch = setTimeout(() => void loadAddWebsite().catch(() => undefined), 300);
    return () => {
      clearTimeout(prefetch);
      clearTimeout(highlightTimer.current);
    };
  }, []);

  const go = useCallback(
    (name: ScreenName, transition: Transition) => {
      dismissToasts();
      setScreen({ name, transition });
    },
    [dismissToasts],
  );
  const back = useCallback(() => go('dashboard', 'back'), [go]);

  const onAdded = useCallback(
    (result: AddWebsitesResult) => {
      go('dashboard', 'back');
      const names = result.added.map((website) => website.displayName);
      toast({
        tone: 'success',
        title: names.length === 1 ? `Now tracking ${names[0]}` : `Now tracking ${pluralize(names.length, 'website')}`,
        description:
          result.skipped.length > 0 ? `${pluralize(result.skipped.length, 'website')} skipped (already tracked).` : undefined,
      });
      setNewDomains(new Set(result.added.map((website) => website.domain)));
      clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setNewDomains(new Set()), NEW_HIGHLIGHT_MS);
    },
    [go, toast],
  );

  return (
    <div
      key={screen.name}
      className={cn(
        'h-full',
        screen.transition === 'initial' && 'animate-fade-in',
        screen.transition === 'forward' && 'animate-slide-in',
        screen.transition === 'back' && 'animate-slide-back',
      )}
    >
      {screen.name === 'dashboard' && (
        <Dashboard
          newDomains={newDomains}
          onAddWebsite={() => go('add', 'forward')}
          onOpenSettings={() => go('settings', 'forward')}
        />
      )}
      {screen.name === 'add' && (
        <Suspense fallback={null}>
          <AddWebsite onBack={back} onAdded={onAdded} />
        </Suspense>
      )}
      {screen.name === 'settings' && <Settings onBack={back} />}
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <Screens />
      </ErrorBoundary>
    </ToastProvider>
  );
}
