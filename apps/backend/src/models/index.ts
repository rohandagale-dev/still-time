import { DailyUsageModel } from './daily-usage.model.js';
import { TrackedWebsiteModel } from './tracked-website.model.js';
import { WebsiteSessionModel } from './website-session.model.js';

export { DailyUsageModel, TrackedWebsiteModel, WebsiteSessionModel };

/** Builds every index declared on the models (idempotent; run at startup and in tests). */
export async function ensureIndexes(): Promise<void> {
  await Promise.all([TrackedWebsiteModel.init(), WebsiteSessionModel.init(), DailyUsageModel.init()]);
}
