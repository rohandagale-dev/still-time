import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_DOMAIN_LENGTH,
  MAX_SESSION_DURATION_SECONDS,
  MAX_SESSION_ID_LENGTH,
  SESSION_STATUSES,
  type SessionStatus,
} from '@stilltime/shared';
import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/** One usage session — the source of truth for every statistic. */
export interface WebsiteSession {
  userId: string;
  /** The tracked website at upload time (null if it was not registered on the server). */
  websiteId: Types.ObjectId | null;
  /** Client-generated session id: the idempotency key of uploads. */
  clientSessionId: string;
  /** Installation that recorded the session (diagnostics only). */
  clientId: string | null;
  domain: string;
  websiteName: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  /** Calendar day (YYYY-MM-DD) in the client's time zone. */
  date: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type WebsiteSessionDocument = HydratedDocument<WebsiteSession>;

const websiteSessionSchema = new Schema<WebsiteSession>(
  {
    userId: { type: String, required: true },
    websiteId: { type: Schema.Types.ObjectId, ref: 'TrackedWebsite', default: null },
    clientSessionId: { type: String, required: true, maxlength: MAX_SESSION_ID_LENGTH },
    clientId: { type: String, default: null, maxlength: 64 },
    domain: { type: String, required: true, maxlength: MAX_DOMAIN_LENGTH },
    websiteName: { type: String, required: true, maxlength: MAX_DISPLAY_NAME_LENGTH },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, required: true },
    durationSeconds: { type: Number, required: true, min: 0, max: MAX_SESSION_DURATION_SECONDS },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    status: { type: String, required: true, enum: SESSION_STATUSES },
  },
  { timestamps: true, versionKey: false },
);

// Idempotent uploads: a session can exist only once per user, however often it is sent.
websiteSessionSchema.index({ userId: 1, clientSessionId: 1 }, { unique: true });
// Date-based statistics and per-website breakdowns.
websiteSessionSchema.index({ userId: 1, date: 1 });
websiteSessionSchema.index({ userId: 1, domain: 1, date: 1 });
// Recent-first listing.
websiteSessionSchema.index({ userId: 1, startedAt: -1 });

export const WebsiteSessionModel = model<WebsiteSession>('WebsiteSession', websiteSessionSchema);
