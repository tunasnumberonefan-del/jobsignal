import { z } from 'zod';
import type { Report } from '@shared/types';
import { body, createApp, requireUser, type Ctx } from '../app';
import { AppError, badRequest, notFound, planRequired } from '../lib/errors';
import { newId, nowIso, parseJson } from '../lib/util';
import { viewReport } from '../lib/redact';
import { getSubscription } from '../services/billing';
import { readPrefs } from '../services/notifications';
import { analysisQuota } from '../services/usage';

export const meRoutes = createApp();

// Every route here needs a signed-in user, and every query is scoped by user_id.
// That's the whole access-control model for personal data: you can only ever touch your rows.
meRoutes.use('/api/me/*', async (c, next) => {
  requireUser(c);
  return next();
});

const uid = (c: Ctx) => c.get('user')!.id;

// ---------------------------------------------------------------- overview

meRoutes.get('/api/me/overview', async (c) => {
  const id = uid(c);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [stats, recent, alerts, changed] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT
        (SELECT COUNT(*) FROM reports WHERE user_id = ?1) AS analyzed,
        (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?1) AS saved_jobs,
        (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?1 AND monitor = 1) AS watched_jobs,
        (SELECT COUNT(*) FROM saved_companies WHERE user_id = ?1 AND monitor = 1) AS watched_companies,
        (SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND read_at IS NULL) AS unread,
        (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?1 AND status IN ('applied','interviewing')) AS in_progress`).bind(id),
    c.env.DB.prepare(`SELECT r.slug, r.created_at, a.posting_label, a.employer_label, a.confidence_label, j.title, j.status AS job_status, co.name AS company
        FROM reports r JOIN analyses a ON a.id = r.analysis_id JOIN jobs j ON j.id = a.job_id LEFT JOIN companies co ON co.id = a.company_id
        WHERE r.user_id = ? ORDER BY r.created_at DESC LIMIT 6`).bind(id),
    c.env.DB.prepare('SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 6').bind(id),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'job_change' AND created_at > ?`).bind(id, weekAgo),
  ]);
  const quota = await analysisQuota(c.env, `user:${id}`, c.get('ent'));
  return c.json({
    stats: { ...(stats!.results[0] as Record<string, number>), changed_this_week: (changed!.results[0] as { n: number }).n },
    recent: recent!.results,
    alerts: alerts!.results,
    quota,
  });
});

// ---------------------------------------------------------------- report history

meRoutes.get('/api/me/reports', async (c) => {
  const id = uid(c);
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  const label = c.req.query('label');
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const per = 20;
  const ent = c.get('ent');
  const where = ['r.user_id = ?'];
  const args: unknown[] = [id];
  if (q) {
    where.push('(j.title LIKE ? OR co.name LIKE ?)');
    args.push(`%${q}%`, `%${q}%`);
  }
  if (label && /^[a-z_]+$/.test(label)) {
    where.push('(a.posting_label = ? OR a.employer_label = ?)');
    args.push(label, label);
  }
  // Free plan keeps the most recent N in history. Older ones still exist (links work), they just aren't listed.
  const cap = ent.historyLimit;
  const sql = `SELECT r.id, r.slug, r.is_public, r.created_at, a.posting_label, a.employer_label, a.confidence_label, j.id AS job_id, j.title, j.location, j.status AS job_status,
                 co.name AS company, co.slug AS company_slug
               FROM reports r JOIN analyses a ON a.id = r.analysis_id JOIN jobs j ON j.id = a.job_id LEFT JOIN companies co ON co.id = a.company_id
               WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
  const offset = (page - 1) * per;
  const limit = cap === null ? per + 1 : Math.max(0, Math.min(per + 1, cap - offset));
  const rows = limit > 0 ? (await c.env.DB.prepare(sql).bind(...args, limit, offset).all()).results : [];
  const total = (await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM reports r JOIN analyses a ON a.id = r.analysis_id JOIN jobs j ON j.id = a.job_id LEFT JOIN companies co ON co.id = a.company_id WHERE ${where.join(' AND ')}`).bind(...args).first<{ n: number }>())?.n ?? 0;
  return c.json({
    items: rows.slice(0, per),
    page,
    hasMore: rows.length > per,
    total,
    hiddenByPlan: cap !== null && total > cap ? total - cap : 0,
  });
});

