import { Plus } from 'lucide-react';

import { Button } from './ui/Button';

export function SelectionFooter({
  selectedCount,
  submitting,
  onSubmit,
}: {
  selectedCount: number;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface/85 px-4 py-3 backdrop-blur-sm">
      <p className="text-xs text-fg-muted" aria-live="polite">
        {selectedCount === 0 ? (
          'Select websites to track'
        ) : (
          <>
            <span className="font-semibold text-fg">{selectedCount}</span> selected
          </>
        )}
      </p>
      <Button
        variant="primary"
        size="lg"
        disabled={selectedCount === 0}
        loading={submitting}
        leadingIcon={<Plus />}
        onClick={onSubmit}
      >
        {submitting ? 'Adding…' : 'Add selected'}
      </Button>
    </footer>
  );
}
