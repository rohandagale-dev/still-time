import { API_PREFIX } from '@stilltime/shared';
import express, { type Express } from 'express';
import helmet from 'helmet';

import type { AuthStrategy } from './auth/types.js';
import type { AppConfig } from './config/env.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { createApiRouter } from './routes/index.js';
import type { Logger } from './utils/logger.js';

export interface AppDependencies {
  config: Pick<AppConfig, 'corsOrigins' | 'version'>;
  logger: Logger;
  authStrategy: AuthStrategy;
}

/** Builds the Express application. No I/O happens here, which keeps it trivially testable. */
export function createApp({ config, logger, authStrategy }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(createCorsMiddleware(config.corsOrigins));
  app.use(express.json({ limit: '1mb' }));

  app.use(API_PREFIX, createApiRouter({ authStrategy, version: config.version }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
