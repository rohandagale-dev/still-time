import {
  getWebsiteDisplayName,
  type TrackedWebsiteDto,
  type WebsiteSyncResult,
  type WebsitesSyncResponse,
} from '@stilltime/shared';
import type { z } from 'zod';

import { TrackedWebsiteModel } from '../models/tracked-website.model.js';
import { AppError } from '../utils/errors.js';
import { describeFirstIssue } from '../utils/validation.js';
import { websiteSyncItemSchema, type createWebsiteSchema, type updateWebsiteSchema } from '../validators/website.validators.js';

import { toWebsiteDto } from './mappers.js';

type CreateWebsiteInput = z.output<typeof createWebsiteSchema>;
type UpdateWebsiteInput = z.output<typeof updateWebsiteSchema>;

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

export async function listWebsites(userId: string, filter: { enabled?: boolean | undefined } = {}): Promise<TrackedWebsiteDto[]> {
  const websites = await TrackedWebsiteModel.find({
    userId,
    deletedAt: null,
    ...(filter.enabled === undefined ? {} : { isEnabled: filter.enabled }),
  })
    .sort({ createdAt: 1, domain: 1 })
    .lean();
  return websites.map(toWebsiteDto);
}

/**
 * Registers a website. Fails with 409 if it is already tracked; re-adding a previously removed
 * website restores it (same id, so existing sessions stay linked).
 */
export async function createWebsite(userId: string, input: CreateWebsiteInput, now = new Date()): Promise<TrackedWebsiteDto> {
  const fields = {
    displayName: input.displayName ?? getWebsiteDisplayName(input.domain),
    faviconUrl: input.faviconUrl ?? null,
    isEnabled: input.isEnabled ?? true,
    deletedAt: null,
    clientUpdatedAt: now,
  };

  const revived = await TrackedWebsiteModel.findOneAndUpdate(
    { userId, domain: input.domain, deletedAt: { $ne: null } },
    { $set: fields },
    { returnDocument: 'after' },
  ).lean();
  if (revived) return toWebsiteDto(revived);

  try {
    const created = await TrackedWebsiteModel.create({ userId, domain: input.domain, ...fields });
    return toWebsiteDto(created.toObject());
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw AppError.conflict(`${input.domain} is already being tracked`, { domain: input.domain });
    }
    throw error;
  }
}

export async function updateWebsite(userId: string, id: string, input: UpdateWebsiteInput, now = new Date()): Promise<TrackedWebsiteDto> {
  const updated = await TrackedWebsiteModel.findOneAndUpdate(
    { _id: id, userId, deletedAt: null },
    { $set: { ...input, clientUpdatedAt: now } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  if (!updated) throw AppError.notFound('Website');
  return toWebsiteDto(updated);
}

/** Soft-deletes a website. Its sessions are kept: history stays intact. */
export async function deleteWebsite(userId: string, id: string, now = new Date()): Promise<{ id: string; deleted: true }> {
  const deleted = await TrackedWebsiteModel.findOneAndUpdate(
    { _id: id, userId, deletedAt: null },
    { $set: { deletedAt: now, clientUpdatedAt: now } },
  ).lean();
  if (!deleted) throw AppError.notFound('Website');
  return { id, deleted: true };
}

/**
 * Offline-first configuration sync. Each item carries the client's full state for one website
 * and the time it changed; the newest change wins (last-write-wins). Re-sending an item is safe:
 * an identical version reports `applied` again without changing anything.
 */
export async function syncWebsites(userId: string, items: readonly unknown[]): Promise<WebsitesSyncResponse> {
  const results: WebsiteSyncResult[] = [];

  for (const raw of items) {
    const parsed = websiteSyncItemSchema.safeParse(raw);
    if (!parsed.success) {
      const domain = typeof (raw as { domain?: unknown })?.domain === 'string' ? (raw as { domain: string }).domain : '';
      results.push({ domain, status: 'rejected', reason: describeFirstIssue(parsed.error) });
      continue;
    }
    const item = parsed.data;
    const version = new Date(item.updatedAt);

    try {
      // Matches only if the stored version is older; otherwise the upsert collides with the
      // unique (userId, domain) index and we know the server already holds a newer change.
      await TrackedWebsiteModel.updateOne(
        { userId, domain: item.domain, clientUpdatedAt: { $lt: version } },
        {
          $set: {
            displayName: item.displayName,
            faviconUrl: item.faviconUrl,
            isEnabled: item.isEnabled,
            deletedAt: item.deleted ? version : null,
            clientUpdatedAt: version,
          },
        },
        { upsert: true, runValidators: true },
      );
      results.push({ domain: item.domain, status: 'applied' });
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const current = await TrackedWebsiteModel.findOne({ userId, domain: item.domain }, { clientUpdatedAt: 1 }).lean();
      const sameVersion = current?.clientUpdatedAt.getTime() === version.getTime();
      results.push({ domain: item.domain, status: sameVersion ? 'applied' : 'stale' });
    }
  }

  return { results };
}
