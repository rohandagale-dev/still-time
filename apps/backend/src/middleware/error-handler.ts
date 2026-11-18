import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

import { sendError } from '../utils/api-response.js';
import { AppError } from '../utils/errors.js';
import type { Logger } from '../utils/logger.js';
import { formatZodIssues } from '../utils/validation.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Errors raised by body-parser (malformed JSON, payload too large, …). */
function fromHttpError(error: unknown): AppError | null {
  if (!isRecord(error) || error['expose'] !== true) return null;
  const status = typeof error['status'] === 'number' ? error['status'] : null;
  if (status === null || status < 400 || status >= 500) return null;
  if (status === 413) return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  if (error['type'] === 'entity.parse.failed') return AppError.badRequest('Request body is not valid JSON');
  return AppError.badRequest(typeof error['message'] === 'string' ? error['message'] : 'Bad request');
}

const isDuplicateKeyError = (error: unknown): boolean => isRecord(error) && error['code'] === 11000;

const isDatabaseUnavailable = (error: unknown): boolean =>
  error instanceof mongoose.Error.MongooseServerSelectionError ||
  error instanceof mongoose.mongo.MongoNetworkError ||
  error instanceof mongoose.mongo.MongoNotConnectedError;

/** Maps any thrown value onto an {@link AppError}. Unknown errors become opaque 500s. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return AppError.validation(formatZodIssues(error));
  if (error instanceof mongoose.Error.CastError) return AppError.badRequest(`Invalid value for "${error.path}"`);
  if (error instanceof mongoose.Error.ValidationError) {
    return AppError.validation(
      Object.values(error.errors).map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  if (isDuplicateKeyError(error)) return AppError.conflict('Resource already exists');
  if (isDatabaseUnavailable(error)) return AppError.serviceUnavailable('Database is unavailable');
  return fromHttpError(error) ?? new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
}

/** Centralized error handler: the only place that turns errors into HTTP responses. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logger.error({ err: error, reqId: req.id }, 'Unhandled error while processing request');
    }
    sendError(res, appError.status, {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    });
  };
}

export const notFoundHandler: RequestHandler = (req) => {
  throw AppError.notFound(`Route ${req.method} ${req.path}`);
};
