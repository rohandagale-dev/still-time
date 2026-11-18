import { MAX_DISPLAY_NAME_LENGTH, MAX_DOMAIN_LENGTH, MAX_FAVICON_URL_LENGTH } from '@stilltime/shared';
import { Schema, model, type HydratedDocument } from 'mongoose';

export interface TrackedWebsite {
  /** Opaque owner id from the auth strategy. Every query is scoped by it. */
  userId: string;
  /** Canonical website key (normalized with @stilltime/shared). */
  domain: string;
  displayName: string;
  faviconUrl: string | null;
  isEnabled: boolean;
  /** Soft delete: kept so offline clients' removals and re-additions resolve by recency. */
  deletedAt: Date | null;
  /** Version of the latest applied change (client clock for synced changes). Last write wins. */
  clientUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type TrackedWebsiteDocument = HydratedDocument<TrackedWebsite>;

const trackedWebsiteSchema = new Schema<TrackedWebsite>(
  {
    userId: { type: String, required: true },
    domain: { type: String, required: true, maxlength: MAX_DOMAIN_LENGTH },
    displayName: { type: String, required: true, trim: true, maxlength: MAX_DISPLAY_NAME_LENGTH },
    faviconUrl: { type: String, default: null, maxlength: MAX_FAVICON_URL_LENGTH },
    isEnabled: { type: Boolean, required: true, default: true },
    deletedAt: { type: Date, default: null },
    clientUpdatedAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

// One record per website per user — the database enforces "no duplicate domains".
trackedWebsiteSchema.index({ userId: 1, domain: 1 }, { unique: true });
trackedWebsiteSchema.index({ userId: 1, deletedAt: 1, createdAt: 1 });

export const TrackedWebsiteModel = model<TrackedWebsite>('TrackedWebsite', trackedWebsiteSchema);