meRoutes.patch('/api/me/reports/:id', async (c) => {
  const b = await body(c, z.object({ isPublic: z.boolean() }));
  const r = await c.env.DB.prepare('UPDATE reports SET is_public = ? WHERE id = ? AND user_id = ?').bind(b.isPublic ? 1 : 0, c.req.param('id'), uid(c)).run();
  if (!r.meta.changes) throw notFound();
  return c.json({ ok: true });
});

meRoutes.delete('/api/me/reports/:id', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM reports WHERE id = ? AND user_id = ?').bind(c.req.param('id'), uid(c)).run();
  if (!r.meta.changes) throw notFound();
  return c.json({ ok: true });
});

meRoutes.get('/api/me/reports/:id/export', async (c) => {
  if (!c.get('ent').exports) throw planRequired('Exporting reports');
  const row = await c.env.DB.prepare('SELECT r.slug, a.report_json FROM reports r JOIN analyses a ON a.id = r.analysis_id WHERE r.id = ? AND r.user_id = ?')
    .bind(c.req.param('id'), uid(c)).first<{ slug: string; report_json: string }>();
  if (!row) throw notFound();
  c.header('content-disposition', `attachment; filename="jobsignal-report-${row.slug}.json"`);
  return c.body(JSON.stringify(JSON.parse(row.report_json), null, 2), 200, { 'content-type': 'application/json' });
});

// ---------------------------------------------------------------- saved jobs

const STATUSES = ['interested', 'applied', 'interviewing', 'offer', 'rejected', 'no_response', 'withdrawn'] as const;

meRoutes.get('/api/me/saved-jobs', async (c) => {
  const id = uid(c);
  const status = c.req.query('status');
  const args: unknown[] = [id];
  let filter = '';
  if (status && (STATUSES as readonly string[]).includes(status)) {
    filter = 'AND s.status = ?';
    args.push(status);
  }
  const rows = await c.env.DB.prepare(
    `SELECT s.*, j.title, j.location, j.status AS job_status, j.apply_url, j.source_url, j.last_checked_at, j.compensation_text, j.published_at,
       co.name AS company, co.slug AS company_slug, r.slug AS report_slug,
       (SELECT a.posting_label FROM analyses a WHERE a.job_id = j.id ORDER BY a.created_at DESC LIMIT 1) AS posting_label,
       (SELECT a.employer_label FROM analyses a WHERE a.job_id = j.id ORDER BY a.created_at DESC LIMIT 1) AS employer_label,
       (SELECT a.confidence_label FROM analyses a WHERE a.job_id = j.id ORDER BY a.created_at DESC LIMIT 1) AS confidence_label
     FROM saved_jobs s JOIN jobs j ON j.id = s.job_id LEFT JOIN companies co ON co.id = j.company_id LEFT JOIN reports r ON r.id = s.report_id
     WHERE s.user_id = ? ${filter} ORDER BY s.updated_at DESC LIMIT 300`,
  ).bind(...args).all();
  return c.json({ items: rows.results.map((r) => ({ ...r, checklist: parseJson((r as { checklist_json: string }).checklist_json, {}) })) });
});

