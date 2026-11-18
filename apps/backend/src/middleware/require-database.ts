import type { RequestHandler } from 'express';

import { getDatabaseState } from '../config/database.js';
import { AppError } from '../utils/errors.js';

/**
 * Fails fast with 503 while MongoDB is unreachable instead of letting Mongoose buffer the query
 * until it times out. Clients treat 503 as retryable.
 */
export const requireDatabase: RequestHandler = (_req, _res, next) => {
  if (getDatabaseState() !== 'connected') throw AppError.serviceUnavailable('Database is unavailable');
  next();
};
