import { DailyUsageModel, type DailyUsage, type WebsiteBreakdownEntry } from '../models/daily-usage.model.js';
import { WebsiteSessionModel } from '../models/website-session.model.js';

interface DayAggregate {
  _id: string;
  totalTrackedSeconds: number;
  totalSessions: number;
  websiteBreakdown: WebsiteBreakdownEntry[];
}

/**
 * Recomputes the DailyUsage rollups of the given days from WebsiteSession, the source of truth.
 * Idempotent: the result depends only on the stored sessions, so running it again (or
 * concurrently with another upload for the same day) converges on the correct totals.
 */
export async function recomputeDailyUsage(userId: string, dates: Iterable<string>): Promise<void> {
  const days = [...new Set(dates)];
  if (days.length === 0) return;

  const aggregates = await WebsiteSessionModel.aggregate<DayAggregate>([
    { $match: { userId, date: { $in: days } } },
    {
      $group: {
        _id: { date: '$date', domain: '$domain' },
        websiteName: { $last: '$websiteName' },
        totalSeconds: { $sum: '$durationSeconds' },
        sessions: { $sum: 1 },
      },
    },
    { $sort: { totalSeconds: -1, '_id.domain': 1 } },
    {
      $group: {
        _id: '$_id.date',
        totalTrackedSeconds: { $sum: '$totalSeconds' },
        totalSessions: { $sum: '$sessions' },
        websiteBreakdown: {
          $push: { domain: '$_id.domain', websiteName: '$websiteName', totalSeconds: '$totalSeconds', sessions: '$sessions' },
        },
      },
    },
  ]);

  const byDay = new Map(aggregates.map((aggregate) => [aggregate._id, aggregate]));
  const computedAt = new Date();
  await DailyUsageModel.bulkWrite(
    days.map((date) => {
      const aggregate = byDay.get(date);
      if (!aggregate) return { deleteOne: { filter: { userId, date } } };
      const update: Omit<DailyUsage, 'userId' | 'date'> = {
        totalTrackedSeconds: aggregate.totalTrackedSeconds,
        totalSessions: aggregate.totalSessions,
        websiteBreakdown: aggregate.websiteBreakdown,
        computedAt,
      };
      return { updateOne: { filter: { userId, date }, update: { $set: update }, upsert: true } };
    }),
    { ordered: false },
  );
}