meRoutes.post('/api/me/saved-jobs', async (c) => {
  const b = await body(c, z.object({ reportId: z.string().max(40), monitor: z.boolean().optional() }));
  const id = uid(c);
  const ent = c.get('ent');
  const rep = await c.env.DB.prepare('SELECT r.id, a.job_id FROM reports r JOIN analyses a ON a.id = r.analysis_id WHERE r.id = ? AND r.user_id = ?').bind(b.reportId, id).first<{ id: string; job_id: string }>();
  if (!rep) throw notFound();
  if (ent.historyLimit !== null) {
    const n = (await c.env.DB.prepare('SELECT COUNT(*) AS n FROM saved_jobs WHERE user_id = ?').bind(id).first<{ n: number }>())?.n ?? 0;
    if (n >= ent.historyLimit) throw new AppError('plan_required', `The free plan saves up to ${ent.historyLimit} jobs. Remove one, or upgrade for unlimited.`, { feature: 'More saved jobs' });
  }
  let monitor = 0;
  if (b.monitor) {
    if (!ent.monitoring) throw planRequired('Job monitoring');
    monitor = 1;
  }
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO saved_jobs (id, user_id, job_id, report_id, monitor, created_at, updated_at) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(user_id, job_id) DO UPDATE SET report_id = excluded.report_id, updated_at = excluded.updated_at`,
  ).bind(newId('sj'), id, rep.job_id, rep.id, monitor, now, now).run();
  const saved = await c.env.DB.prepare('SELECT id, status, monitor FROM saved_jobs WHERE user_id = ? AND job_id = ?').bind(id, rep.job_id).first();
  return c.json({ saved });
});

const SavedPatch = z.object({
  status: z.enum(STATUSES).optional(),
  notes: z.string().max(10_000).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  checklist: z.record(z.string().max(40), z.boolean()).optional(),
  monitor: z.boolean().optional(),
});

meRoutes.patch('/api/me/saved-jobs/:id', async (c) => {
  const b = await body(c, SavedPatch);
  const id = uid(c);
  const row = await c.env.DB.prepare('SELECT id FROM saved_jobs WHERE id = ? AND user_id = ?').bind(c.req.param('id'), id).first<{ id: string }>();
  if (!row) throw notFound();
  if (b.monitor) {
    const ent = c.get('ent');
    if (!ent.monitoring) throw planRequired('Job monitoring');
    const n = (await c.env.DB.prepare('SELECT (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?1 AND monitor = 1) + (SELECT COUNT(*) FROM saved_companies WHERE user_id = ?1 AND monitor = 1) AS n').bind(id).first<{ n: number }>())?.n ?? 0;
    if (n >= ent.maxWatches) throw badRequest(`You're watching the maximum of ${ent.maxWatches} jobs and companies. Stop watching one to add another.`);
  }
  const sets: string[] = [];
  const args: unknown[] = [];
  if (b.status !== undefined) { sets.push('status = ?'); args.push(b.status); }
  if (b.notes !== undefined) { sets.push('notes = ?'); args.push(b.notes); }
  if (b.deadline !== undefined) { sets.push('deadline = ?'); args.push(b.deadline); }
  if (b.remindAt !== undefined) { sets.push('remind_at = ?, reminder_sent_at = NULL'); args.push(b.remindAt); }
  if (b.checklist !== undefined) { sets.push('checklist_json = ?'); args.push(JSON.stringify(b.checklist)); }
  if (b.monitor !== undefined) { sets.push('monitor = ?'); args.push(b.monitor ? 1 : 0); }
  if (!sets.length) return c.json({ ok: true });
  sets.push('updated_at = ?');
  args.push(nowIso());
  await c.env.DB.prepare(`UPDATE saved_jobs SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...args, row.id, id).run();
  return c.json({ ok: true });
});

meRoutes.delete('/api/me/saved-jobs/:id', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM saved_jobs WHERE id = ? AND user_id = ?').bind(c.req.param('id'), uid(c)).run();
  if (!r.meta.changes) throw notFound();
  return c.json({ ok: true });
});

// Posting history: observations and description versions. Pro only.
meRoutes.get('/api/me/saved-jobs/:id/history', async (c) => {
  if (!c.get('ent').postingHistory) throw planRequired('Posting change history');
  const s = await c.env.DB.prepare('SELECT job_id FROM saved_jobs WHERE id = ? AND user_id = ?').bind(c.req.param('id'), uid(c)).first<{ job_id: string }>();
  if (!s) throw notFound();
  const [obs, versions] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT observed_at, result, via FROM job_observations WHERE job_id = ? ORDER BY observed_at DESC LIMIT 200').bind(s.job_id),
    c.env.DB.prepare('SELECT id, title, description_text, observed_at FROM job_versions WHERE job_id = ? ORDER BY observed_at ASC LIMIT 20').bind(s.job_id),
  ]);
  return c.json({ observations: obs!.results, versions: versions!.results });
});

// ---------------------------------------------------------------- saved companies

meRoutes.get('/api/me/saved-companies', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.monitor, s.created_at, co.id AS company_id, co.name, co.slug, co.ticker,
       (SELECT COUNT(*) FROM company_events e WHERE e.company_id = co.id AND e.hidden_at IS NULL AND e.event_date > ?) AS events_12mo,
       (SELECT MAX(e.event_date) FROM company_events e WHERE e.company_id = co.id AND e.hidden_at IS NULL) AS last_event,
       (SELECT COUNT(*) FROM jobs j WHERE j.company_id = co.id AND j.status = 'open') AS open_jobs
     FROM saved_companies s JOIN companies co ON co.id = s.company_id WHERE s.user_id = ? ORDER BY co.name LIMIT 300`,
  ).bind(new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10), uid(c)).all();
  return c.json({ items: rows.results });
});

