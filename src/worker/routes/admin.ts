// Admin API. Every route checks the role on the server (requireAdmin). The admin pages
// in the browser are just a UI for these. Every change is written to admin_audit_logs.

import { z } from 'zod';
import { body, createApp, requireAdmin, type Ctx } from '../app';
import { badRequest, notFound } from '../lib/errors';
import { newId, nowIso } from '../lib/util';
import { checkWatchedCompanies, ingestWarn, pruneOldData, recheckWatchedJobs, sendDeadlineReminders, sendWeeklyDigests } from '../services/monitoring';

export const adminRoutes = createApp();

adminRoutes.use('/api/admin/*', async (c, next) => {
  requireAdmin(c);
  return next();
});

async function audit(c: Ctx, action: string, target: string | null, detail?: unknown) {
  await c.env.DB.prepare('INSERT INTO admin_audit_logs (id, admin_user_id, action, target, detail, created_at) VALUES (?,?,?,?,?,?)')
    .bind(newId('aud'), c.get('user')!.id, action, target, detail === undefined ? null : JSON.stringify(detail).slice(0, 2000), nowIso()).run();
}

adminRoutes.get('/api/admin/overview', async (c) => {
  const day = new Date(Date.now() - 86_400_000).toISOString();
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [counts, perDay, labels] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE created_at > ?1) AS users_7d,
      (SELECT COUNT(*) FROM subscriptions WHERE plan = 'pro' AND status IN ('active','trialing','past_due')) AS pro_active,
      (SELECT COUNT(*) FROM subscriptions WHERE status = 'past_due') AS past_due,
      (SELECT COUNT(*) FROM analyses) AS analyses,
      (SELECT COUNT(*) FROM analyses WHERE created_at > ?2) AS analyses_24h,
      (SELECT COUNT(*) FROM reports WHERE created_at > ?2) AS reports_24h,
      (SELECT COUNT(*) FROM jobs) AS jobs,
      (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM warn_notices) AS warn_notices,
      (SELECT COUNT(*) FROM flags WHERE status = 'open') AS open_flags,
      (SELECT COUNT(*) FROM saved_jobs WHERE monitor = 1) AS watched_jobs,
      (SELECT COUNT(*) FROM feedback WHERE created_at > ?1) AS feedback_7d,
      (SELECT ROUND(AVG(helpful) * 100) FROM feedback WHERE helpful IS NOT NULL AND created_at > ?1) AS helpful_pct`).bind(week, day),
    c.env.DB.prepare(`SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM reports WHERE created_at > ? GROUP BY day ORDER BY day`).bind(new Date(Date.now() - 30 * 86_400_000).toISOString()),
    c.env.DB.prepare(`SELECT posting_label, COUNT(*) AS n FROM analyses WHERE created_at > ? GROUP BY posting_label`).bind(week),
  ]);
  return c.json({ counts: counts!.results[0], reportsPerDay: perDay!.results, postingLabels7d: labels!.results, mrrUsd: Math.round(((counts!.results[0] as { pro_active: number }).pro_active) * 7.99 * 100) / 100 });
});

adminRoutes.get('/api/admin/users', async (c) => {
  const q = (c.req.query('q') ?? '').trim().toLowerCase().slice(0, 100);
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.created_at, u.last_login_at, u.suspended_at, s.plan, s.status AS sub_status, s.provider,
       (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.id) AS reports
     FROM users u LEFT JOIN subscriptions s ON s.user_id = u.id ${q ? 'WHERE u.email LIKE ?' : ''} ORDER BY u.created_at DESC LIMIT 51 OFFSET ?`,
  ).bind(...(q ? [`%${q}%`, (page - 1) * 50] : [(page - 1) * 50])).all();
  return c.json({ items: rows.results.slice(0, 50), hasMore: rows.results.length > 50, page });
});

adminRoutes.patch('/api/admin/users/:id', async (c) => {
  const b = await body(c, z.object({ suspended: z.boolean() }));
  const id = c.req.param('id');
  if (id === c.get('user')!.id) throw badRequest("You can't suspend yourself.");
  const r = await c.env.DB.prepare('UPDATE users SET suspended_at = ? WHERE id = ?').bind(b.suspended ? nowIso() : null, id).run();
  if (!r.meta.changes) throw notFound();
  if (b.suspended) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  await audit(c, b.suspended ? 'user.suspend' : 'user.unsuspend', id);
  return c.json({ ok: true });
});

