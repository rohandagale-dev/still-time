/**
 * Runs async tasks one at a time, in submission order. The service worker funnels every state
 * mutation (tracking reconciliation, registry and settings changes) through one queue, so
 * read-modify-write sequences never interleave — which is what prevents duplicate or
 * overlapping sessions when several browser events arrive at once.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(() => task());
    tail = result.catch(() => undefined);
    return result;
  };
}

export type SerialQueue = ReturnType<typeof createSerialQueue>;
