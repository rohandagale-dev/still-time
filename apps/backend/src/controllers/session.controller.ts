import { CLIENT_ID_HEADER } from '@stilltime/shared';
import type { Request, Response } from 'express';

import { requireUserId } from '../middleware/authenticate.js';
import { createSession, listSessions, listSessionsForDay, syncSessions } from '../services/session.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { resolveDay } from '../utils/dates.js';
import { parseInput } from '../utils/validation.js';
import { listSessionsQuerySchema, sessionsSyncSchema, sessionsTodayQuerySchema } from '../validators/session.validators.js';

/** Installation id sent by the extension (diagnostics only — never used for authorization). */
function clientIdOf(req: Request): string | null {
  const value = req.get(CLIENT_ID_HEADER);
  return value && /^[A-Za-z0-9-]{1,64}$/.test(value) ? value : null;
}

export async function createSessionHandler(req: Request, res: Response): Promise<void> {
  const result = await createSession(requireUserId(req), req.body, clientIdOf(req));
  sendSuccess(res, result, result.created ? 201 : 200);
}

export async function syncSessionsHandler(req: Request, res: Response): Promise<void> {
  const { sessions } = parseInput(sessionsSyncSchema, req.body);
  sendSuccess(res, await syncSessions(requireUserId(req), sessions, clientIdOf(req)));
}

export async function listSessionsHandler(req: Request, res: Response): Promise<void> {
  const filter = parseInput(listSessionsQuerySchema, req.query);
  sendSuccess(res, await listSessions(requireUserId(req), filter));
}

export async function todaySessionsHandler(req: Request, res: Response): Promise<void> {
  const date = resolveDay(parseInput(sessionsTodayQuerySchema, req.query));
  sendSuccess(res, { date, sessions: await listSessionsForDay(requireUserId(req), date) });
}
