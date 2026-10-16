// Scheduled work. Runs from the Cron Trigger in wrangler.jsonc, and admins can run each
// task by hand from the admin panel.
//
// Free-plan Workers allow 50 outbound requests per invocation, so every task has a budget
// and works through its queue oldest-first across runs. Nothing here invents activity:
// an alert only exists if a real recheck found a real change.

import type { Env } from '../env';
import { planFor } from '@shared/entitlements';
import { newId, nowIso } from '../lib/util';
import { log } from '../lib/log';
import { fetchPosting, parseJobUrl } from '../providers';
import { WARN_SOURCES } from '../providers/warn';
import { buildEmployerEvidence, getCompany, loadEvents, syncWarnEvents } from './companies';
import { emailConfigured, sendEmail } from './email';
import { getJob, recordObservation } from './jobs';
import { notify, readPrefs } from './notifications';

export const RECHECK_BATCH = 15;
const RECHECK_MIN_HOURS = 12;

async function track<T>(env: Env, name: string, fn: () => Promise<T>): Promise<T | null> {
  const id = newId('run');
  await env.DB.prepare('INSERT INTO job_runs (id, name, started_at) VALUES (?,?,?)').bind(id, name, nowIso()).run();
  try {
    const out = await fn();
    await env.DB.prepare('UPDATE job_runs SET finished_at = ?, ok = 1, summary = ? WHERE id = ?').bind(nowIso(), JSON.stringify(out).slice(0, 1000), id).run();
    return out;
  } catch (e) {
    log('error', 'job_failed', { name, error: String(e) });
    await env.DB.prepare('UPDATE job_runs SET finished_at = ?, ok = 0, error = ? WHERE id = ?').bind(nowIso(), String(e).slice(0, 1000), id).run();
    return null;
  }
}

async function lastSuccess(env: Env, name: string): Promise<string | null> {
  const r = await env.DB.prepare('SELECT started_at FROM job_runs WHERE name = ? AND ok = 1 ORDER BY started_at DESC LIMIT 1').bind(name).first<{ started_at: string }>();
  return r?.started_at ?? null;
}

// ------------------------------------------------------------------ WARN ingest

export async function ingestWarn(env: Env, opts: { force?: boolean } = {}) {
  return track(env, 'warn_ingest', async () => {
    const flag = await env.DB.prepare("SELECT enabled FROM feature_flags WHERE key = 'warn_ingest'").first<{ enabled: number }>();
    if (flag && flag.enabled === 0 && !opts.force) return { skipped: 'disabled' };
    const last = await lastSuccess(env, 'warn_ingest');
    if (!opts.force && last && Date.now() - Date.parse(last) < 20 * 3600_000) return { skipped: 'ran_recently' };
    const since = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString();
    const results: Record<string, number | string> = {};
    for (const src of WARN_SOURCES) {
      try {
        const rows = await src.fetch(env, since);
        const now = nowIso();
        const stmts = rows.map((r) => env.DB.prepare(
          `INSERT INTO warn_notices (id, state, source_record_id, employer, employer_normalized, notice_date, effective_date, city, county, employees_affected, layoff_type, source_url, ingested_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(state, source_record_id) DO UPDATE SET employer_normalized = excluded.employer_normalized
             WHERE warn_notices.employer_normalized != excluded.employer_normalized`,
        ).bind(newId('wn'), r.state, r.sourceRecordId, r.employer, r.employerNormalized, r.noticeDate ?? null, r.effectiveDate ?? null, r.city ?? null, r.county ?? null, r.employeesAffected ?? null, r.layoffType ?? null, r.sourceUrl, now));
        let inserted = 0;
        for (let i = 0; i < stmts.length; i += 100) {
          const res = await env.DB.batch(stmts.slice(i, i + 100));
          inserted += res.reduce((s, x) => s + (x.meta.changes ?? 0), 0);
        }
        results[src.state] = inserted;
        await env.DB.prepare('INSERT INTO provider_runs (id, provider, operation, ok, duration_ms, created_at) VALUES (?,?,?,?,?,?)')
          .bind(newId('pr'), `warn_${src.state.toLowerCase()}`, 'ingest_rows', 1, 0, now).run();
      } catch (e) {
        results[src.state] = `error: ${String(e).slice(0, 120)}`;
        await env.DB.prepare('INSERT INTO provider_runs (id, provider, operation, ok, duration_ms, error, created_at) VALUES (?,?,?,?,?,?,?)')
          .bind(newId('pr'), `warn_${src.state.toLowerCase()}`, 'ingest', 0, 0, String(e).slice(0, 300), nowIso()).run();
      }
    }
    return results;
  });
}

