import type { ExtensionStorage } from '@/services/storage';
import type {
  ActiveSession,
  AddWebsiteInput,
  RuntimeRequest,
  RuntimeResponse,
  RuntimeResponseMap,
  Settings,
  SyncStatus,
} from '@/types';
import type { SerialQueue } from '@/utils/serial';

import { RequestError } from './errors';
import { MAX_WEBSITES_PER_REQUEST, addWebsites, mergeSettings, removeWebsite, setWebsiteEnabled } from './website-registry';

/** What the router needs from the tracking engine. */
export interface TrackingControl {
  /** Re-derives what should be tracked right now and applies it. Resolves with the active session. */
  reconcile(reason: string): Promise<ActiveSession | null>;
  /** Applies settings that affect tracking (e.g. the idle detection interval). */
  applySettings(settings: Settings): void;
}

/** What the router needs from the sync manager. */
export interface SyncControl {
  /** Schedules a sync soon (fire-and-forget; failures are retried with backoff). */
  requestSync(reason: string): void;
  /** Runs a sync now and resolves with the resulting status. */
  syncNow(): Promise<SyncStatus>;
  onSettingsChanged(previous: Settings, next: Settings): Promise<void>;
}

export interface RouterDependencies {
  /** The worker-wide serial queue: every state mutation runs through it. */
  run: SerialQueue;
  storage: ExtensionStorage;
  tracking: TrackingControl;
  sync: SyncControl;
  now: () => number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const badRequest = (message: string): RequestError => new RequestError('bad-request', message);

const requireDomain = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) throw badRequest('A website domain is required.');
  return value;
};

/** Validates an incoming message. Messages are only accepted from this extension's own pages. */
export function parseRequest(message: unknown): RuntimeRequest {
  if (!isRecord(message) || typeof message['type'] !== 'string') throw badRequest('Unsupported request.');
  switch (message['type']) {
    case 'websites/add': {
      const websites = message['websites'];
      if (!Array.isArray(websites) || websites.length === 0) throw badRequest('Select at least one website.');
      if (websites.length > MAX_WEBSITES_PER_REQUEST) {
        throw badRequest(`At most ${MAX_WEBSITES_PER_REQUEST} websites can be added at once.`);
      }
      return {
        type: 'websites/add',
        websites: websites.map(
          (entry): AddWebsiteInput =>
            isRecord(entry)
              ? {
                  domain: typeof entry['domain'] === 'string' ? entry['domain'] : '',
                  displayName: typeof entry['displayName'] === 'string' ? entry['displayName'] : undefined,
                  faviconUrl: typeof entry['faviconUrl'] === 'string' ? entry['faviconUrl'] : null,
                }
              : { domain: '' },
        ),
      };
    }
    case 'websites/remove':
      return { type: 'websites/remove', domain: requireDomain(message['domain']) };
    case 'websites/set-enabled':
      if (typeof message['enabled'] !== 'boolean') throw badRequest('Missing enabled flag.');
      return { type: 'websites/set-enabled', domain: requireDomain(message['domain']), enabled: message['enabled'] };
    case 'settings/update':
      if (!isRecord(message['patch'])) throw badRequest('Missing settings.');
      return { type: 'settings/update', patch: message['patch'] as Partial<Settings> };
    case 'tracking/refresh':
      return { type: 'tracking/refresh' };
    case 'sync/run':
      return { type: 'sync/run' };
    default:
      throw badRequest('Unsupported request.');
  }
}

/**
 * Handles requests from extension pages. Every mutation is persisted before the response is sent,
 * so the popup only ever reports success for changes that are actually saved.
 */
export function createMessageRouter({ run, storage, tracking, sync, now }: RouterDependencies) {
  async function handle(request: RuntimeRequest): Promise<RuntimeResponseMap[RuntimeRequest['type']]> {
    switch (request.type) {
      case 'websites/add': {
        const result = await run(async () => {
          const next = addWebsites(await storage.getRegistry(), request.websites, now());
          if (next.added.length > 0) await storage.setRegistry(next.registry);
          return { added: next.added, skipped: next.skipped };
        });
        if (result.added.length > 0) {
          await tracking.reconcile('websites-added');
          sync.requestSync('websites-changed');
        }
        return result;
      }

      case 'websites/remove': {
        const result = await run(async () => {
          const next = removeWebsite(await storage.getRegistry(), request.domain, now());
          if (next.removed) await storage.setRegistry(next.registry);
          return { removed: next.removed };
        });
        if (result.removed) {
          await tracking.reconcile('website-removed');
          sync.requestSync('websites-changed');
        }
        return result;
      }

      case 'websites/set-enabled': {
        const result = await run(async () => {
          const next = setWebsiteEnabled(await storage.getRegistry(), request.domain, request.enabled, now());
          if (next.changed) await storage.setRegistry(next.registry);
          return next;
        });
        if (result.changed) {
          await tracking.reconcile(request.enabled ? 'website-enabled' : 'website-disabled');
          sync.requestSync('websites-changed');
        }
        return result.website;
      }

      case 'settings/update': {
        const { previous, next } = await run(async () => {
          const current = await storage.getSettings();
          const merged = mergeSettings(current, request.patch);
          await storage.setSettings(merged);
          return { previous: current, next: merged };
        });
        tracking.applySettings(next);
        await tracking.reconcile('settings-changed');
        await sync.onSettingsChanged(previous, next);
        return next;
      }

      case 'tracking/refresh':
        return { active: await tracking.reconcile('popup-opened') };

      case 'sync/run':
        return sync.syncNow();
    }
  }

  return async function route(message: unknown): Promise<RuntimeResponse<unknown>> {
    try {
      return { ok: true, data: await handle(parseRequest(message)) };
    } catch (error) {
      if (error instanceof RequestError) return { ok: false, error: { code: error.code, message: error.message } };
      console.error('[stilltime] request failed', error);
      const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
      return { ok: false, error: { code: 'internal', message: `Your change could not be saved${detail}.` } };
    }
  };
}
