import { addDaysToDateKey } from '@stilltime/shared';
import type { Request, Response } from 'express';

import { requireUserId } from '../middleware/authenticate.js';
import { getDayAnalytics, getWebsitesAnalytics, getWeeklyAnalytics } from '../services/analytics.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { resolveDay } from '../utils/dates.js';
import { parseInput } from '../utils/validation.js';
import {
  todayAnalyticsQuerySchema,
  websitesAnalyticsQuerySchema,
  weeklyAnalyticsQuerySchema,
} from '../validators/analytics.validators.js';

export async function todayAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const date = resolveDay(parseInput(todayAnalyticsQuerySchema, req.query));
  sendSuccess(res, await getDayAnalytics(requireUserId(req), date));
}

export async function weeklyAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const query = parseInput(weeklyAnalyticsQuerySchema, req.query);
  const endDate = query.endDate ?? resolveDay({ tz: query.tz });
  sendSuccess(res, await getWeeklyAnalytics(requireUserId(req), endDate));
}

/** Defaults to the last seven days (including today in `tz`). */
export async function websitesAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const query = parseInput(websitesAnalyticsQuerySchema, req.query);
  const to = query.to ?? resolveDay({ tz: query.tz });
  const from = query.from ?? addDaysToDateKey(to, -6);
  sendSuccess(res, await getWebsitesAnalytics(requireUserId(req), from, to));
}