// ------------------------------------------------------------------ job rechecks

interface WatchedJob { job_id: string; user_id: string; sub_plan: string | null; sub_status: string | null; sub_end: string | null }

export async function recheckWatchedJobs(env: Env, limit = RECHECK_BATCH) {
  return track(env, 'job_recheck', async () => {
    const cutoff = new Date(Date.now() - RECHECK_MIN_HOURS * 3600_000).toISOString();
    const due = await env.DB.prepare(
      `SELECT DISTINCT j.id FROM saved_jobs s JOIN jobs j ON j.id = s.job_id
       WHERE s.monitor = 1 AND j.source_kind IN ('greenhouse','lever','ashby','jsonld') AND j.last_checked_at < ?
       ORDER BY j.last_checked_at ASC LIMIT ?`,
    ).bind(cutoff, limit).all<{ id: string }>();
    let checked = 0;
    let changes = 0;
    for (const { id } of due.results) {
      const job = await getJob(env, id);
      if (!job?.source_url) continue;
      // Only spend requests on jobs that still have at least one Pro watcher.
      const watchers = (await env.DB.prepare(
        `SELECT s.job_id, s.user_id, sub.plan AS sub_plan, sub.status AS sub_status, sub.current_period_end AS sub_end
         FROM saved_jobs s LEFT JOIN subscriptions sub ON sub.user_id = s.user_id WHERE s.job_id = ? AND s.monitor = 1`,
      ).bind(id).all<WatchedJob>()).results.filter((w) => planFor(w.sub_plan ? { plan: w.sub_plan, status: w.sub_status!, current_period_end: w.sub_end } : null) === 'pro');
      if (!watchers.length) {
        await env.DB.prepare('UPDATE jobs SET last_checked_at = ? WHERE id = ?').bind(nowIso(), id).run();
        continue;
      }
      try {
        const ref = parseJobUrl(new URL(job.source_url));
        const result = await fetchPosting(env, ref, { fresh: true });
        if (result.posting.fetchOutcome !== 'ok' && result.posting.fetchOutcome !== 'not_found' && result.posting.fetchOutcome !== 'gone') {
          // Couldn't read it this time. Don't claim it closed. Try again next run.
          await env.DB.prepare('UPDATE jobs SET last_checked_at = ? WHERE id = ?').bind(nowIso(), id).run();
          continue;
        }
        const obs = await recordObservation(env, { canonicalKey: job.canonical_key, posting: result.posting }, job.company_id, 'monitor');
        checked++;
        const day = nowIso().slice(0, 10);
        const events: Array<{ kind: string; title: string; body: string }> = [];
        if (obs.changed.closed) events.push({ kind: 'closed', title: `Listing closed: ${job.title}`, body: `The ${job.title} listing is no longer published on the employer's job board. It may have been filled or paused.` });
        if (obs.changed.reopened) events.push({ kind: 'reopened', title: `Listing is back: ${job.title}`, body: `The ${job.title} listing was taken down earlier and has been published again.` });
        if (obs.changed.descriptionChanged) events.push({ kind: 'changed', title: `Listing edited: ${job.title}`, body: `The description for ${job.title} changed since we last checked. Open it to see what's different.` });
        for (const e of events) {
          changes++;
          for (const w of watchers) {
            await notify(env, w.user_id, { kind: 'job_change', title: e.title, body: e.body, link: `/saved?job=${id}`, dedupeKey: `job:${id}:${e.kind}:${day}`, email: true });
          }
        }
      } catch (e) {
        log('warn', 'recheck_failed', { jobId: id, error: String(e) });
        await env.DB.prepare('UPDATE jobs SET last_checked_at = ? WHERE id = ?').bind(nowIso(), id).run();
      }
    }
    return { due: due.results.length, checked, changes };
  });
}

