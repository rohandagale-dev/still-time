import { API_ROUTES } from '@stilltime/shared';
import { Router, type RequestHandler } from 'express';

import type { AuthStrategy } from '../auth/types.js';
import {
  todayAnalyticsHandler,
  websitesAnalyticsHandler,
  weeklyAnalyticsHandler,
} from '../controllers/analytics.controller.js';
import { createHealthController } from '../controllers/health.controller.js';
import {
  createSessionHandler,
  listSessionsHandler,
  syncSessionsHandler,
  todaySessionsHandler,
} from '../controllers/session.controller.js';
import {
  createWebsiteHandler,
  deleteWebsiteHandler,
  listWebsitesHandler,
  syncWebsitesHandler,
  updateWebsiteHandler,
} from '../controllers/website.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireDatabase } from '../middleware/require-database.js';

export interface ApiRouterOptions {
  authStrategy: AuthStrategy;
  version: string;
}

export function createApiRouter({ authStrategy, version }: ApiRouterOptions): Router {
  const router = Router();

  // Public.
  router.get(API_ROUTES.health, createHealthController(version));

  // Everything below requires an authenticated caller and a reachable database.
  const guard: RequestHandler[] = [authenticate(authStrategy), requireDatabase];

  router.get(API_ROUTES.websites, guard, listWebsitesHandler);
  router.post(API_ROUTES.websites, guard, createWebsiteHandler);
  router.post(API_ROUTES.websitesSync, guard, syncWebsitesHandler);
  router.patch(`${API_ROUTES.websites}/:id`, guard, updateWebsiteHandler);
  router.delete(`${API_ROUTES.websites}/:id`, guard, deleteWebsiteHandler);

  router.post(API_ROUTES.sessions, guard, createSessionHandler);
  router.post(API_ROUTES.sessionsSync, guard, syncSessionsHandler);
  router.get(API_ROUTES.sessions, guard, listSessionsHandler);
  router.get(API_ROUTES.sessionsToday, guard, todaySessionsHandler);

  router.get(API_ROUTES.analyticsToday, guard, todayAnalyticsHandler);
  router.get(API_ROUTES.analyticsWeekly, guard, weeklyAnalyticsHandler);
  router.get(API_ROUTES.analyticsWebsites, guard, websitesAnalyticsHandler);

  return router;
}
