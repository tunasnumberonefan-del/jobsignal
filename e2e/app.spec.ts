import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const JOB_TEXT = [
  'We are hiring a Warehouse Associate for our Dallas distribution center.',
  "What you'll do:",
  '- Pick and pack customer orders accurately',
  '- Load and unload trucks safely',
  '- Keep the work area clean and organized',
  'Requirements:',
  '- Able to lift 50 pounds',
  '- Reliable attendance',
  'Pay is $19.50 per hour. Full benefits after 60 days.',
  'To complete your application please send your bank account details and Social Security number. Interviews are held on Telegram.',
].join('\n');

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  const link = await page.locator('a[href*="/auth/verify#token="]').getAttribute('href');
  expect(link).toBeTruthy();
  await page.goto(link!);
  await page.waitForURL(/\/dashboard/);
}

const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

async function noSeriousA11yIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
}

async function checkPastedText(page: Page, title?: string) {
  await page.goto('/check');
  await page.getByRole('button', { name: 'Paste the description instead' }).click();
  await page.getByLabel('Job description').fill(JOB_TEXT);
  if (title) await page.getByLabel('Job title').fill(title);
  await page.getByRole('button', { name: 'Check this text' }).click();
  await page.waitForURL(/\/r\/[a-z0-9]+/);
}

test('landing page explains the product and validates the form', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Stop wasting applications');
  await expect(page.getByText('Example report')).toBeVisible();
  await expect(page.getByText('fictional company · illustrative data')).toBeVisible();
  await page.getByRole('button', { name: 'Check it' }).click();
  await expect(page.getByRole('alert')).toContainText('Paste a job link');
});

test('accessibility: key public pages have no serious violations', async ({ page }) => {
  for (const path of ['/', '/check', '/pricing', '/how-it-works', '/methodology', '/guides/what-is-a-ghost-job', '/sign-in', '/faq']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await noSeriousA11yIssues(page);
  }
});

test('theme toggle switches light and dark, both accessible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitem', { name: 'Light' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await noSeriousA11yIssues(page);
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitem', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('full flow: sign in, check pasted text, save, track, simulated upgrade, compare', async ({ page }) => {
  await signIn(page, uniqueEmail('flow'));
  await checkPastedText(page, 'Warehouse Associate');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Warehouse Associate');
  await expect(page.getByText('Significant inconsistencies').first()).toBeVisible();
  await expect(page.getByText('Based on text you pasted.')).toBeVisible();
  await noSeriousA11yIssues(page);

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await page.goto('/saved');
  await page.getByLabel('Application status').selectOption('applied');
  await expect(page.getByText('Marked as applied.')).toBeVisible();

  await page.goto('/compare');
  await expect(page.getByText('Line up your options side by side')).toBeVisible();

  await page.goto('/account/billing');
  await page.getByRole('button', { name: /Upgrade to Pro/ }).click();
  await expect(page.getByText('Simulated checkout · no real payment')).toBeVisible();
  await page.getByRole('button', { name: 'Activate simulated Pro' }).click();
  await page.waitForURL(/\/account\/billing/);
  await expect(page.getByText('simulated', { exact: true })).toBeVisible();

  await page.goto('/compare');
  await expect(page.getByText(/Pick jobs/)).toBeVisible();
  await noSeriousA11yIssues(page);
});

test('another user cannot open a private report', async ({ browser }) => {
  const a = await browser.newContext();
  const pa = await a.newPage();
  await signIn(pa, uniqueEmail('owner'));
  await checkPastedText(pa);
  const url = pa.url();

  const b = await browser.newContext();
  const pb = await b.newPage();
  await signIn(pb, uniqueEmail('other'));
  await pb.goto(url);
  await expect(pb.getByText("We can't show this report")).toBeVisible();
  await a.close();
  await b.close();
});

test('protected pages redirect to sign-in', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForURL(/\/sign-in\?next=%2Fdashboard/);
  await page.goto('/admin');
  await page.waitForURL(/\/sign-in/);
});

test('unknown pages show a friendly 404', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: "This page isn't here" })).toBeVisible();
});

test('@mobile pages fit a phone screen without sideways scrolling', async ({ page }) => {
  for (const path of ['/', '/check', '/pricing', '/how-it-works', '/sign-in', '/guides', '/methodology']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
});

test('@mobile a report and the dashboard are usable on a phone', async ({ page }) => {
  await signIn(page, uniqueEmail('mobile'));
  await checkPastedText(page);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/mobile-report.png' });
  await page.goto('/dashboard');
  overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
