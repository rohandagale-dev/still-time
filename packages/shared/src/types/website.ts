/** A tracked website as exposed by the REST API. */
export interface TrackedWebsiteDto {
  id: string;
  /** Canonical website key, e.g. `youtube.com` or `mail.google.com`. */
  domain: string;
  displayName: string;
  faviconUrl: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebsiteRequest {
  domain: string;
  displayName?: string;
  faviconUrl?: string | null;
  isEnabled?: boolean;
}

export interface UpdateWebsiteRequest {
  displayName?: string;
  faviconUrl?: string | null;
  isEnabled?: boolean;
}

/**
 * One entry of an offline-first configuration sync. The client sends its full current state for
 * every website that changed; the server applies it with last-write-wins on `updatedAt`.
 */
export interface WebsiteSyncItem {
  domain: string;
  displayName: string;
  faviconUrl: string | null;
  isEnabled: boolean;
  /** `true` for a tombstone: the website was removed on the client. */
  deleted: boolean;
  /** Client timestamp (ISO 8601) of the change. Used for last-write-wins conflict resolution. */
  updatedAt: string;
}

export interface WebsitesSyncRequest {
  websites: WebsiteSyncItem[];
}

/**
 * - `applied`  — the change is now the server state.
 * - `stale`    — the server already holds a newer change for this domain; nothing was written.
 * - `rejected` — the item is invalid and will never be accepted (do not retry).
 */
export type WebsiteSyncStatus = 'applied' | 'stale' | 'rejected';

export interface WebsiteSyncResult {
  domain: string;
  status: WebsiteSyncStatus;
  reason?: string;
}

export interface WebsitesSyncResponse {
  results: WebsiteSyncResult[];
}
