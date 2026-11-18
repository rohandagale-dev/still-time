import type { Request, RequestHandler } from 'express';

import type { AuthContext, AuthStrategy } from '../auth/types.js';
import { AppError } from '../utils/errors.js';

/** Resolves the caller with the configured strategy; responds 401 when unauthenticated. */
export function authenticate(strategy: AuthStrategy): RequestHandler {
  return async (req, _res, next) => {
    const context = await strategy.authenticate(req);
    if (!context) throw AppError.unauthorized();
    req.auth = context;
    next();
  };
}

/** Returns the authenticated user id of a request that went through `authenticate`. */
export function requireUserId(req: Request): string {
  const auth: AuthContext | undefined = req.auth;
  if (!auth) throw AppError.unauthorized();
  return auth.userId;
}
