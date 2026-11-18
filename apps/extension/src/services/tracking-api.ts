import {
  API_ROUTES,
  CLIENT_ID_HEADER,
  type HealthStatus,
  type SessionSyncItem,
  type SessionsSyncResponse,
  type WebsiteSyncItem,
  type WebsitesSyncResponse,
} from '@stilltime/shared';

/**
 * - `network`      the server could not be reached (offline, DNS, refused connection)
 * - `timeout`      no response in time
 * - `unauthorized` 401/403 — credentials are missing or rejected
 * - `server`       5xx, 408 or 429 — transient, retry later
 * - `client`       other 4xx — the request itself was refused
 * - `invalid`      the response was not the expected API envelope
 */
export type ApiFailureKind = 'network' | 'timeout' | 'unauthorized' | 'server' | 'client' | 'invalid';

export class ApiRequestError extends Error {
  override name = 'ApiRequestError';
  readonly kind: ApiFailureKind;
  readonly status: number | null;

  constructor(kind: ApiFailureKind, message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options);
    this.kind = kind;
    this.status = status;
  }
}

export interface TrackingApi {
  health(): Promise<HealthStatus>;
  syncWebsites(websites: WebsiteSyncItem[]): Promise<WebsitesSyncResponse>;
  syncSessions(sessions: SessionSyncItem[]): Promise<SessionsSyncResponse>;
}

export interface TrackingApiOptions {
  /** e.g. `http://localhost:4000/api` (no trailing slash). */
  baseUrl: string;
  /** Installation id, sent for diagnostics. */
  clientId: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const kindForStatus = (status: number): ApiFailureKind => {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status >= 500 || status === 408 || status === 429) return 'server';
  return 'client';
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function createTrackingApi({ baseUrl, clientId, fetch: fetchImpl = fetch, timeoutMs = 15_000 }: TrackingApiOptions): TrackingApi {
  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json', [CLIENT_ID_HEADER]: clientId },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(timeoutMs),
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      throw new ApiRequestError(
        timedOut ? 'timeout' : 'network',
        timedOut ? 'The server took too long to respond' : 'The server could not be reached',
        null,
        { cause: error },
      );
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = isRecord(payload) && isRecord(payload['error']) ? payload['error'] : null;
      const message = typeof error?.['message'] === 'string' ? error['message'] : `HTTP ${response.status}`;
      throw new ApiRequestError(kindForStatus(response.status), message, response.status);
    }
    if (!isRecord(payload) || payload['success'] !== true || !('data' in payload)) {
      throw new ApiRequestError('invalid', 'Unexpected response from the server', response.status);
    }
    return payload['data'] as T;
  }

  return {
    health: () => request<HealthStatus>('GET', API_ROUTES.health),
    syncWebsites: (websites) => request<WebsitesSyncResponse>('POST', API_ROUTES.websitesSync, { websites }),
    syncSessions: (sessions) => request<SessionsSyncResponse>('POST', API_ROUTES.sessionsSync, { sessions }),
  };
}
