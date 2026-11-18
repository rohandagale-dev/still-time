import { Schema, model } from 'mongoose';

export interface WebsiteBreakdownEntry {
  domain: string;
  websiteName: string;
  totalSeconds: number;
  sessions: number;
}

/**
 * Per-user, per-day rollup — a derived cache. It is recomputed from WebsiteSession (the source
 * of truth) whenever sessions for that day are stored, so it can always be rebuilt.
 */
export interface DailyUsage {
  userId: string;
  date: string;
  totalTrackedSeconds: number;
  totalSessions: number;
  /** Sorted by totalSeconds, descending. */
  websiteBreakdown: WebsiteBreakdownEntry[];
  computedAt: Date;
}

const breakdownSchema = new Schema<WebsiteBreakdownEntry>(
  {
    domain: { type: String, required: true },
    websiteName: { type: String, required: true },
    totalSeconds: { type: Number, required: true, min: 0 },
    sessions: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const dailyUsageSchema = new Schema<DailyUsage>(
  {
    userId: { type: String, required: true },
    date: { type: String, required: true },
    totalTrackedSeconds: { type: Number, required: true, min: 0 },
    totalSessions: { type: Number, required: true, min: 0 },
    websiteBreakdown: { type: [breakdownSchema], default: [] },
    computedAt: { type: Date, required: true },
  },
  { versionKey: false },
);

dailyUsageSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DailyUsageModel = model<DailyUsage>('DailyUsage', dailyUsageSchema);