adminRoutes.get('/api/admin/subscriptions', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.*, u.email FROM subscriptions s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC LIMIT 200`,
  ).all();
  const events = await c.env.DB.prepare('SELECT id, type, received_at, processed_at, error FROM payment_events ORDER BY received_at DESC LIMIT 50').all();
  return c.json({ items: rows.results, paymentEvents: events.results });
});

adminRoutes.get('/api/admin/usage', async (c) => {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const top = await c.env.DB.prepare(
    `SELECT subject_key, COUNT(*) AS n FROM usage_records WHERE created_at > ? GROUP BY subject_key ORDER BY n DESC LIMIT 25`,
  ).bind(since).all<{ subject_key: string; n: number }>();
  // Anonymous subjects are hashed IPs. Show a short prefix only.
  return c.json({ top: top.results.map((r) => ({ subject: r.subject_key.startsWith('anon:') ? `visitor ${r.subject_key.slice(5, 13)}` : r.subject_key, n: r.n })) });
});

adminRoutes.get('/api/admin/providers', async (c) => {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [summary, failures, runs] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT provider, COUNT(*) AS total, SUM(ok) AS ok, ROUND(AVG(duration_ms)) AS avg_ms, MAX(created_at) AS last_at
      FROM provider_runs WHERE created_at > ? GROUP BY provider ORDER BY provider`).bind(since),
    c.env.DB.prepare('SELECT provider, operation, status_code, error, created_at FROM provider_runs WHERE ok = 0 ORDER BY created_at DESC LIMIT 50'),
    c.env.DB.prepare('SELECT name, started_at, finished_at, ok, summary, error FROM job_runs ORDER BY started_at DESC LIMIT 40'),
  ]);
  return c.json({ summary: summary!.results, failures: failures!.results, jobRuns: runs!.results });
});

const TASKS = {
  warn_ingest: (c: Ctx) => ingestWarn(c.env, { force: true }),
  job_recheck: (c: Ctx) => recheckWatchedJobs(c.env),
  company_watch: (c: Ctx) => checkWatchedCompanies(c.env),
  deadline_reminders: (c: Ctx) => sendDeadlineReminders(c.env),
  weekly_digest: (c: Ctx) => sendWeeklyDigests(c.env),
  prune: (c: Ctx) => pruneOldData(c.env),
} as const;

adminRoutes.post('/api/admin/tasks/:name', async (c) => {
  const name = c.req.param('name') as keyof typeof TASKS;
  if (!TASKS[name]) throw notFound('Unknown task.');
  await audit(c, 'task.run', name);
  const result = await TASKS[name](c);
  return c.json({ ok: result !== null, result });
});

adminRoutes.get('/api/admin/flags', async (c) => {
  const status = c.req.query('status') ?? 'open';
  const rows = await c.env.DB.prepare(
    `SELECT f.*, r.slug AS report_slug, co.name AS company_name, co.slug AS company_slug FROM flags f
     LEFT JOIN reports r ON r.id = f.report_id LEFT JOIN companies co ON co.id = f.company_id
     WHERE f.status = ? ORDER BY f.created_at DESC LIMIT 100`,
  ).bind(status).all();
  return c.json({ items: rows.results });
});

adminRoutes.patch('/api/admin/flags/:id', async (c) => {
  const b = await body(c, z.object({ status: z.enum(['open', 'resolved', 'dismissed']), note: z.string().max(2000).optional() }));
  const r = await c.env.DB.prepare('UPDATE flags SET status = ?, resolution_note = ?, resolved_at = ?, resolved_by = ? WHERE id = ?')
    .bind(b.status, b.note ?? null, b.status === 'open' ? null : nowIso(), c.get('user')!.id, c.req.param('id')).run();
  if (!r.meta.changes) throw notFound();
  await audit(c, 'flag.update', c.req.param('id'), b);
  return c.json({ ok: true });
});

// Data corrections: hide a wrongly matched public record from a company. Reversible.
adminRoutes.get('/api/admin/companies/:id/events', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM company_events WHERE company_id = ? ORDER BY event_date DESC LIMIT 200').bind(c.req.param('id')).all();
  return c.json({ items: rows.results });
});

