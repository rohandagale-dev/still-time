import type { HealthStatus } from '@stilltime/shared';
import type { RequestHandler } from 'express';

import { getDatabaseState } from '../config/database.js';
import { sendSuccess } from '../utils/api-response.js';

export function createHealthController(version: string): RequestHandler {
  return (_req, res) => {
    const database = getDatabaseState();
    sendSuccess<HealthStatus>(res, {
      status: database === 'connected' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      version,
    });
  };
}
