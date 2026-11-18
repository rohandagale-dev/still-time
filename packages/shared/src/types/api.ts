/** Machine-readable error codes returned by the API. */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

/** Every successful response is wrapped in this envelope. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

/** Every failed response is wrapped in this envelope. */
export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface HealthStatus {
  status: 'ok' | 'degraded';
  database: 'connected' | 'connecting' | 'disconnected';
  uptimeSeconds: number;
  version: string;
}
