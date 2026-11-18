/**
 * Tracking timing constants. They are shared by the service worker (which records sessions) and
 * the popup (which displays the live session), so both apply identical rules.
 */

/** Period of the heartbeat alarm that checkpoints an active session (Chrome's minimum is 30s). */
export const HEARTBEAT_PERIOD_MINUTES = 0.5;

/**
 * Longest gap between two confirmations of an active session that still counts as continuous
 * use. Heartbeats arrive every ~30s, so a larger gap means nothing was observing the session:
 * the computer slept, Chrome was closed or crashed. The session is then closed at its last
 * confirmed moment and the gap is never counted.
 */
export const MAX_UNOBSERVED_GAP_MS = 90_000;

/** Shorter sessions are transitional noise (e.g. cycling through tabs) and are not recorded. */
export const MIN_SESSION_DURATION_MS = 1_000;
