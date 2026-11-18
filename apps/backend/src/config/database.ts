import { setTimeout as sleep } from 'node:timers/promises';

import mongoose from 'mongoose';
import type { Logger } from 'pino';

export type DatabaseState = 'connected' | 'connecting' | 'disconnected';

export interface ConnectOptions {
  uri: string;
  logger: Logger;
  /** Attempts before giving up on the initial connection. */
  maxAttempts?: number;
  /** Delay before the first retry; doubles on every further attempt. */
  initialRetryDelayMs?: number;
}

/** Hides credentials so connection strings can be logged safely. */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}

let listenersRegistered = false;

function registerConnectionListeners(logger: Logger): void {
  if (listenersRegistered) return;
  listenersRegistered = true;
  const { connection } = mongoose;
  connection.on('connected', () => logger.info('MongoDB connected'));
  connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  connection.on('error', (error: unknown) => logger.error({ err: error }, 'MongoDB connection error'));
}

/**
 * Connects to MongoDB, retrying the initial connection with exponential backoff. After the first
 * successful connection the driver handles reconnects on its own.
 */
export async function connectDatabase({
  uri,
  logger,
  maxAttempts = 5,
  initialRetryDelayMs = 1_000,
}: ConnectOptions): Promise<void> {
  mongoose.set('strictQuery', true);
  registerConnectionListeners(logger);

  for (let attempt = 1; ; attempt += 1) {
    try {
      logger.info({ uri: redactMongoUri(uri), attempt }, 'Connecting to MongoDB');
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000, maxPoolSize: 10 });
      return;
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      const delayMs = initialRetryDelayMs * 2 ** (attempt - 1);
      logger.warn({ err: error, attempt, delayMs }, 'MongoDB connection failed — retrying');
      await sleep(delayMs);
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function getDatabaseState(): DatabaseState {
  switch (mongoose.connection.readyState) {
    case mongoose.ConnectionStates.connected:
      return 'connected';
    case mongoose.ConnectionStates.connecting:
      return 'connecting';
    default:
      return 'disconnected';
  }
}