// ------------------------------------------------------------------ company watches

export async function checkWatchedCompanies(env: Env) {
  return track(env, 'company_watch', async () => {
    const since = (await lastSuccess(env, 'company_watch')) ?? new Date(Date.now() - 86_400_000).toISOString();
    const companies = await env.DB.prepare('SELECT DISTINCT company_id FROM saved_companies WHERE monitor = 1 LIMIT 500').all<{ company_id: string }>();
    let alerts = 0;
    // Refresh SEC data for a few watched public companies per run (about 5 requests each),
    // oldest first. Everything else is matched from data already in the database.
    const secDue = await env.DB.prepare(
      'SELECT c.id FROM companies c WHERE c.cik IS NOT NULL AND c.id IN (SELECT company_id FROM saved_companies WHERE monitor = 1) ORDER BY c.updated_at ASC LIMIT 3',
    ).all<{ id: string }>();
    for (const { id } of secDue.results) {
      const c = await getCompany(env, id);
      if (!c) continue;
      await buildEmployerEvidence(env, c, nowIso());
      await env.DB.prepare('UPDATE companies SET updated_at = ? WHERE id = ?').bind(nowIso(), id).run();
    }
    for (const { company_id } of companies.results) {
      const c = await getCompany(env, company_id);
      if (!c) continue;
      await syncWarnEvents(env, c);  // DB only, no outbound requests
      const fresh = await env.DB.prepare('SELECT id, kind, event_date, title, source_name FROM company_events WHERE company_id = ? AND created_at > ? AND hidden_at IS NULL')
        .bind(company_id, since).all<{ id: string; kind: string; event_date: string; title: string; source_name: string }>();
      if (!fresh.results.length) continue;
      const watchers = await env.DB.prepare(
        `SELECT s.user_id, sub.plan, sub.status, sub.current_period_end FROM saved_companies s LEFT JOIN subscriptions sub ON sub.user_id = s.user_id WHERE s.company_id = ? AND s.monitor = 1`,
      ).bind(company_id).all<{ user_id: string; plan: string | null; status: string | null; current_period_end: string | null }>();
      for (const ev of fresh.results) {
        for (const w of watchers.results) {
          if (planFor(w.plan ? { plan: w.plan, status: w.status!, current_period_end: w.current_period_end } : null) !== 'pro') continue;
          const ok = await notify(env, w.user_id, {
            kind: 'company_event',
            title: `New public record for ${c.name}`,
            body: `${ev.title} (${ev.event_date}), from ${ev.source_name}.`,
            link: `/companies/${c.slug}`,
            dedupeKey: `event:${ev.id}`,
            email: true,
          });
          if (ok) alerts++;
        }
      }
    }
    return { companies: companies.results.length, alerts };
  });
}

// ------------------------------------------------------------------ reminders

export async function sendDeadlineReminders(env: Env) {
  return track(env, 'deadline_reminders', async () => {
    const due = await env.DB.prepare(
      `SELECT s.id, s.user_id, s.deadline, j.title, j.id AS job_id FROM saved_jobs s JOIN jobs j ON j.id = s.job_id
       WHERE s.remind_at IS NOT NULL AND s.remind_at <= ? AND s.reminder_sent_at IS NULL LIMIT 200`,
    ).bind(nowIso()).all<{ id: string; user_id: string; deadline: string | null; title: string; job_id: string }>();
    for (const r of due.results) {
      await notify(env, r.user_id, {
        kind: 'deadline',
        title: `Reminder: ${r.title}`,
        body: r.deadline ? `You set a deadline of ${r.deadline.slice(0, 10)} for this application.` : 'You asked us to remind you about this application.',
        link: `/saved?job=${r.job_id}`,
        dedupeKey: `deadline:${r.id}:${r.deadline ?? ''}`,
        email: true,
      });
      await env.DB.prepare('UPDATE saved_jobs SET reminder_sent_at = ? WHERE id = ?').bind(nowIso(), r.id).run();
    }
    return { sent: due.results.length };
  });
}

