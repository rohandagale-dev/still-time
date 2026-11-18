import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type AuthConfig = { mode: 'development'; devUserId: string } | { mode: 'none' };

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  mongoUri: string;
  auth: AuthConfig;
  /** Exact origins, or `<scheme>://*` to allow every origin of a scheme (e.g. chrome-extension). */
  corsOrigins: string[];
  logLevel: LogLevel;
  version: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** `.env` files, highest precedence first. Paths are identical from `src/config` and `dist/config`. */
const ENV_FILES = [
  fileURLToPath(new URL('../../.env', import.meta.url)), // apps/backend/.env
  fileURLToPath(new URL('../../../../.env', import.meta.url)), // repository root .env
];

/** Loads `.env` files without overriding variables that are already set in the environment. */
export function loadEnvFiles(files: readonly string[] = ENV_FILES): void {
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
    }
  }
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().trim().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    MONGODB_URI: z
      .string()
      .trim()
      .regex(/^mongodb(\+srv)?:\/\/.+/, 'must be a mongodb:// or mongodb+srv:// connection string'),
    AUTH_MODE: z.enum(['development']).optional(),
    DEV_USER_ID: z.string().trim().min(1).max(128).optional(),
    CORS_ORIGINS: z.string().default(''),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE === 'development' && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'AUTH_MODE=development is refused when NODE_ENV=production',
      });
    }
    if (env.AUTH_MODE === 'development' && !env.DEV_USER_ID) {
      ctx.addIssue({ code: 'custom', path: ['DEV_USER_ID'], message: 'required when AUTH_MODE=development' });
    }
  });

function readPackageVersion(): string {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    const version: unknown = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof version === 'string' ? version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Validates the environment and returns a typed, immutable configuration. Throws on error. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  const parsed = result.data;

  const auth: AuthConfig =
    parsed.AUTH_MODE === 'development' && parsed.DEV_USER_ID
      ? { mode: 'development', devUserId: parsed.DEV_USER_ID }
      : { mode: 'none' };

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    mongoUri: parsed.MONGODB_URI,
    auth,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    logLevel: parsed.LOG_LEVEL,
    version: readPackageVersion(),
  });
}
