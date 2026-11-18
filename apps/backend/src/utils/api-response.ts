import type { ApiErrorBody, ApiFailure, ApiSuccess } from '@stilltime/shared';
import type { Response } from 'express';

/** Sends `{ success: true, data }`. All successful responses go through here. */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const body: ApiSuccess<T> = { success: true, data };
  res.status(status).json(body);
}

/** Sends `{ success: false, error }`. All error responses go through here. */
export function sendError(res: Response, status: number, error: ApiErrorBody): void {
  const body: ApiFailure = { success: false, error };
  res.status(status).json(body);
}