// ------------------------------------------------------------------ weekly digest

export async function sendWeeklyDigests(env: Env) {
  return track(env, 'weekly_digest', async () => {
    if (!emailConfigured(env)) return { skipped: 'email_not_configured' };
    const users = await env.DB.prepare(
      `SELECT u.id, u.email, u.prefs_json, s.plan, s.status, s.current_period_end FROM users u JOIN subscriptions s ON s.user_id = u.id WHERE u.suspended_at IS NULL`,
    ).all<{ id: string; email: string; prefs_json: string; plan: string; status: string; current_period_end: string | null }>();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    let sent = 0;
    for (const u of users.results) {
      if (planFor({ plan: u.plan, status: u.status, current_period_end: u.current_period_end }) !== 'pro') continue;
      if (!readPrefs(u.prefs_json).weeklyDigest) continue;
      const [notes, watches] = await env.DB.batch([
        env.DB.prepare("SELECT title, body FROM notifications WHERE user_id = ? AND created_at > ? AND kind IN ('job_change','company_event') ORDER BY created_at DESC LIMIT 15").bind(u.id, since),
        env.DB.prepare('SELECT (SELECT COUNT(*) FROM saved_jobs WHERE user_id = ? AND monitor = 1) AS jobs, (SELECT COUNT(*) FROM saved_companies WHERE user_id = ? AND monitor = 1) AS companies').bind(u.id, u.id),
      ]);
      const n = notes!.results as Array<{ title: string; body: string }>;
      const w = watches!.results[0] as { jobs: number; companies: number };
      if (!w.jobs && !w.companies) continue;
      const lines = n.length
        ? n.map((x) => `- ${x.title}`).join('\n')
        : 'Nothing changed on the jobs and companies you watch. Quiet weeks are normal.';
      const r = await sendEmail(env, {
        to: u.email,
        subject: n.length ? `Your JobSignal week: ${n.length} update${n.length === 1 ? '' : 's'}` : 'Your JobSignal week: no changes',
        text: `Here's what changed in the last 7 days.\n\n${lines}\n\nYou're watching ${w.jobs} job${w.jobs === 1 ? '' : 's'} and ${w.companies} compan${w.companies === 1 ? 'y' : 'ies'}.`,
        action: { label: 'Open your dashboard', url: `${env.APP_URL}/dashboard` },
      });
      if (r.sent) sent++;
    }
    return { sent };
  });
}

// ------------------------------------------------------------------ housekeeping

export async function pruneOldData(env: Env) {
  return track(env, 'prune', async () => {
    const now = nowIso();
    const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    const res = await env.DB.batch([
      env.DB.prepare('DELETE FROM fetch_cache WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(days(1)),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM provider_runs WHERE created_at < ?').bind(days(30)),
      env.DB.prepare('DELETE FROM usage_records WHERE created_at < ?').bind(days(40)),
      env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(Math.floor(Date.now() / 1000) - 2 * 86_400),
      env.DB.prepare('DELETE FROM job_runs WHERE started_at < ?').bind(days(60)),
      // Anonymous reports that were never shared: keep 30 days so the link still works for a while.
      env.DB.prepare('DELETE FROM reports WHERE user_id IS NULL AND is_public = 0 AND created_at < ?').bind(days(30)),
    ]);
    return { deleted: res.reduce((s, r) => s + (r.meta.changes ?? 0), 0) };
  });
}

export async function runScheduled(env: Env, cron: string): Promise<void> {
  if (cron === '0 14 * * 1') {
    await sendWeeklyDigests(env);
    return;
  }
  await ingestWarn(env);
  await checkWatchedCompanies(env);
  await recheckWatchedJobs(env);
  await sendDeadlineReminders(env);
  await pruneOldData(env);
}

export { loadEvents };
