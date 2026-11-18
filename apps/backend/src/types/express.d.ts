import type { AuthContext } from '../auth/types.js';

declare global {
  namespace Express {
    interface Request {
      /** Correlation id, set by the request logger (echoed in the `x-request-id` header). */
      id: string;
      /** Set by the `authenticate` middleware on authenticated routes. */
      auth?: AuthContext;
    }
  }
}

export {};
