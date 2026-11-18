import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

import type { Logger } from '../utils/logger.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Assigns a correlation id to every request and logs one line when the response finishes.
 * Only the method, path, status and timing are logged — never bodies or query strings.
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const entry = {
        reqId: req.id,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
      };
      if (res.statusCode >= 500) logger.error(entry, 'request failed');
      else logger.info(entry, 'request completed');
    });
    next();
  };
}