meRoutes.post('/api/me/saved-companies', async (c) => {
  const ent = c.get('ent');
  if (!ent.monitoring) throw planRequired('Company watchlists');
  const b = await body(c, z.object({ companyId: z.string().max(40) }));
  const id = uid(c);
  const co = await c.env.DB.prepare('SELECT id FROM companies WHERE id = ?').bind(b.companyId).first();
  if (!co) throw notFound();
  const n = (await c.env.DB.prepare('SELECT (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ?1 AND monitor = 1) + (SELECT COUNT(*) FROM saved_companies WHERE user_id = ?1 AND monitor = 1) AS n').bind(id).first<{ n: number }>())?.n ?? 0;
  if (n >= ent.maxWatches) throw badRequest(`You're watching the maximum of ${ent.maxWatches} jobs and companies.`);
  await c.env.DB.prepare('INSERT OR IGNORE INTO saved_companies (id, user_id, company_id, monitor, created_at) VALUES (?,?,?,1,?)').bind(newId('sc'), id, b.companyId, nowIso()).run();
  return c.json({ ok: true });
});

meRoutes.patch('/api/me/saved-companies/:id', async (c) => {
  const b = await body(c, z.object({ monitor: z.boolean() }));
  if (b.monitor && !c.get('ent').monitoring) throw planRequired('Company monitoring');
  const r = await c.env.DB.prepare('UPDATE saved_companies SET monitor = ? WHERE id = ? AND user_id = ?').bind(b.monitor ? 1 : 0, c.req.param('id'), uid(c)).run();
  if (!r.meta.changes) throw notFound();
  return c.json({ ok: true });
});

