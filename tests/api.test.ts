// End-to-end API tests: real routes, real SQL migration, fake upstream services.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, makeEnv } from './helpers/app';
import { fakeFetch, resetUpstream, state } from './helpers/upstream';
import { hmacSha256Hex } from '../src/worker/lib/util';
import { runScheduled } from '../src/worker/services/monitoring';
import type { Env } from '../src/worker/env';

const GH_JOB = 'https://boards.greenhouse.io/acmepay/jobs/1001';
const GH_OLD = 'https://boards.greenhouse.io/acmepay/jobs/1002';

let env: ReturnType<typeof makeEnv>;

beforeEach(() => {
  resetUpstream();
  vi.stubGlobal('fetch', fakeFetch);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  env = makeEnv();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function seedWarn(e: Env) {
  const admin = new Client(e);
  await admin.signIn('admin@example.com');
  const r = await admin.post('/api/admin/tasks/warn_ingest');
  return r;
}

describe('analysis', () => {
  it('anonymous visitor can analyze a supported URL and gets a full, sourced report', async () => {
    const c = new Client(env);
    const r = await c.post('/api/analyze', { url: GH_JOB });
    expect(r.status).toBe(200);
    const rep = r.json.report;
    expect(rep.job).toMatchObject({ title: 'Senior Backend Engineer', employer: 'AcmePay', sourceKind: 'greenhouse' });
    expect(rep.posting.label).toBe('strong_signals');
    expect(rep.findings.find((f: { ruleId: string }) => f.ruleId === 'official_live').sources[0].reliability).toBe('official');
    // The employer's anti-fraud paragraph must not be read as a scam request.
    expect(rep.findings.some((f: { ruleId: string }) => f.ruleId === 'asks_for_payment')).toBe(false);
    expect(rep.findings.find((f: { ruleId: string }) => f.ruleId === 'fraud_notice').detail).toContain('@acmepay.com');
    // SEC: exact name match to a ticker, 8-K item 2.05 restructuring found.
    expect(rep.employerProfile.cik).toBe('0001234567');
    expect(rep.findings.some((f: { ruleId: string }) => f.ruleId === 'sec_restructuring')).toBe(true);
    // Report is viewable by its owner via the slug.
    const view = await c.get(`/api/reports/${r.json.slug}`);
    expect(view.status).toBe(200);
    expect(view.json.isOwner).toBe(true);
  });

  it('a second analysis of the same job reuses the stored analysis instead of re-fetching', async () => {
    const a = new Client(env);
    await a.post('/api/analyze', { url: GH_JOB });
    const callsAfterFirst = state.calls.length;
    const b = new Client(env);
    const r = await b.post('/api/analyze', { url: GH_JOB });
    expect(r.json.reused).toBe(true);
    expect(state.calls.length).toBe(callsAfterFirst);
  });

  it('history: posting history is only what we observed (no fabricated dates)', async () => {
    const c = new Client(env);
    const r = await c.post('/api/analyze', { url: GH_JOB });
    expect(r.json.report.history.observationCount).toBe(1);
    expect(Date.now() - Date.parse(r.json.report.history.firstSeenAt)).toBeLessThan(60_000);
    expect(r.json.report.findings.some((f: { ruleId: string }) => f.ruleId === 'first_observation')).toBe(true);
  });

  it('dead URL: reports the listing as no longer published', async () => {
    state.removedJobs.add('1001');
    const r = await new Client(env).post('/api/analyze', { url: GH_JOB });
    expect(r.status).toBe(200);
    expect(r.json.report.posting.label).toBe('unable_to_verify');
    expect(r.json.report.findings[0].ruleId).toBe('not_live');
  });

  it('long-open listing with talent-pool wording gets cautions, not accusations', async () => {
    const r = await new Client(env).post('/api/analyze', { url: GH_OLD });
    const ids = r.json.report.findings.map((f: { ruleId: string }) => f.ruleId);
    expect(ids).toContain('open_over_120_days');
    expect(ids).toContain('pipeline_language');
    expect(r.json.report.posting.label).toBe('some_caution');
  });

  it('unsupported site with no job data asks for manual entry', async () => {
    const r = await new Client(env).post('/api/analyze', { url: 'https://careers.example-widgets.com/jobs/plain' });
    expect(r.status).toBe(422);
    expect(r.json.error.needsManual).toBe(true);
  });

  it('pages with schema.org JobPosting are read, respecting robots.txt', async () => {
    const ok = await new Client(env).post('/api/analyze', { url: 'https://careers.example-widgets.com/jobs/42' });
    expect(ok.status).toBe(200);
    expect(ok.json.report.job).toMatchObject({ title: 'Widget Technician', employer: 'Example Widgets', sourceKind: 'jsonld' });
    const blocked = await new Client(env).post('/api/analyze', { url: 'https://careers.example-widgets.com/private/job' });
    expect(blocked.status).toBe(422);
    expect(state.calls.some((u) => u.includes('/private/job'))).toBe(false);
  });

  it('aggregators like LinkedIn are not scraped', async () => {
    const r = await new Client(env).post('/api/analyze', { url: 'https://www.linkedin.com/jobs/view/123' });
    expect(r.status).toBe(422);
    expect(state.calls.some((u) => u.includes('linkedin'))).toBe(false);
  });

  it('SSRF attempts are rejected before any request is made', async () => {
    const r = await new Client(env).post('/api/analyze', { url: 'http://169.254.169.254/latest/meta-data' });
    expect(r.status).toBe(422);
    expect(state.calls).toHaveLength(0);
  });

  it('upstream outage returns a clear error and does not use up quota', async () => {
    state.greenhouseDown = true;
    const c = new Client(env);
    const r = await c.post('/api/analyze', { url: GH_JOB });
    expect(r.status).toBe(502);
    expect(r.json.error.message).toMatch(/Nothing was counted/);
    const me = await c.get('/api/me');
    expect(me.json.quota.used).toBe(0);
  });

  it('SEC outage still produces a report, with lower confidence', async () => {
    state.secDown = true;
    const r = await new Client(env).post('/api/analyze', { url: GH_JOB });
    expect(r.status).toBe(200);
    expect(r.json.report.findings.some((f: { ruleId: string }) => f.ruleId === 'sec_unavailable')).toBe(true);
  });

  it('manual entry works, is labeled user-supplied, and requires real text', async () => {
    const c = new Client(env);
    const short = await c.post('/api/analyze', { text: 'hi' });
    expect(short.status).toBe(400);
    const r = await c.post('/api/analyze', { text: 'We need a warehouse associate. '.repeat(10) + 'Please send your Social Security number and bank account details to apply. Interview on Telegram.', title: 'Warehouse Associate', company: 'Totally Real Logistics' });
    expect(r.status).toBe(200);
    expect(r.json.report.inputKind).toBe('manual');
    expect(r.json.report.posting.label).toBe('significant_inconsistencies');
    expect(r.json.report.sources.some((s: { reliability: string }) => s.reliability === 'user_supplied')).toBe(true);
  });

  it('free-tier limit is enforced server-side', async () => {
    const c = new Client(env);
    expect((await c.post('/api/analyze', { url: GH_JOB })).status).toBe(200);
    expect((await c.post('/api/analyze', { url: GH_OLD })).status).toBe(200);
    const third = await c.post('/api/analyze', { text: 'A real job description with enough words to analyze properly. '.repeat(5) });
    expect(third.status).toBe(429);
    expect(third.json.error.code).toBe('quota_exceeded');
  });
});

describe('employer intelligence', () => {
  it('matches WARN notices exactly and does not attach a similarly named company', async () => {
    const ingest = await seedWarn(env);
    expect(ingest.status).toBe(200);
    expect(ingest.json.result.TX).toBe(2);
    expect(String(ingest.json.result.CA)).toMatch(/error/); // CA source unavailable: recorded, not fatal
    const r = await new Client(env).post('/api/analyze', { url: GH_JOB });
    const events = r.json.report.employerProfile.events.filter((e: { kind: string }) => e.kind === 'warn_notice');
    expect(events).toHaveLength(1);
    expect(events[0].magnitude).toBe(140);
    expect(r.json.report.employer.label).toBe('multiple_significant_warnings'); // WARN + 8-K 2.05
    // "Acme Foods Distribution" must not appear for AcmePay.
    expect(JSON.stringify(r.json.report)).not.toContain('Acme Foods');
  });

  it('company entity resolution: name variants on the same board resolve to one company', async () => {
    const c = new Client(env);
    await c.post('/api/analyze', { url: GH_JOB });
    await c.post('/api/analyze', { url: GH_OLD });
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM companies').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('public company profile page data is available', async () => {
    const c = new Client(env);
    const r = await c.post('/api/analyze', { url: GH_JOB });
    const slug = r.json.report.employerProfile.companySlug;
    const p = await c.get(`/api/companies/${slug}`);
    expect(p.status).toBe(200);
    expect(p.json.company.name).toBe('AcmePay');
    const html = await c.get(`/companies/${slug}`);
    expect(html.text).toContain('<title>AcmePay: layoffs, WARN notices and public filings');
  });
});

describe('accounts, privacy, and access control', () => {
  it('sign-in links work once', async () => {
    const c = new Client(env);
    const r = await c.post('/api/auth/request', { email: 'Person@Example.com' });
    const token = decodeURIComponent(String(r.json.devLink).split('#token=')[1]!.split('&')[0]!);
    expect((await c.post('/api/auth/verify', { token })).status).toBe(200);
    expect((await c.get('/api/me')).json.user.email).toBe('person@example.com');
    expect((await new Client(env).post('/api/auth/verify', { token })).status).toBe(401);
  });

  it('dev sign-in links are never returned in production', async () => {
    const prod = makeEnv({ APP_ENV: 'production', APP_URL: 'https://jobsignal.example', BILLING_MODE: 'stripe', EMAIL_MODE: 'resend', RESEND_API_KEY: 're_x', STRIPE_SECRET_KEY: 'sk_x', STRIPE_PRICE_PRO_MONTHLY: 'price_x', SEC_USER_AGENT: 'JobSignal ops@jobsignal.app' });
    const c = new Client(prod);
    const r = await c.req('POST', '/api/auth/request', { email: 'a@b.co' }, { origin: 'https://jobsignal.example' });
    expect(r.status).toBe(200);
    expect(r.json.devLink).toBeUndefined();
  });

  it('production refuses to start with unsafe config', async () => {
    const bad = makeEnv({ APP_ENV: 'production', BILLING_MODE: 'dev' });
    const r = await new Client(bad).get('/api/health');
    expect(r.status).toBe(500);
  });

  it('anonymous reports carry over into a new account', async () => {
    const c = new Client(env);
    const r = await c.post('/api/analyze', { url: GH_JOB });
    await c.signIn('new@example.com');
    const h = await c.get('/api/me/reports');
    expect(h.json.items.map((x: { slug: string }) => x.slug)).toContain(r.json.slug);
  });

  it("users can't see or modify each other's data", async () => {
    const alice = new Client(env);
    await alice.signIn('alice@example.com');
    const r = await alice.post('/api/analyze', { url: GH_JOB });
    const saved = await alice.post('/api/me/saved-jobs', { reportId: r.json.reportId });
    expect(saved.status).toBe(200);
    const sid = saved.json.saved.id;

    const bob = new Client(env);
    await bob.signIn('bob@example.com');
    expect((await bob.get(`/api/reports/${r.json.slug}`)).status).toBe(404); // private
    expect((await bob.patch(`/api/me/saved-jobs/${sid}`, { notes: 'hacked' })).status).toBe(404);
    expect((await bob.del(`/api/me/saved-jobs/${sid}`)).status).toBe(404);
    expect((await bob.post('/api/me/saved-jobs', { reportId: r.json.reportId })).status).toBe(404);
    expect((await bob.patch(`/api/me/reports/${r.json.reportId}`, { isPublic: true })).status).toBe(404);
    const list = await bob.get('/api/me/saved-jobs');
    expect(list.json.items).toHaveLength(0);
  });

  it('public reports never reveal who made them', async () => {
    const alice = new Client(env);
    await alice.signIn('alice@example.com');
    const r = await alice.post('/api/analyze', { url: GH_JOB });
    await alice.patch(`/api/me/reports/${r.json.reportId}`, { isPublic: true });
    const stranger = new Client(env);
    const view = await stranger.get(`/api/reports/${r.json.slug}`);
    expect(view.status).toBe(200);
    expect(view.json.isOwner).toBe(false);
    expect(view.json.reportId).toBeUndefined();
    expect(view.text).not.toContain('alice');
    const html = await stranger.get(`/r/${r.json.slug}`);
    expect(html.text).toContain('Senior Backend Engineer at AcmePay');
    expect(html.text).toContain('noindex');
  });

  it('private report link previews do not leak the job title', async () => {
    const c = new Client(env);
    const r = await c.post('/api/analyze', { url: GH_JOB });
    const html = await new Client(env).get(`/r/${r.json.slug}`);
    expect(html.text).not.toContain('Senior Backend Engineer');
  });

  it('admin endpoints are enforced on the server', async () => {
    const user = new Client(env);
    await user.signIn('user@example.com');
    expect((await user.get('/api/admin/overview')).status).toBe(403);
    expect((await new Client(env).get('/api/admin/overview')).status).toBe(401);
    const admin = new Client(env);
    await admin.signIn('admin@example.com');
    expect((await admin.get('/api/admin/overview')).status).toBe(200);
  });

  it('cross-site POSTs are blocked (CSRF)', async () => {
    const c = new Client(env);
    const r = await c.req('POST', '/api/analyze', { url: GH_JOB }, { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });

  it('account deletion removes personal data', async () => {
    const c = new Client(env);
    await c.signIn('leaving@example.com');
    await c.post('/api/analyze', { url: GH_JOB });
    expect((await c.del('/api/me', { confirmEmail: 'wrong@example.com' })).status).toBe(400);
    expect((await c.del('/api/me', { confirmEmail: 'leaving@example.com' })).status).toBe(200);
    const u = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'leaving@example.com'").first<{ n: number }>();
    expect(u?.n).toBe(0);
    const reps = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports').first<{ n: number }>();
    expect(reps?.n).toBe(0);
    expect((await c.get('/api/me')).json.user).toBeNull();
  });
});

describe('plans and billing', () => {
  it('Pro features are refused on the free plan', async () => {
    const c = new Client(env);
    await c.signIn('free@example.com');
    const r = await c.post('/api/analyze', { url: GH_JOB });
    expect((await c.post('/api/me/saved-jobs', { reportId: r.json.reportId, monitor: true })).status).toBe(402);
    expect((await c.get(`/api/me/compare?reports=a,b`)).status).toBe(402);
    expect((await c.get('/api/me/export')).status).toBe(402);
  });

  it('free users see every warning in full, but locked detail on the long tail', async () => {
    const c = new Client(env);
    await seedWarn(env);
    const r = await c.post('/api/analyze', { url: GH_JOB });
    const findings = r.json.report.findings as Array<{ polarity: string; locked?: boolean }>;
    expect(findings.filter((f) => f.polarity === 'warning' || f.polarity === 'caution').every((f) => !f.locked)).toBe(true);
    expect(r.json.report.employerProfile.financials).toEqual([]);
  });

  it('dev checkout activates Pro, then simulated states change entitlements', async () => {
    const c = new Client(env);
    await c.signIn('payer@example.com');
    const co = await c.post('/api/billing/checkout');
    expect(co.json.simulated).toBe(true);
    await c.post('/api/billing/dev/complete');
    expect((await c.get('/api/me')).json.plan).toBe('pro');
    await c.post('/api/billing/dev/action', { action: 'payment_failed' });
    expect((await c.get('/api/me')).json.plan).toBe('pro'); // grace during retries
    await c.post('/api/billing/dev/action', { action: 'expire' });
    expect((await c.get('/api/me')).json.plan).toBe('free'); // expired subscription
    await c.post('/api/billing/dev/action', { action: 'resume' });
    await c.post('/api/billing/dev/complete');
    await c.post('/api/billing/dev/action', { action: 'cancel_now' });
    expect((await c.get('/api/me')).json.plan).toBe('free');
  });

  it('the billing simulator is refused outside dev mode', async () => {
    const stripeEnv = makeEnv({ BILLING_MODE: 'stripe' });
    const c = new Client(stripeEnv);
    await c.signIn('x@example.com');
    expect((await c.post('/api/billing/dev/complete')).status).toBe(403);
  });

  it('invalid webhook signatures are rejected; valid ones are processed once', async () => {
    const c = new Client(env);
    await c.signIn('sub@example.com');
    const userId = (await c.get('/api/me')).json.user.id;
    const event = { id: 'evt_123', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { user_id: userId }, items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] } } } };
    const body = JSON.stringify(event);
    const hook = new Client(env);
    const bad = await hook.req('POST', '/api/billing/webhook', body, { 'stripe-signature': 't=1,v1=deadbeef', origin: 'https://stripe.com' });
    expect(bad.status).toBe(400);
    const t = Math.floor(Date.now() / 1000);
    const sig = `t=${t},v1=${await hmacSha256Hex('whsec_test_secret', `${t}.${body}`)}`;
    const ok = await hook.req('POST', '/api/billing/webhook', body, { 'stripe-signature': sig });
    expect(ok.status).toBe(200);
    expect((await c.get('/api/me')).json.plan).toBe('pro');
    const again = await hook.req('POST', '/api/billing/webhook', body, { 'stripe-signature': sig });
    expect(again.json.message).toBe('duplicate');
    // A later cancellation event downgrades.
    const cancel = JSON.stringify({ ...event, id: 'evt_124', data: { object: { ...event.data.object, status: 'canceled' } } });
    const sig2 = `t=${t},v1=${await hmacSha256Hex('whsec_test_secret', `${t}.${cancel}`)}`;
    await hook.req('POST', '/api/billing/webhook', cancel, { 'stripe-signature': sig2 });
    expect((await c.get('/api/me')).json.plan).toBe('free');
  });
});

