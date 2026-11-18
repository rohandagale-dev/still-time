import type { RuntimeRequest, RuntimeRequestType, RuntimeResponse, RuntimeResponseMap } from '@/types';

/** A request to the service worker failed (the worker reported an error or could not be reached). */
export class RuntimeRequestError extends Error {
  override name = 'RuntimeRequestError';
  readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

/**
 * Sends a typed request to the service worker, which is the single writer of extension state.
 * Resolves with the response data or rejects with a {@link RuntimeRequestError}; it never
 * reports success unless the worker confirmed the change was persisted.
 */
export async function sendRuntimeRequest<T extends RuntimeRequestType>(
  request: Extract<RuntimeRequest, { type: T }>,
): Promise<RuntimeResponseMap[T]> {
  let response: RuntimeResponse<RuntimeResponseMap[T]> | undefined;
  try {
    response = (await chrome.runtime.sendMessage(request)) as RuntimeResponse<RuntimeResponseMap[T]> | undefined;
  } catch (error) {
    throw new RuntimeRequestError(
      'Stilltime’s background service is not responding. Please try again.',
      'unreachable',
      { cause: error },
    );
  }
  if (!response || typeof response !== 'object' || !('ok' in response)) {
    throw new RuntimeRequestError('Stilltime’s background service returned no response.', 'no-response');
  }
  if (!response.ok) throw new RuntimeRequestError(response.error.message, response.error.code);
  return response.data;
}

/** Human-readable message for any error thrown by a runtime request. */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
