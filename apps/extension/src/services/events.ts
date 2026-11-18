/**
 * Change notifications from the service worker to open extension pages (popup), over a
 * same-origin BroadcastChannel. Fire-and-forget: if no page is open, nobody listens.
 */
const CHANNEL_NAME = 'stilltime:events';

export type ExtensionEvent = { type: 'sessions-changed' };

export function broadcastEvent(event: ExtensionEvent): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(event);
    channel.close();
  } catch {
    // Notifications are best-effort; pages also refresh on their own schedule.
  }
}

export function subscribeToEvents(handler: (event: ExtensionEvent) => void): () => void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (message: MessageEvent<ExtensionEvent>) => handler(message.data);
  return () => channel.close();
}
