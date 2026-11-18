import type { Browser, Page } from 'puppeteer-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  chromePath,
  clickText,
  launchChrome,
  openExtensionPage,
  readSessions,
  sendMessage,
  sleep,
  startBackend,
  startFakeWebsites,
} from './support';

/**
 * Full-system test of the production build: real Chrome, the built extension, the built API and
 * a real MongoDB. The steps build on each other and run in order.
 */
describe.skipIf(!chromePath)('Stilltime end to end', () => {
  let browser: Browser;
  let extensionId: string;
  let popup: Page;
  let pageErrors: string[];
  let sites: Awaited<ReturnType<typeof startFakeWebsites>>;
  let backend: Awaited<ReturnType<typeof startBackend>>;
  const tabs: Record<'alpha' | 'beta' | 'untracked', Page> = {} as never;

  const url = (host: string, path = '/') => `http://${host}:${sites.port}${path}`;

  beforeAll(async () => {
    [sites, backend] = await Promise.all([startFakeWebsites(), startBackend()]);
    ({ browser, extensionId } = await launchChrome());

    const open = async (target: string) => {
      const page = await browser.newPage();
      await page.goto(target);
      return page;
    };
    tabs.alpha = await open(url('www.alpha.test', '/watch?v=1'));
    await open(url('m.alpha.test', '/feed'));
    tabs.beta = await open(url('beta.test'));
    tabs.untracked = await open(url('gamma.test'));
    await open('chrome://version');

    ({ page: popup, errors: pageErrors } = await openExtensionPage(browser, extensionId));
    // Talk to this run's backend only — never to a developer's server on the default URL.
    await sendMessage(popup, { type: 'settings/update', patch: { apiBaseUrl: backend.apiBaseUrl } });
  }, 90_000);

  afterAll(async () => {
    await browser?.close();
    await Promise.all([sites?.close(), backend?.stop()]);
  });

  it('starts with the onboarding screen', async () => {
    await popup.waitForSelector('main');
    expect(await popup.$eval('main', (main) => main.textContent)).toContain('Choose what to track');
  });

  it('groups open tabs into websites and adds the selected ones', async () => {
    await clickText(popup, 'button', 'Add websites');
    await popup.waitForSelector('ul[aria-label="Open websites"]');
    const rows = await popup.$$eval('ul[aria-label="Open websites"] li', (items) =>
      items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
    );
    // www./m. tabs collapse into one website; chrome:// and extension pages are excluded.
    expect(rows).toEqual(['Alphaalpha.test2 tabs', 'Betabeta.test1 tab', 'Gammagamma.test1 tab']);

    await clickText(popup, 'ul[aria-label="Open websites"] label', 'Alpha');
    await clickText(popup, 'ul[aria-label="Open websites"] label', 'Beta');
    await clickText(popup, 'footer button', 'Add selected');
    await popup.waitForSelector('#tracked-websites-heading');

    const registry = await popup.evaluate(async () => (await chrome.storage.local.get('websites'))['websites']);
    expect(Object.keys(registry as object).sort()).toEqual(['alpha.test', 'beta.test']);
  });

  it('marks tracked websites as already added', async () => {
    await clickText(popup, 'button', 'Add website');
    await popup.waitForSelector('ul[aria-label="Open websites"]');
    const rows = await popup.$$eval('ul[aria-label="Open websites"] li', (items) => items.map((item) => item.textContent ?? ''));
    expect(rows.filter((row) => row.includes('Already added'))).toHaveLength(2);
    await popup.click('button[aria-label="Back"]');
    await popup.waitForSelector('#tracked-websites-heading');
  });

  it('tracks time on the active tab only, per website', async () => {
    await tabs.alpha.bringToFront();
    await sleep(2_500);
    await tabs.beta.bringToFront();
    await sleep(1_500);
    await tabs.untracked.bringToFront();
    await sleep(500);

    const { sessions, active } = await readSessions(popup);
    expect(active).toBeNull();
    expect(sessions.map((session) => session.domain)).toEqual(['alpha.test', 'beta.test']);
    const [alpha, beta] = sessions;
    expect(alpha?.durationSeconds).toBeGreaterThanOrEqual(2);
    expect(alpha?.durationSeconds).toBeLessThanOrEqual(4);
    expect(beta?.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(beta?.durationSeconds).toBeLessThanOrEqual(3);
  });

  it('continues a session across same-site navigation (SPA)', async () => {
    await tabs.alpha.bringToFront();
    await sleep(800);
    await tabs.alpha.evaluate(() => history.pushState({}, '', '/watch?v=2'));
    await sleep(800);
    expect((await readSessions(popup)).active).toBe('alpha.test');
    await tabs.untracked.bringToFront();
    await sleep(300);
    expect((await readSessions(popup)).sessions.filter((session) => session.domain === 'alpha.test')).toHaveLength(2);
  });

  it('synchronizes websites and sessions to the backend without duplicates', async () => {
    const result = await sendMessage<{ ok: boolean; data: { state: string; pendingSessions: number } }>(popup, { type: 'sync/run' });
    expect(result).toMatchObject({ ok: true, data: { state: 'idle', pendingSessions: 0 } });

    const api = async <T>(path: string): Promise<T> => (await (await fetch(`${backend.apiBaseUrl}${path}`)).json()).data as T;
    const websites = await api<{ domain: string }[]>('/websites');
    expect(websites.map((website) => website.domain).sort()).toEqual(['alpha.test', 'beta.test']);

    const local = await readSessions(popup);
    expect(local.sessions.every((session) => session.syncState === 'synced')).toBe(true);
    const today = new Date().toLocaleDateString('en-CA');
    const analytics = await api<{ totalSessions: number; totalTrackedSeconds: number }>(`/analytics/today?date=${today}`);
    expect(analytics.totalSessions).toBe(local.sessions.length);
    expect(analytics.totalTrackedSeconds).toBe(local.sessions.reduce((sum, session) => sum + session.durationSeconds, 0));

    await sendMessage(popup, { type: 'sync/run' });
    const { sessions } = await api<{ sessions: unknown[] }>(`/sessions?from=${today}&to=${today}`);
    expect(sessions).toHaveLength(local.sessions.length);
  });

  it('stops tracking a website once it is removed', async () => {
    await sendMessage(popup, { type: 'websites/remove', domain: 'beta.test' });
    await tabs.beta.bringToFront();
    await sleep(1_200);
    expect((await readSessions(popup)).active).toBeNull();
  });

  it('rendered every screen without errors', () => {
    expect(pageErrors).toEqual([]);
  });
});
