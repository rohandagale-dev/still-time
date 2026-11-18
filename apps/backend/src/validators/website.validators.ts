import { MAX_WEBSITES_PER_SYNC } from '@stilltime/shared';
import { z } from 'zod';

import { displayNameSchema, domainSchema, faviconUrlSchema } from './common.validators.js';

export const createWebsiteSchema = z.strictObject({
  domain: domainSchema,
  displayName: displayNameSchema.optional(),
  faviconUrl: faviconUrlSchema.optional(),
  isEnabled: z.boolean().optional(),
});

export const updateWebsiteSchema = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    faviconUrl: faviconUrlSchema.optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'provide at least one field to update');

export const listWebsitesQuerySchema = z.object({
  enabled: z.enum(['true', 'false']).optional(),
});

export const websiteSyncItemSchema = z.object({
  domain: domainSchema,
  displayName: displayNameSchema,
  faviconUrl: faviconUrlSchema,
  isEnabled: z.boolean(),
  deleted: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});

/** The envelope is validated strictly; items are validated one by one so one bad item never blocks the rest. */
export const websitesSyncSchema = z.object({
  websites: z.array(z.unknown()).min(1).max(MAX_WEBSITES_PER_SYNC),
});
