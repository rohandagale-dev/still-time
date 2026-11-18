import type { ApiErrorCode } from '@stilltime/shared';

/**
 * An error that maps directly onto an HTTP response. Throw it anywhere in a request handler; the
 * centralized error handler turns it into the standard error envelope.
 */
export class AppError extends Error {
  override name = 'AppError';
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static validation(details: unknown, message = 'Request validation failed'): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static notFound(resource = 'Resource'): AppError {
    return new AppError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string, details?: unknown): AppError {
    return new AppError(409, 'CONFLICT', message, details);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable'): AppError {
    return new AppError(503, 'SERVICE_UNAVAILABLE', message);
  }
}
