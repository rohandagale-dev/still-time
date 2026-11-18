import { createServer } from 'node:http';

import { createApp } from './app.js';
import { createAuthStrategy } from './auth/strategies.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { loadConfig, loadEnvFiles } from './config/env.js';
import { ensureIndexes } from './models/index.js';
import { createLogger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  loadEnvFiles();
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, pretty: config.nodeEnv === 'development' });

  const authStrategy = createAuthStrategy(config.auth);
  if (authStrategy.name === 'development') {
    logger.warn('AUTH_MODE=development — all requests are attributed to the configured development user');
  } else if (authStrategy.name === 'none') {
    logger.warn('No authentication strategy configured — every /api request will be rejected with 401');
  }

  await connectDatabase({ uri: config.mongoUri, logger });
  await ensureIndexes();

  const server = createServer(createApp({ config, logger, authStrategy }));
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  logger.info({ url: `http://${config.host}:${config.port}`, env: config.nodeEnv }, 'Stilltime API listening');

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out — exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(() => {
      disconnectDatabase()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          logger.error({ err: error }, 'Error while closing the database connection');
          process.exit(1);
        });
    });
    server.closeIdleConnections();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
