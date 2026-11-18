import { Search, X } from 'lucide-react';

export function WebsiteSearch({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean | undefined;
}) {
  return (
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fg-subtle" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            onChange('');
          }
        }}
        placeholder="Search open websites"
        aria-label="Search open websites"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        className={
          'h-8 w-full rounded-lg border border-border bg-surface pr-8 pl-8 text-sm text-fg shadow-xs placeholder:text-fg-subtle ' +
          'transition-[border-color,box-shadow] duration-150 hover:border-border-strong ' +
          'focus:border-accent focus:ring-3 focus:ring-ring focus:outline-none [&::-webkit-search-cancel-button]:hidden'
        }
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
