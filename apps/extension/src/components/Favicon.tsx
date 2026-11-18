import { useState } from 'react';

import { displayableFaviconUrl } from '@/services/domain-normalizer';
import { cn } from '@/utils/cn';

const initialOf = (name: string): string => {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toUpperCase() : '•';
};

/**
 * A website favicon in a tile. Falls back to the site's initial when there is no favicon or it
 * fails to load, so a missing or broken favicon never breaks the layout.
 */
export function Favicon({
  src,
  name,
  size = 'md',
  className,
}: {
  src: string | null | undefined;
  name: string;
  size?: 'sm' | 'md' | undefined;
  className?: string | undefined;
}) {
  const url = displayableFaviconUrl(src);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && url !== failedUrl;

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface',
        size === 'md' ? 'size-8' : 'size-7',
        className,
      )}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(url)}
          className={size === 'md' ? 'size-[18px]' : 'size-4'}
        />
      ) : (
        <span className="text-xs font-semibold text-fg-muted">{initialOf(name)}</span>
      )}
    </span>
  );
}
