import { pino, type Logger, type LoggerOptions } from 'pino';

import type { LogLevel } from '../config/env.js';

export type { Logger } from 'pino';

function isResolvable(specifier: string): boolean {
  try {
    import.meta.resolve(specifier);
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON logs by default (production-friendly); human-readable logs when `pretty` is requested and
 * pino-pretty is installed (it is a dev dependency).
 */
export function createLogger({ level, pretty }: { level: LogLevel; pretty: boolean }): Logger {
  const options: LoggerOptions = {
    level,
    // Never log credentials, even if a future middleware attaches raw headers to a log line.
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], remove: true },
  };

  if (pretty && isResolvable('pino-pretty')) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    });
  }
  return pino(options);
}

/** A logger that discards everything (tests). */
export const silentLogger: Logger = pino({ level: 'silent' });
