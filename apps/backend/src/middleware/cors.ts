import { CLIENT_ID_HEADER } from '@stilltime/shared';
import cors from 'cors';
import type { RequestHandler } from 'express';

/**
 * CORS with an explicit allow-list. Entries are exact origins (`https://app.example.com`,
 * `chrome-extension://<id>`) or a scheme wildcard (`chrome-extension://*`).
 * Requests without an Origin header (curl, server-to-server) are not subject to CORS.
 */
export function createCorsMiddleware(allowList: readonly string[]): RequestHandler {
  const exactOrigins = new Set<string>();
  const allowedSchemes = new Set<string>();
  for (const entry of allowList) {
    const wildcard = /^([a-z][a-z0-9+.-]*):\/\/\*$/i.exec(entry);
    if (wildcard?.[1]) allowedSchemes.add(`${wildcard[1].toLowerCase()}:`);
    else exactOrigins.add(entry.replace(/\/+$/, ''));
  }

  const isAllowed = (origin: string): boolean => {
    if (exactOrigins.has(origin)) return true;
    try {
      return allowedSchemes.has(new URL(origin).protocol);
    } catch {
      return false;
    }
  };

  return cors({
    origin: (origin, callback) => callback(null, origin === undefined || isAllowed(origin)),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', CLIENT_ID_HEADER],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });
}
