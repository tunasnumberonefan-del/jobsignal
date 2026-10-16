import { z } from 'zod';
import { PLANS, PRICING } from '@shared/entitlements';
import type { Report } from '@shared/types';
import { body, createApp, subjectKey, type Ctx } from '../app';
import { AppError, badRequest, notFound } from '../lib/errors';
import { viewReport } from '../lib/redact';
import { newId, nowIso } from '../lib/util';
import { analyze } from '../services/analysis';
import { analysisQuota, rateLimit, recordUsage } from '../services/usage';
import { loadEvents } from '../services/companies';
import { SUPPORTED_SOURCES } from '../providers';
import { WARN_SOURCES } from '../providers/warn';

export const publicRoutes = createApp();

publicRoutes.get('/api/health', (c) => c.json({ ok: true, time: nowIso() }));

publicRoutes.get('/api/config', async (c) => {
  const ann = await c.env.DB.prepare('SELECT id, message, level FROM announcements WHERE active = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 3')
    .bind(nowIso()).all();
  const flags = await c.env.DB.prepare('SELECT key, enabled FROM feature_flags').all<{ key: string; enabled: number }>();
  return c.json({
    plans: PLANS,
    pricing: PRICING,
    billingMode: c.env.BILLING_MODE === 'stripe' ? 'stripe' : c.env.BILLING_MODE === 'off' ? 'off' : 'dev',
    environment: c.env.APP_ENV,
    supportedSources: SUPPORTED_SOURCES,
    warnStates: WARN_SOURCES.map((s) => ({ state: s.state, agency: s.agency, url: s.homepage })),
    announcements: ann.results,
    flags: Object.fromEntries(flags.results.map((f) => [f.key, f.enabled === 1])),
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY ?? null,
  });
});

const AnalyzeBody = z.object({
  url: z.string().trim().max(2048).optional(),
  text: z.string().max(60_000).optional(),
  title: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  location: z.string().trim().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
}).refine((b) => !!b.url || !!b.text?.trim(), { message: 'Paste a job link or the job description.' });

async function verifyTurnstile(c: Ctx, token: string | undefined): Promise<boolean> {
  const secret = c.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: c.req.header('cf-connecting-ip') ?? '' }),
  });
  const data = (await res.json()) as { success?: boolean };
  return !!data.success;
}

publicRoutes.post('/api/analyze', async (c) => {
  const b = await body(c, AnalyzeBody);
  const user = c.get('user');
  const ent = c.get('ent');

  if (!user) {
    const flag = await c.env.DB.prepare("SELECT enabled FROM feature_flags WHERE key = 'anonymous_analysis'").first<{ enabled: number }>();
    if (flag && flag.enabled === 0) throw new AppError('unauthorized', 'Create a free account to run an analysis.');
    if (!(await verifyTurnstile(c, b.turnstileToken))) throw new AppError('forbidden', 'Please complete the quick check and try again.');
  }
  // Burst protection on top of the daily quota: stops scripts hammering upstream APIs.
  if (!(await rateLimit(c.env, `analyze:${subjectKey(c)}`, 10, 60))) throw new AppError('rate_limited', "You're going a bit fast. Wait a minute and try again.");

  const quota = await analysisQuota(c.env, subjectKey(c), ent);
  if (quota.remaining <= 0) {
    throw new AppError('quota_exceeded', user
      ? `You've used your ${quota.limit} free analyses for today.`
      : `You've used your ${quota.limit} free checks for today. Create a free account for more.`, { quota, plan: c.get('plan') });
  }

  const manual = b.text?.trim() ? { text: b.text, title: b.title, company: b.company, location: b.location } : (b.company || b.location ? { text: '', company: b.company, location: b.location } : undefined);
  const result = await analyze(c.env, { url: b.url || undefined, manual }, { userId: user?.id ?? null, anonId: user ? null : c.get('anonId') });
  if (!result.alreadyHad) await recordUsage(c.env, subjectKey(c), 'analysis');
  const after = await analysisQuota(c.env, subjectKey(c), ent);
  return c.json({ slug: result.slug, reportId: result.reportId, reused: result.reused, quota: after, report: viewReport(result.report, ent) });
});

interface ReportRow {
  id: string; slug: string; analysis_id: string; user_id: string | null; anon_id: string | null; is_public: number; created_at: string;
  report_json: string; job_id: string; company_id: string | null; scoring_version: string;
}

export async function loadReportForViewer(c: Ctx, slug: string): Promise<{ row: ReportRow; isOwner: boolean; report: Report }> {
  if (!/^[a-z0-9]{8,20}$/.test(slug)) throw notFound();
  const row = await c.env.DB.prepare(
    `SELECT r.*, a.report_json, a.job_id, a.company_id, a.scoring_version FROM reports r JOIN analyses a ON a.id = r.analysis_id WHERE r.slug = ?`,
  ).bind(slug).first<ReportRow>();
  if (!row) throw notFound("That report doesn't exist, or it was deleted.");
  const user = c.get('user');
  const isOwner = (!!user && row.user_id === user.id) || (!row.user_id && row.anon_id === c.get('anonId'));
  if (!isOwner && !row.is_public && user?.role !== 'admin') throw notFound("That report is private, or it doesn't exist.");
  return { row, isOwner, report: JSON.parse(row.report_json) as Report };
}

