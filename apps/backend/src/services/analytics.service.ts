import {
  addDaysToDateKey,
  dateKeyRange,
  type TodayAnalytics,
  type WebsiteUsage,
  type WebsitesAnalytics,
  type WeeklyAnalytics,
} from '@stilltime/shared';

import { DailyUsageModel } from '../models/daily-usage.model.js';
import { WebsiteSessionModel } from '../models/website-session.model.js';

const toUsage = (entry: { domain: string; websiteName: string; totalSeconds: number; sessions: number }): WebsiteUsage => ({
  domain: entry.domain,
  websiteName: entry.websiteName,
  totalSeconds: entry.totalSeconds,
  sessions: entry.sessions,
});

/** One day's totals and per-website breakdown (served from the DailyUsage rollup). */
export async function getDayAnalytics(userId: string, date: string): Promise<TodayAnalytics> {
  const day = await DailyUsageModel.findOne({ userId, date }).lean();
  const websites = (day?.websiteBreakdown ?? []).map(toUsage);
  return {
    date,
    totalTrackedSeconds: day?.totalTrackedSeconds ?? 0,
    totalSessions: day?.totalSessions ?? 0,
    websiteCount: websites.length,
    mostUsed: websites.find((website) => website.totalSeconds > 0) ?? null,
    websites,
  };
}

/** Seven daily totals ending on `endDate` (inclusive), zero-filled. */
export async function getWeeklyAnalytics(userId: string, endDate: string): Promise<WeeklyAnalytics> {
  const startDate = addDaysToDateKey(endDate, -6);
  const rows = await DailyUsageModel.find(
    { userId, date: { $gte: startDate, $lte: endDate } },
    { date: 1, totalTrackedSeconds: 1, totalSessions: 1 },
  ).lean();
  const byDate = new Map(rows.map((row) => [row.date, row]));

  const days = dateKeyRange(startDate, endDate).map((date) => ({
    date,
    totalTrackedSeconds: byDate.get(date)?.totalTrackedSeconds ?? 0,
    totalSessions: byDate.get(date)?.totalSessions ?? 0,
  }));
  const totalTrackedSeconds = days.reduce((sum, day) => sum + day.totalTrackedSeconds, 0);
  return {
    startDate,
    endDate,
    totalTrackedSeconds,
    averageDailySeconds: Math.round(totalTrackedSeconds / days.length),
    days,
  };
}

/** Per-website totals over an inclusive date range, computed directly from sessions. */
export async function getWebsitesAnalytics(userId: string, from: string, to: string): Promise<WebsitesAnalytics> {
  const rows = await WebsiteSessionModel.aggregate<{ _id: string; websiteName: string; totalSeconds: number; sessions: number }>([
    { $match: { userId, date: { $gte: from, $lte: to } } },
    { $sort: { startedAt: 1 } },
    {
      $group: {
        _id: '$domain',
        websiteName: { $last: '$websiteName' },
        totalSeconds: { $sum: '$durationSeconds' },
        sessions: { $sum: 1 },
      },
    },
    { $sort: { totalSeconds: -1, _id: 1 } },
  ]);
  return {
    from,
    to,
    websites: rows.map((row) => toUsage({ ...row, domain: row._id })),
  };
}