meRoutes.delete('/api/me/saved-companies/:id', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM saved_companies WHERE (id = ?1 OR company_id = ?1) AND user_id = ?2').bind(c.req.param('id'), uid(c)).run();
  if (!r.meta.changes) throw notFound();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- notifications

meRoutes.get('/api/me/notifications', async (c) => {
  const before = c.req.query('before');
  const rows = await c.env.DB.prepare(
    `SELECT id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ${before ? 'AND created_at < ?' : ''} ORDER BY created_at DESC LIMIT 30`,
  ).bind(...(before ? [uid(c), before] : [uid(c)])).all();
  return c.json({ items: rows.results, hasMore: rows.results.length === 30 });
});

meRoutes.post('/api/me/notifications/read', async (c) => {
  const b = await body(c, z.object({ ids: z.array(z.string().max(40)).max(100).optional(), all: z.boolean().optional() }));
  const now = nowIso();
  if (b.all) await c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').bind(now, uid(c)).run();
  else if (b.ids?.length) {
    await c.env.DB.batch(b.ids.map((i) => c.env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').bind(now, i, uid(c))));
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- comparisons

async function compareRows(c: Ctx, reportIds: string[]) {
  const id = uid(c);
  const ent = c.get('ent');
  const out = [];
  for (const rid of reportIds.slice(0, ent.maxCompareItems)) {
    const r = await c.env.DB.prepare('SELECT r.id, r.slug, a.report_json, a.created_at, j.status AS job_status FROM reports r JOIN analyses a ON a.id = r.analysis_id JOIN jobs j ON j.id = a.job_id WHERE r.id = ? AND r.user_id = ?')
      .bind(rid, id).first<{ id: string; slug: string; report_json: string; created_at: string; job_status: string }>();
    if (!r) continue;
    const rep = JSON.parse(r.report_json) as Report;
    const v = viewReport(rep, ent);
    out.push({
      reportId: r.id,
      slug: r.slug,
      analyzedAt: r.created_at,
      jobStatus: r.job_status,
      job: rep.job,
      posting: rep.posting,
      employer: rep.employer,
      confidence: rep.confidence,
      warnings: v.findings.filter((f) => f.polarity === 'warning' || f.polarity === 'caution').slice(0, 4).map((f) => f.title),
      payListed: rep.findings.some((f) => f.ruleId === 'pay_listed'),
    });
  }
  return out;
}

meRoutes.get('/api/me/compare', async (c) => {
  if (!c.get('ent').comparisons) throw planRequired('Job comparisons');
  const ids = (c.req.query('reports') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length < 2) throw badRequest('Pick at least two jobs to compare.');
  return c.json({ items: await compareRows(c, ids) });
});

const ComparisonBody = z.object({
  name: z.string().trim().min(1).max(120),
  reportIds: z.array(z.string().max(40)).min(2).max(6),
  weights: z.record(z.string().max(30), z.number().min(0).max(5)),
});

meRoutes.get('/api/me/comparisons', async (c) => {
  if (!c.get('ent').comparisons) return c.json({ items: [] });
  const rows = await c.env.DB.prepare('SELECT id, name, report_ids_json, weights_json, updated_at FROM comparisons WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50').bind(uid(c)).all<{ id: string; name: string; report_ids_json: string; weights_json: string; updated_at: string }>();
  return c.json({ items: rows.results.map((r) => ({ id: r.id, name: r.name, reportIds: parseJson<string[]>(r.report_ids_json, []), weights: parseJson(r.weights_json, {}), updatedAt: r.updated_at })) });
});

meRoutes.post('/api/me/comparisons', async (c) => {
  if (!c.get('ent').comparisons) throw planRequired('Saved comparisons');
  const b = await body(c, ComparisonBody);
  const now = nowIso();
  const id = newId('cmp');
  await c.env.DB.prepare('INSERT INTO comparisons (id, user_id, name, report_ids_json, weights_json, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, uid(c), b.name, JSON.stringify(b.reportIds), JSON.stringify(b.weights), now, now).run();
  return c.json({ id });
});

meRoutes.put('/api/me/comparisons/:id', async (c) => {
  if (!c.get('ent').comparisons) throw planRequired('Saved comparisons');
  const b = await body(c, ComparisonBody);
  const r = await c.env.DB.prepare('UPDATE comparisons SET name = ?, report_ids_json = ?, weights_json = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(b.name, JSON.stringify(b.reportIds), JSON.stringify(b.weights), nowIso(), c.req.param('id'), uid(c)).run();
  if (!r.meta.changes) throw notFound();
  return c.json({ ok: true });
});

meRoutes.delete('/api/me/comparisons/:id', async (c) => {
  const r = await c.env.DB.prepare('DELETE FROM comparisons WHERE id = ? AND user_id = ?').bind(c.req.param('id'), uid(c)).run();
  if (!r.meta.changes) throw notFound();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- saved filters

meRoutes.get('/api/me/saved-filters', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, scope, name, filters_json FROM saved_filters WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(uid(c)).all<{ id: string; scope: string; name: string; filters_json: string }>();
  return c.json({ items: rows.results.map((r) => ({ id: r.id, scope: r.scope, name: r.name, filters: parseJson(r.filters_json, {}) })) });
});

meRoutes.post('/api/me/saved-filters', async (c) => {
  if (!c.get('ent').savedFilters) throw planRequired('Saved filters');
  const b = await body(c, z.object({ scope: z.enum(['history', 'saved', 'compare']), name: z.string().trim().min(1).max(80), filters: z.record(z.string().max(30), z.union([z.string().max(200), z.number(), z.boolean()])) }));
  const id = newId('sf');
  await c.env.DB.prepare('INSERT INTO saved_filters (id, user_id, scope, name, filters_json, created_at) VALUES (?,?,?,?,?,?)').bind(id, uid(c), b.scope, b.name, JSON.stringify(b.filters), nowIso()).run();
  return c.json({ id });
});

meRoutes.delete('/api/me/saved-filters/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM saved_filters WHERE id = ? AND user_id = ?').bind(c.req.param('id'), uid(c)).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------- settings, export, deletion

const PrefsBody = z.object({
  name: z.string().trim().max(80).nullable().optional(),
  prefs: z.object({
    emailAlerts: z.boolean().optional(),
    weeklyDigest: z.boolean().optional(),
    deadlineEmails: z.boolean().optional(),
    defaultPublicReports: z.boolean().optional(),
    dashboard: z.object({ showStats: z.boolean().optional(), showAlerts: z.boolean().optional(), showRecent: z.boolean().optional() }).optional(),
  }).optional(),
});

meRoutes.patch('/api/me/prefs', async (c) => {
  const b = await body(c, PrefsBody);
  const user = c.get('user')!;
  const merged = { ...readPrefs(user.prefs_json), ...(b.prefs ?? {}) };
  await c.env.DB.prepare('UPDATE users SET prefs_json = ?, name = COALESCE(?, name) WHERE id = ?').bind(JSON.stringify(merged), b.name ?? null, user.id).run();
  return c.json({ ok: true, prefs: merged });
});

meRoutes.get('/api/me/export', async (c) => {
  if (!c.get('ent').exports) throw planRequired('CSV export');
  const rows = await c.env.DB.prepare(
    `SELECT j.title, co.name AS company, j.location, s.status, s.deadline, a.posting_label, a.employer_label, a.confidence_label, j.status AS listing_status, j.apply_url, s.notes, s.created_at
     FROM saved_jobs s JOIN jobs j ON j.id = s.job_id LEFT JOIN companies co ON co.id = j.company_id
     LEFT JOIN analyses a ON a.id = (SELECT id FROM analyses WHERE job_id = j.id ORDER BY created_at DESC LIMIT 1)
     WHERE s.user_id = ? ORDER BY s.created_at DESC`,
  ).bind(uid(c)).all<Record<string, string | null>>();
  const cols = ['title', 'company', 'location', 'status', 'deadline', 'posting_label', 'employer_label', 'confidence_label', 'listing_status', 'apply_url', 'notes', 'created_at'];
  const esc = (v: unknown) => {
    let s = v == null ? '' : String(v);
    // Stop spreadsheet formula injection from listing titles.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.results.map((r) => cols.map((k) => esc(r[k])).join(','))].join('\n');
  c.header('content-disposition', 'attachment; filename="jobsignal-saved-jobs.csv"');
  return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8' });
});

// Your data, all of it, for everyone (not just Pro). Privacy, not a feature.
meRoutes.get('/api/me/data', async (c) => {
  const id = uid(c);
  const user = c.get('user')!;
  const [reports, saved, companies, notes, comps] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT slug, is_public, created_at FROM reports WHERE user_id = ?').bind(id),
    c.env.DB.prepare('SELECT s.status, s.notes, s.deadline, s.created_at, j.title, j.source_url FROM saved_jobs s JOIN jobs j ON j.id = s.job_id WHERE s.user_id = ?').bind(id),
    c.env.DB.prepare('SELECT co.name, s.created_at FROM saved_companies s JOIN companies co ON co.id = s.company_id WHERE s.user_id = ?').bind(id),
    c.env.DB.prepare('SELECT title, body, created_at FROM notifications WHERE user_id = ?').bind(id),
    c.env.DB.prepare('SELECT name, report_ids_json, created_at FROM comparisons WHERE user_id = ?').bind(id),
  ]);
  c.header('content-disposition', 'attachment; filename="jobsignal-my-data.json"');
  return c.json({
    exportedAt: nowIso(),
    account: { email: user.email, name: user.name, createdAt: user.created_at, prefs: readPrefs(user.prefs_json) },
    subscription: await getSubscription(c.env, id).then((s) => s && { plan: s.plan, status: s.status, currentPeriodEnd: s.current_period_end }),
    reports: reports!.results, savedJobs: saved!.results, savedCompanies: companies!.results, notifications: notes!.results, comparisons: comps!.results,
  });
});

meRoutes.delete('/api/me', async (c) => {
  const b = await body(c, z.object({ confirmEmail: z.string() }));
  const user = c.get('user')!;
  if (b.confirmEmail.trim().toLowerCase() !== user.email) throw badRequest('Type your email address exactly to confirm.');
  const sub = await getSubscription(c.env, user.id);
  if (sub?.provider === 'stripe' && ['active', 'trialing', 'past_due'].includes(sub.status) && !sub.cancel_at_period_end) {
    throw new AppError('conflict', 'Cancel your Pro subscription first (Billing > Manage), so you are not charged again. Then delete your account.');
  }
  // ON DELETE CASCADE removes sessions, reports, saved items, notifications, comparisons, subscription row.
  // Analyses stay: they contain only public job data and nothing about you.
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE feedback SET user_id = NULL WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('UPDATE flags SET user_id = NULL WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM usage_records WHERE subject_key = ?').bind(`user:${user.id}`),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  c.header('set-cookie', 'js_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0', { append: true });
  return c.json({ ok: true });
});