publicRoutes.get('/api/reports/:slug', async (c) => {
  const { row, isOwner, report } = await loadReportForViewer(c, c.req.param('slug'));
  const user = c.get('user');
  let saved: unknown = null;
  if (user && isOwner) {
    saved = await c.env.DB.prepare('SELECT id, status, monitor FROM saved_jobs WHERE user_id = ? AND job_id = ?').bind(user.id, row.job_id).first();
  }
  // Never expose who ran it. Public viewers get the analysis and nothing about the owner.
  return c.json({
    slug: row.slug,
    reportId: isOwner ? row.id : undefined,
    isOwner,
    isPublic: row.is_public === 1,
    createdAt: row.created_at,
    claimable: !row.user_id && isOwner && !!user,
    saved,
    report: viewReport(report, c.get('ent')),
  });
});

// Visitor ran an analysis, then signed up: move their anonymous reports into the account.
publicRoutes.post('/api/reports/claim', async (c) => {
  const user = c.get('user');
  if (!user) throw new AppError('unauthorized', 'Sign in first.');
  const r = await c.env.DB.prepare('UPDATE reports SET user_id = ?, anon_id = NULL WHERE anon_id = ? AND user_id IS NULL').bind(user.id, c.get('anonId')).run();
  return c.json({ claimed: r.meta.changes ?? 0 });
});

publicRoutes.get('/api/companies/:slug', async (c) => {
  const slug = c.req.param('slug');
  const co = await c.env.DB.prepare('SELECT id, slug, name, domain, ticker, cik, created_at FROM companies WHERE slug = ?').bind(slug).first<{ id: string; slug: string; name: string; domain: string | null; ticker: string | null; cik: string | null; created_at: string }>();
  if (!co) throw notFound("We don't have a profile for that company yet.");
  const ent = c.get('ent');
  const events = await loadEvents(c.env, co.id);
  const [jobs, latest] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open FROM jobs WHERE company_id = ?").bind(co.id),
    c.env.DB.prepare('SELECT report_json, created_at FROM analyses WHERE company_id = ? ORDER BY created_at DESC LIMIT 1').bind(co.id),
  ]);
  const latestReport = (latest!.results[0] as { report_json: string } | undefined)?.report_json;
  const profile = latestReport ? (JSON.parse(latestReport) as Report).employerProfile : null;
  const j = jobs!.results[0] as { total: number; open: number | null };
  const user = c.get('user');
  const watching = user ? !!(await c.env.DB.prepare('SELECT 1 FROM saved_companies WHERE user_id = ? AND company_id = ?').bind(user.id, co.id).first()) : false;
  return c.json({
    company: { ...co, cik: co.cik ?? null },
    events: ent.fullEvidence ? events : events.slice(0, 8),
    eventsLocked: ent.fullEvidence ? 0 : Math.max(0, events.length - 8),
    jobsTracked: j.total,
    jobsOpen: j.open ?? 0,
    financials: ent.fullEvidence ? (profile?.financials ?? []) : [],
    financialsLocked: !ent.fullEvidence && (profile?.financials?.length ?? 0) > 0,
    checked: profile?.checked ?? null,
    latestPeriodicFiling: profile?.latestPeriodicFiling ?? null,
    watching,
  });
});

publicRoutes.post('/api/feedback', async (c) => {
  const b = await body(c, z.object({ slug: z.string().max(30).optional(), helpful: z.boolean().optional(), comment: z.string().trim().max(2000).optional() }));
  if (!(await rateLimit(c.env, `feedback:${c.get('ipHash')}`, 20, 3600))) throw new AppError('rate_limited', 'Thanks, we have plenty from you for now.');
  let reportId: string | null = null;
  if (b.slug) reportId = (await c.env.DB.prepare('SELECT id FROM reports WHERE slug = ?').bind(b.slug).first<{ id: string }>())?.id ?? null;
  await c.env.DB.prepare('INSERT INTO feedback (id, report_id, user_id, helpful, comment, created_at) VALUES (?,?,?,?,?,?)')
    .bind(newId('fb'), reportId, c.get('user')?.id ?? null, b.helpful === undefined ? null : b.helpful ? 1 : 0, b.comment ?? null, nowIso()).run();
  return c.json({ ok: true });
});

const FlagBody = z.object({
  slug: z.string().max(30).optional(),
  companySlug: z.string().max(80).optional(),
  reason: z.enum(['wrong_company', 'wrong_event', 'outdated', 'listing_is_real', 'listing_is_fake', 'other']),
  detail: z.string().trim().min(10, 'Please tell us a little more (10+ characters).').max(4000),
  contactEmail: z.string().trim().email().max(254).optional().or(z.literal('')),
});

publicRoutes.post('/api/flags', async (c) => {
  const b = await body(c, FlagBody);
  if (!(await rateLimit(c.env, `flag:${c.get('ipHash')}`, 10, 3600))) throw new AppError('rate_limited', "We've received several reports from you. Please wait a bit.");
  let reportId: string | null = null;
  let companyId: string | null = null;
  if (b.slug) {
    const r = await c.env.DB.prepare('SELECT r.id, a.company_id FROM reports r JOIN analyses a ON a.id = r.analysis_id WHERE r.slug = ?').bind(b.slug).first<{ id: string; company_id: string | null }>();
    reportId = r?.id ?? null;
    companyId = r?.company_id ?? null;
  }
  if (b.companySlug) companyId = (await c.env.DB.prepare('SELECT id FROM companies WHERE slug = ?').bind(b.companySlug).first<{ id: string }>())?.id ?? companyId;
  if (!reportId && !companyId) throw badRequest('Tell us which report or company this is about.');
  await c.env.DB.prepare('INSERT INTO flags (id, report_id, company_id, user_id, contact_email, reason, detail, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind(newId('flg'), reportId, companyId, c.get('user')?.id ?? null, b.contactEmail || null, b.reason, b.detail, nowIso()).run();
  return c.json({ ok: true });
});

