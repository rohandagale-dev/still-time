import type { AuthConfig } from '../config/env.js';
import type { AuthStrategy } from './types.js';

/**
 * Local development only: attributes every request to one isolated, configured user.
 * `loadConfig` refuses this mode when NODE_ENV=production.
 */
export function createDevelopmentAuthStrategy(devUserId: string): AuthStrategy {
  return {
    name: 'development',
    authenticate: () => ({ userId: devUserId, method: 'development' }),
  };
}

/** Used when no strategy is configured: every request is rejected (fail closed). */
export const denyAllAuthStrategy: AuthStrategy = {
  name: 'none',
  authenticate: () => null,
};

export function createAuthStrategy(config: AuthConfig): AuthStrategy {
  switch (config.mode) {
    case 'development':
      return createDevelopmentAuthStrategy(config.devUserId);
    case 'none':
      return denyAllAuthStrategy;
  }
}
