import type { TrackedWebsiteDto, WebsiteSessionDto } from '@stilltime/shared';
import type { Types } from 'mongoose';

import type { TrackedWebsite } from '../models/tracked-website.model.js';
import type { WebsiteSession } from '../models/website-session.model.js';

type WithId<T> = T & { _id: Types.ObjectId };

export function toWebsiteDto(website: WithId<TrackedWebsite>): TrackedWebsiteDto {
  return {
    id: website._id.toString(),
    domain: website.domain,
    displayName: website.displayName,
    faviconUrl: website.faviconUrl ?? null,
    isEnabled: website.isEnabled,
    createdAt: website.createdAt.toISOString(),
    updatedAt: website.updatedAt.toISOString(),
  };
}

export function toSessionDto(session: WithId<WebsiteSession>): WebsiteSessionDto {
  return {
    id: session._id.toString(),
    clientSessionId: session.clientSessionId,
    websiteId: session.websiteId ? session.websiteId.toString() : null,
    domain: session.domain,
    websiteName: session.websiteName,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    durationSeconds: session.durationSeconds,
    date: session.date,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
