/** Mount point of the REST API on the backend. */
export const API_PREFIX = '/api';

/** Route paths relative to {@link API_PREFIX}. */
export const API_ROUTES = {
  health: '/health',
  websites: '/websites',
  websitesSync: '/websites/sync',
  sessions: '/sessions',
  sessionsSync: '/sessions/sync',
  sessionsToday: '/sessions/today',
  analyticsToday: '/analytics/today',
  analyticsWeekly: '/analytics/weekly',
  analyticsWebsites: '/analytics/websites',
} as const;

/**
 * Lifecycle of a usage session.
 * - `active`    — in progress (exists only on the device that is tracking it).
 * - `completed` — ended by an observed event (tab switch, focus loss, idle, …).
 * - `recovered` — closed by recovery logic after an unobserved gap (sleep, crash, browser
 *                 shutdown). Its end time is the last moment the session was confirmed active.
 */
export const SESSION_STATUSES = ['active', 'completed', 'recovered'] as const;
export const FINAL_SESSION_STATUSES = ['completed', 'recovered'] as const;

/** Idle threshold used until the user changes it in settings. */
export const DEFAULT_IDLE_THRESHOLD_SECONDS = 60;
/** chrome.idle rejects detection intervals below 15 seconds. */
export const MIN_IDLE_THRESHOLD_SECONDS = 15;
export const MAX_IDLE_THRESHOLD_SECONDS = 60 * 60;

/** Upper bounds that keep sync payloads and stored documents small and predictable. */
export const MAX_SESSIONS_PER_SYNC = 200;
export const MAX_WEBSITES_PER_SYNC = 200;
export const MAX_SESSION_DURATION_SECONDS = 24 * 60 * 60;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const MAX_SESSION_ID_LENGTH = 100;
export const MAX_FAVICON_URL_LENGTH = 2048;
export const MAX_DOMAIN_LENGTH = 253;

/** Identifies the installation that produced a request (used for diagnostics, never for auth). */
export const CLIENT_ID_HEADER = 'x-stilltime-client-id';
