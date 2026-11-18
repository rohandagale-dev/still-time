import { describe, expect, it, vi } from 'vitest';

import { ApiRequestError, createTrackingApi } from '@/services/tracking-api';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const apiWith = (fetchImpl: typeof fetch) =>
  createTrackingApi({ baseUrl: 'http://api.test/api', clientId: 'client-1', fetch: fetchImpl });

const failureOf = async (promise: Promise<unknown>): Promise<ApiRequestError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiRequestError) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
};

describe('tracking API client', () => {
  it('posts JSON with the client id and unwraps the success envelope', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { success: true, data: { accepted: ['a'], duplicates: [], rejected: [] } }));
    const result = await apiWith(fetchMock).syncSessions([]);
    expect(result).toEqual({ accepted: ['a'], duplicates: [], rejected: [] });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/sessions/sync');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect((init.headers as Record<string, string>)['x-stilltime-client-id']).toBe('client-1');
    expect(JSON.parse(init.body as string)).toEqual({ sessions: [] });
  });

  it('classifies network failures and timeouts', async () => {
    const offline = await failureOf(apiWith(async () => Promise.reject(new TypeError('Failed to fetch'))).health());
    expect(offline.kind).toBe('network');
    const slow = await failureOf(
      apiWith(async () => Promise.reject(new DOMException('signal timed out', 'TimeoutError'))).health(),
    );
    expect(slow.kind).toBe('timeout');
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'server'],
    [503, 'server'],
    [400, 'client'],
  ] as const)('maps HTTP %i to %s and surfaces the API error message', async (status, kind) => {
    const error = await failureOf(
      apiWith(async () => jsonResponse(status, { success: false, error: { code: 'X', message: 'Nope' } })).health(),
    );
    expect(error).toMatchObject({ kind, status, message: 'Nope' });
  });

  it('rejects responses that are not the API envelope', async () => {
    const html = await failureOf(apiWith(async () => new Response('<html>proxy</html>', { status: 200 })).health());
    expect(html.kind).toBe('invalid');
    const wrongShape = await failureOf(apiWith(async () => jsonResponse(200, { ok: true })).health());
    expect(wrongShape.kind).toBe('invalid');
  });
});