adminRoutes.get('/api/admin/companies', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 100);
  const rows = await c.env.DB.prepare(
    `SELECT co.id, co.slug, co.name, co.domain, co.cik, co.ticker, (SELECT COUNT(*) FROM company_events e WHERE e.company_id = co.id) AS events,
      (SELECT COUNT(*) FROM company_aliases a WHERE a.company_id = co.id) AS aliases
     FROM companies co ${q ? 'WHERE co.name LIKE ?' : ''} ORDER BY co.updated_at DESC LIMIT 50`,
  ).bind(...(q ? [`%${q}%`] : [])).all();
  return c.json({ items: rows.results });
});

adminRoutes.patch('/api/admin/events/:id', async (c) => {
  const b = await body(c, z.object({ hidden: z.boolean(), reason: z.string().max(500).optional() }));
  const r = await c.env.DB.prepare('UPDATE company_events SET hidden_at = ? WHERE id = ?').bind(b.hidden ? nowIso() : null, c.req.param('id')).run();
  if (!r.meta.changes) throw notFound();
  await audit(c, b.hidden ? 'event.hide' : 'event.unhide', c.req.param('id'), { reason: b.reason });
  return c.json({ ok: true });
});

adminRoutes.patch('/api/admin/companies/:id', async (c) => {
  const b = await body(c, z.object({ name: z.string().trim().min(1).max(200).optional(), domain: z.string().trim().max(200).nullable().optional(), clearCik: z.boolean().optional() }));
  const id = c.req.param('id');
  const sets: string[] = [];
  const args: unknown[] = [];
  if (b.name) { sets.push('name = ?'); args.push(b.name); }
  if (b.domain !== undefined) { sets.push('domain = ?'); args.push(b.domain || null); }
  if (b.clearCik) { sets.push('cik = NULL, ticker = NULL, sec_checked_at = ?'); args.push(nowIso()); }
  if (!sets.length) return c.json({ ok: true });
  sets.push('updated_at = ?');
  args.push(nowIso());
  const r = await c.env.DB.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
  if (!r.meta.changes) throw notFound();
  if (b.clearCik) await c.env.DB.prepare("DELETE FROM company_events WHERE company_id = ? AND (kind LIKE 'sec_%' OR kind = 'going_concern')").bind(id).run();
  await audit(c, 'company.update', id, b);
  return c.json({ ok: true });
});

adminRoutes.get('/api/admin/feature-flags', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM feature_flags ORDER BY key').all();
  return c.json({ items: rows.results });
});

adminRoutes.patch('/api/admin/feature-flags/:key', async (c) => {
  const b = await body(c, z.object({ enabled: z.boolean() }));
  const r = await c.env.DB.prepare('UPDATE feature_flags SET enabled = ?, updated_at = ? WHERE key = ?').bind(b.enabled ? 1 : 0, nowIso(), c.req.param('key')).run();
  if (!r.meta.changes) throw notFound();
  await audit(c, 'flag.toggle', c.req.param('key'), b);
  return c.json({ ok: true });
});

adminRoutes.get('/api/admin/announcements', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50').all();
  return c.json({ items: rows.results });
});

adminRoutes.post('/api/admin/announcements', async (c) => {
  const b = await body(c, z.object({ message: z.string().trim().min(3).max(300), level: z.enum(['info', 'warning']), expiresAt: z.string().datetime().optional() }));
  const id = newId('ann');
  await c.env.DB.prepare('INSERT INTO announcements (id, message, level, active, created_at, expires_at) VALUES (?,?,?,1,?,?)').bind(id, b.message, b.level, nowIso(), b.expiresAt ?? null).run();
  await audit(c, 'announcement.create', id, b);
  return c.json({ id });
});

adminRoutes.patch('/api/admin/announcements/:id', async (c) => {
  const b = await body(c, z.object({ active: z.boolean() }));
  await c.env.DB.prepare('UPDATE announcements SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, c.req.param('id')).run();
  await audit(c, 'announcement.toggle', c.req.param('id'), b);
  return c.json({ ok: true });
});

adminRoutes.get('/api/admin/feedback', async (c) => {
  const rows = await c.env.DB.prepare('SELECT f.helpful, f.comment, f.created_at, r.slug FROM feedback f LEFT JOIN reports r ON r.id = f.report_id ORDER BY f.created_at DESC LIMIT 100').all();
  return c.json({ items: rows.results });
});

adminRoutes.get('/api/admin/audit', async (c) => {
  const rows = await c.env.DB.prepare('SELECT a.*, u.email AS admin_email FROM admin_audit_logs a LEFT JOIN users u ON u.id = a.admin_user_id ORDER BY a.created_at DESC LIMIT 100').all();
  return c.json({ items: rows.results });
});
