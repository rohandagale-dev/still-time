import type { FINAL_SESSION_STATUSES, SESSION_STATUSES } from '../constants/index.js';

export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type FinalSessionStatus = (typeof FINAL_SESSION_STATUSES)[number];

/**
 * A finished usage session as uploaded by a client. `id` is generated on the client and is the
 * idempotency key: uploading the same session any number of times stores it exactly once.
 */
export interface SessionSyncItem {
  id: string;
  domain: string;
  websiteName: string;
  /** ISO 8601 timestamps. */
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  /** Calendar day (YYYY-MM-DD) in the client's local time zone. Sessions never span midnight. */
  date: string;
  status: FinalSessionStatus;
}

export interface SessionsSyncRequest {
  sessions: SessionSyncItem[];
}

export interface SessionsSyncResponse {
  /** Newly stored session ids. */
  accepted: string[];
  /** Ids the server already had (safe to treat as synced). */
  duplicates: string[];
  /** Invalid sessions that will never be accepted (do not retry). */
  rejected: { id: string; reason: string }[];
}

/** A stored session as exposed by the REST API. */
export interface WebsiteSessionDto {
  id: string;
  clientSessionId: string;
  websiteId: string | null;
  domain: string;
  websiteName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  date: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}
