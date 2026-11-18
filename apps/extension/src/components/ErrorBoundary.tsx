import { CircleAlert, RotateCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { EmptyState } from './EmptyState';
import { Button } from './ui/Button';

interface ErrorBoundaryState {
  error: Error | null;
}

/** Last line of defence: an unexpected render error shows a recoverable message, not a blank popup. */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[stilltime] UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center">
        <EmptyState
          icon={<CircleAlert />}
          title="Something went wrong"
          description="Your tracked time is safe. Reload Stilltime to continue."
          action={
            <Button leadingIcon={<RotateCw />} onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </div>
    );
  }
}
