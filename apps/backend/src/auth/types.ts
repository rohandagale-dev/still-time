import type { Request } from 'express';

/** Who is making the request. Every data access is scoped by `userId`. */
export interface AuthContext {
  /** Opaque, stable user identifier (our own id today; an IdP subject such as an OIDC `sub` later). */
  userId: string;
  /** Strategy that authenticated the request — useful in logs and audits. */
  method: string;
}

/**
 * Pluggable authentication. A strategy inspects the request (headers, tokens, …) and returns the
 * caller's identity, or `null` when the request is not authenticated.
 *
 * Adding real authentication later (JWT/OIDC, API keys, sessions) means adding a strategy — the data
 * model already scopes everything by an opaque `userId`, so no schema changes are required.
 */
export interface AuthStrategy {
  readonly name: string;
  authenticate(req: Request): AuthContext | null | Promise<AuthContext | null>;
}