describe('monitoring', () => {
  it('rechecks watched jobs and creates a real alert when a listing closes', async () => {
    const c = new Client(env);
    await c.signIn('watcher@example.com');
    await c.post('/api/billing/dev/complete');
    const r = await c.post('/api/analyze', { url: GH_JOB });
    const s = await c.post('/api/me/saved-jobs', { reportId: r.json.reportId, monitor: true });
    expect(s.status).toBe(200);
    // Nothing changes -> no alert.
    await env.DB.prepare("UPDATE jobs SET last_checked_at = '2000-01-01T00:00:00.000Z'").run();
    await runScheduled(env, '15 */6 * * *');
    let notes = await c.get('/api/me/notifications');
    expect(notes.json.items.filter((n: { kind: string }) => n.kind === 'job_change')).toHaveLength(0);
    // Listing removed -> one alert, and not twice.
    state.removedJobs.add('1001');
    await env.DB.prepare("UPDATE jobs SET last_checked_at = '2000-01-01T00:00:00.000Z'").run();
    await runScheduled(env, '15 */6 * * *');
    await env.DB.prepare("UPDATE jobs SET last_checked_at = '2000-01-01T00:00:00.000Z'").run();
    await runScheduled(env, '15 */6 * * *');
    notes = await c.get('/api/me/notifications');
    const closed = notes.json.items.filter((n: { title: string }) => n.title.startsWith('Listing closed'));
    expect(closed).toHaveLength(1);
  });

  it('does not spend requests on jobs watched only by lapsed accounts', async () => {
    const c = new Client(env);
    await c.signIn('lapsed@example.com');
    await c.post('/api/billing/dev/complete');
    const r = await c.post('/api/analyze', { url: GH_JOB });
    await c.post('/api/me/saved-jobs', { reportId: r.json.reportId, monitor: true });
    await c.post('/api/billing/dev/action', { action: 'cancel_now' });
    await env.DB.prepare("UPDATE jobs SET last_checked_at = '2000-01-01T00:00:00.000Z'").run();
    state.calls = [];
    await runScheduled(env, '15 */6 * * *');
    expect(state.calls.filter((u) => u.includes('greenhouse'))).toHaveLength(0);
  });

  it('deadline reminders fire once', async () => {
    const c = new Client(env);
    await c.signIn('remind@example.com');
    const r = await c.post('/api/analyze', { url: GH_JOB });
    const s = await c.post('/api/me/saved-jobs', { reportId: r.json.reportId });
    await c.patch(`/api/me/saved-jobs/${s.json.saved.id}`, { deadline: '2026-11-01', remindAt: new Date(Date.now() - 60_000).toISOString() });
    await runScheduled(env, '15 */6 * * *');
    await runScheduled(env, '15 */6 * * *');
    const notes = await c.get('/api/me/notifications');
    expect(notes.json.items.filter((n: { kind: string }) => n.kind === 'deadline')).toHaveLength(1);
  });
});

describe('SEO endpoints', () => {
  it('sitemap and robots point at the configured origin', async () => {
    const c = new Client(env);
    const sm = await c.get('/sitemap.xml');
    expect(sm.text).toContain('<loc>http://localhost:5173/guides/what-is-a-ghost-job</loc>');
    const robots = await c.get('/robots.txt');
    expect(robots.text).toContain('Sitemap: http://localhost:5173/sitemap.xml');
    expect(robots.text).toContain('Disallow: /api/');
  });
});
