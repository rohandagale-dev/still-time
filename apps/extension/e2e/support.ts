/**
 * End-to-end support: fake websites, the built backend on an in-memory MongoDB, and Chrome with
 * the production build of the extension loaded through the DevTools protocol (Chrome 137+ ignores
 * --load-extension in branded builds).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import { MongoMemoryServer } from 'mongodb-memory-server';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

export const EXTENSION_DIST = fileURLToPath(new URL('../dist', import.meta.url));
export const BACKEND_ENTRY = fileURLToPath(new URL('../../backend/dist/server.js', import.meta.url));

const CHROME_CANDIDATES = [
  process.env['CHROME_PATH'],
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export const chromePath = CHROME_CANDIDATES.find((candidate): candidate is string => !!candidate && existsSync(candidate));

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));

/** Serves a tiny page (with an SVG favicon) for any host name. */
export async function startFakeWebsites(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const host = (request.headers.host ?? '').split(':')[0] ?? '';
    if (request.url?.startsWith('/favicon.svg')) {
      response.writeHead(200, { 'content-type': 'image/svg+xml' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#5b5bd6"/></svg>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<!doctype html><title>${host}</title><link rel="icon" href="/favicon.svg"><h1>${host}</h1>`);
  });
  const port = await listen(server);
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Starts the production build of the API against a throwaway MongoDB. */
export async function startBackend(): Promise<{ apiBaseUrl: string; stop: () => Promise<void> }> {
  if (!existsSync(BACKEND_ENTRY)) throw new Error('Backend is not built — run `npm run build` first.');
  const mongo = await MongoMemoryServer.create();
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [BACKEND_ENTRY], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      MONGODB_URI: `${mongo.getUri()}stilltime-e2e`,
      AUTH_MODE: 'development',
      DEV_USER_ID: 'e2e-user',
      CORS_ORIGINS: 'chrome-extension://*',
      LOG_LEVEL: 'warn',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  const apiBaseUrl = `http://localhost:${port}/api`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`);
      if ((await response.json()).data?.database === 'connected') break;
    } catch {
      // not up yet
    }
    if (attempt > 100 || child.exitCode !== null) throw new Error('Backend did not start');
    await sleep(100);
  }

  return {
    apiBaseUrl,
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((resolve) => (child.exitCode !== null ? resolve(null) : child.once('exit', resolve)));
      await mongo.stop();
    },
  };
}

export async function launchChrome(): Promise<{ browser: Browser; extensionId: string }> {
  if (!chromePath) throw new Error('Chrome not found (set CHROME_PATH)');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    pipe: true,
    enableExtensions: [EXTENSION_DIST],
    args: ['--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP *.test 127.0.0.1'],
  });
  const worker = await browser.waitForTarget(
    (target) => target.type() === 'service_worker' && target.url().endsWith('/background.js'),
    { timeout: 15_000 },
  );
  return { browser, extensionId: new URL(worker.url()).host };
}

/** Opens the popup UI in a tab (the toolbar popup itself cannot be scripted reliably). */
export async function openExtensionPage(browser: Browser, extensionId: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error: unknown) => errors.push(error instanceof Error ? error.message : String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewport({ width: 380, height: 580 });
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  return { page, errors };
}

export async function clickText(page: Page, selector: string, text: string): Promise<void> {
  const handle = await page.waitForFunction(
    (sel: string, needle: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((element) => element.textContent?.trim().includes(needle)),
    { timeout: 5_000 },
    selector,
    text,
  );
  await (handle.asElement() as unknown as { click(): Promise<void> }).click();
}

export interface StoredSession {
  domain: string;
  durationSeconds: number;
  status: string;
  syncState: string;
}

/** Reads the extension's IndexedDB from one of its pages. */
export function readSessions(page: Page): Promise<{ sessions: StoredSession[]; active: string | null }> {
  return page.evaluate(
    () =>
      new Promise<{ sessions: StoredSession[]; active: string | null }>((resolve, reject) => {
        const open = indexedDB.open('stilltime');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['sessions', 'state']);
          const sessions = tx.objectStore('sessions').getAll();
          const active = tx.objectStore('state').get('activeSession');
          tx.oncomplete = () => {
            db.close();
            resolve({
              sessions: (sessions.result as StoredSession[]).sort((a, b) => a.domain.localeCompare(b.domain)),
              active: (active.result as { domain?: string } | undefined)?.domain ?? null,
            });
          };
        };
      }),
  );
}

export function sendMessage<T>(page: Page, message: unknown): Promise<T> {
  return page.evaluate((payload) => chrome.runtime.sendMessage(payload), message) as Promise<T>;
}
