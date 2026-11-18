export interface WebsiteUsage {
  domain: string;
  websiteName: string;
  totalSeconds: number;
  sessions: number;
}

export interface TodayAnalytics {
  date: string;
  totalTrackedSeconds: number;
  totalSessions: number;
  /** Number of distinct websites with usage on this day. */
  websiteCount: number;
  mostUsed: WebsiteUsage | null;
  /** Sorted by `totalSeconds`, descending. */
  websites: WebsiteUsage[];
}

export interface DailyTotal {
  date: string;
  totalTrackedSeconds: number;
  totalSessions: number;
}

export interface WeeklyAnalytics {
  startDate: string;
  endDate: string;
  totalTrackedSeconds: number;
  averageDailySeconds: number;
  /** Exactly seven entries, oldest first; days without usage are zero-filled. */
  days: DailyTotal[];
}

export interface WebsitesAnalytics {
  from: string;
  to: string;
  /** Sorted by `totalSeconds`, descending. */
  websites: WebsiteUsage[];
}
