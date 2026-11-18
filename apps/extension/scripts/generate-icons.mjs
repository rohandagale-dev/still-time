/**
 * Renders public/icons/icon.svg into the PNG sizes referenced by manifest.json, using a local
 * Chrome/Chromium install (set CHROME_PATH to override auto-detection).
 *
 *   npm run icons -w @stilltime/extension
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

const iconsDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const svg = readFileSync(`${iconsDir}icon.svg`, 'utf8');

// Chrome Web Store guidance: the 128px icon carries 16px of transparent padding.
const SIZES = [
  { size: 16, padding: 0 },
  { size: 32, padding: 1 },
  { size: 48, padding: 3 },
  { size: 128, padding: 16 },
];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

const executablePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!executablePath) {
  console.error('Chrome not found. Set CHROME_PATH to a Chrome or Chromium executable.');
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage();
  for (const { size, padding } of SIZES) {
    const inner = size - padding * 2;
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">
         <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
           ${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}
         </div>
       </body></html>`,
    );
    await page.screenshot({
      path: `${iconsDir}icon-${size}.png`,
      omitBackground: true,
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`icon-${size}.png`);
  }
} finally {
  await browser.close();
}
