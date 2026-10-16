// Renders public/og.png (1200x630) from scripts/og.html using the locally installed Edge.
// Run: node scripts/make-og.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const html = fileURLToPath(new URL('./og.html', import.meta.url));
const out = fileURLToPath(new URL('../public/og.png', import.meta.url));
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(html).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
