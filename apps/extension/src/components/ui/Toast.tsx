import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/utils/cn';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastOptions {
  title: string;
  description?: string | undefined;
  tone?: ToastTone | undefined;
}

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
}

const ToastContext = createContext<(toast: ToastOptions) => void>(() => undefined);
const DismissAllContext = createContext<() => void>(() => undefined);

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CircleCheck className="text-success" />,
  error: <CircleAlert className="text-danger" />,
  info: <Info className="text-accent" />,
};

const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      nextId.current += 1;
      const item: ToastItem = { ...options, id: nextId.current, tone: options.tone ?? 'info' };
      setItems((current) => [...current.slice(-(MAX_VISIBLE - 1)), item]);
      timers.current.set(
        item.id,
        setTimeout(() => dismiss(item.id), item.tone === 'error' ? 6000 : 3500),
      );
    },
    [dismiss],
  );

  const dismissAll = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setItems([]);
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext value={show}>
      <DismissAllContext value={dismissAll}>{children}</DismissAllContext>
      <div
        role="status"
        aria-live="polite"
        // Overlays the header (least important area for a few seconds) — never the content or actions.
        className="pointer-events-none fixed inset-x-2.5 top-1.5 z-50 flex flex-col items-stretch gap-2"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex animate-rise-in items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 shadow-md',
              '[&>svg]:mt-px [&>svg]:size-4 [&>svg]:shrink-0',
            )}
          >
            {ICONS[item.tone]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{item.title}</p>
              {item.description && <p className="mt-0.5 text-xs text-fg-muted">{item.description}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(item.id)}
              className="-mr-1 grid size-5 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): (toast: ToastOptions) => void {
  return useContext(ToastContext);
}

/** Toasts belong to the screen that raised them: navigation clears them. */
export function useDismissToasts(): () => void {
  return useContext(DismissAllContext);
}
