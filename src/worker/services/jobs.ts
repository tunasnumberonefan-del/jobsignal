// Job records and the observation log. This is where posting history comes from, and it
// only ever contains things JobSignal actually saw. No back-filled dates.

import type { Env } from '../env';
import type { PostingEvidence, PostingHistory } from '@shared/types';
import { postingFingerprint } from '@shared/normalize';
import { newId, nowIso, sha256Hex } from '../lib/util';
import type { AdapterResult } from '../providers/types';

export interface JobRow {
  id: string;
  canonical_key: string;
  company_id: string | null;
  source_kind: string;
  source_url: string | null;
  apply_url: string | null;
  title: string;
  location: string | null;
  employment_type: string | null;
  compensation_text: string | null;
  published_at: string | null;
  source_updated_at: string | null;
  valid_through: string | null;
  fingerprint: string;
  status: 'open' | 'closed' | 'unknown';
  first_seen_at: string;
  last_seen_at: string;
  last_checked_at: string;
  closed_at: string | null;
  reopened_count: number;
  content_hash: string | null;
  created_at: string;
}

export async function getJob(env: Env, id: string): Promise<JobRow | null> {
  return env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<JobRow>();
}

export async function getJobByKey(env: Env, key: string): Promise<JobRow | null> {
  return env.DB.prepare('SELECT * FROM jobs WHERE canonical_key = ?').bind(key).first<JobRow>();
}

export async function contentHash(p: Pick<PostingEvidence, 'title' | 'descriptionText'>): Promise<string> {
  const norm = (p.title + '\n' + p.descriptionText).replace(/\s+/g, ' ').trim().toLowerCase();
  return (await sha256Hex(norm)).slice(0, 32);
}

export interface ObservationOutcome {
  job: JobRow;
  history: PostingHistory;
  changed: { reopened: boolean; closed: boolean; descriptionChanged: boolean };
}

/**
 * Record that we looked at a posting. Creates the job if it's new, updates status,
 * stores a description version if the text changed, and returns the history we know.
 */
export async function recordObservation(
  env: Env,
  result: Pick<AdapterResult, 'canonicalKey' | 'posting'>,
  companyId: string | null,
  via: 'analysis' | 'monitor' | 'board_scan' | 'manual',
): Promise<ObservationOutcome> {
  const now = nowIso();
  const p = result.posting;
  const live = p.fetchOutcome === 'ok' || via === 'manual';
  const missing = p.fetchOutcome === 'not_found' || p.fetchOutcome === 'gone';
  const hash = live && p.descriptionText ? await contentHash(p) : null;
  let job = await getJobByKey(env, result.canonicalKey);
  const changed = { reopened: false, closed: false, descriptionChanged: false };

  if (!job) {
    const id = newId('job');
    await env.DB.prepare(
      `INSERT INTO jobs (id, canonical_key, company_id, source_kind, source_url, apply_url, title, location, employment_type, compensation_text,
        published_at, source_updated_at, valid_through, fingerprint, status, first_seen_at, last_seen_at, last_checked_at, closed_at, content_hash, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, result.canonicalKey, companyId, p.sourceKind, p.canonicalUrl ?? p.inputUrl ?? null, p.applyUrl ?? null, p.title || 'Untitled listing',
      p.location ?? null, p.employmentType ?? null, p.compensationText ?? null, p.publishedAt ?? null, p.sourceUpdatedAt ?? null, p.validThrough ?? null,
      postingFingerprint(p.employerName, p.title, p.location), live ? 'open' : missing ? 'closed' : 'unknown', now, now, now, missing ? now : null, hash, now,
    ).run();
    job = (await getJob(env, id))!;
  } else {
    let status = job.status;
    let closedAt = job.closed_at;
    let reopened = job.reopened_count;
    if (live && job.status === 'closed') {
      status = 'open';
      closedAt = null;
      reopened += 1;
      changed.reopened = true;
    } else if (missing && job.status === 'open') {
      status = 'closed';
      closedAt = now;
      changed.closed = true;
    } else if (live) {
      status = 'open';
    }
    if (live && hash && job.content_hash && hash !== job.content_hash) changed.descriptionChanged = true;
    // Only overwrite descriptive fields when we have a live read. A 404 shouldn't erase the title we knew.
    await env.DB.prepare(
      `UPDATE jobs SET status = ?, closed_at = ?, reopened_count = ?, last_checked_at = ?,
         last_seen_at = CASE WHEN ? THEN ? ELSE last_seen_at END,
         company_id = COALESCE(company_id, ?),
         title = CASE WHEN ? THEN ? ELSE title END,
         location = CASE WHEN ? THEN ? ELSE location END,
         compensation_text = CASE WHEN ? THEN ? ELSE compensation_text END,
         published_at = COALESCE(?, published_at),
         source_updated_at = COALESCE(?, source_updated_at),
         valid_through = COALESCE(?, valid_through),
         content_hash = COALESCE(?, content_hash)
       WHERE id = ?`,
    ).bind(
      status, closedAt, reopened, now,
      live ? 1 : 0, now,
      companyId,
      live && p.title ? 1 : 0, p.title,
      live ? 1 : 0, p.location ?? null,
      live ? 1 : 0, p.compensationText ?? null,
      p.publishedAt ?? null, p.sourceUpdatedAt ?? null, p.validThrough ?? null,
      hash, job.id,
    ).run();
    job = (await getJob(env, job.id))!;
  }

  if (hash) {
    await env.DB.prepare('INSERT OR IGNORE INTO job_versions (id, job_id, content_hash, title, description_text, observed_at) VALUES (?,?,?,?,?,?)')
      .bind(newId('jv'), job.id, hash, p.title, p.descriptionText.slice(0, 40_000), now)
      .run();
  }
  await env.DB.prepare('INSERT INTO job_observations (id, job_id, observed_at, result, content_hash, via) VALUES (?,?,?,?,?,?)')
    .bind(newId('ob'), job.id, now, via === 'manual' ? 'manual' : live ? 'found' : missing ? 'missing' : 'error', hash, via)
    .run();

  return { job, history: await loadHistory(env, job), changed };
}

export async function loadHistory(env: Env, job: JobRow): Promise<PostingHistory> {
  const [obs, versions, similar] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM job_observations WHERE job_id = ? AND result IN ('found','manual')").bind(job.id),
    env.DB.prepare('SELECT COUNT(*) AS n FROM job_versions WHERE job_id = ?').bind(job.id),
    env.DB.prepare('SELECT canonical_key, first_seen_at, last_seen_at, status FROM jobs WHERE fingerprint = ? AND id != ? ORDER BY first_seen_at LIMIT 20').bind(job.fingerprint, job.id),
  ]);
  const n = (obs!.results[0] as { n: number }).n;
  const v = (versions!.results[0] as { n: number }).n;
  return {
    firstSeenAt: job.first_seen_at,
    lastSeenAt: job.last_seen_at,
    observationCount: n,
    closedAt: job.closed_at ?? undefined,
    reopenedCount: job.reopened_count,
    similarPostings: (similar!.results as Array<{ canonical_key: string; first_seen_at: string; last_seen_at: string; status: string }>).map((s) => ({
      key: s.canonical_key, firstSeenAt: s.first_seen_at, lastSeenAt: s.last_seen_at, status: s.status,
    })),
    descriptionChanges: Math.max(0, v - 1),
  };
}

/**
 * When we read a whole job board, remember every listing on it (title, location, first seen).
 * This is how repost history builds up without anyone having to check each job.
 * Listings we knew about that are no longer on the board get marked closed.
 * Capped so one huge board can't eat the daily write budget.
 */
export async function scanBoard(
  env: Env,
  boardPrefix: string,              // 'greenhouse:airbnb'
  companyId: string | null,
  companyName: string | undefined,
  sourceKind: string,
  jobs: Array<{ id: string; title: string; location?: string }>,
): Promise<{ added: number; closed: number }> {
  if (jobs.length === 0 || jobs.length > 400) return { added: 0, closed: 0 };
  const marker = `board_scan:${boardPrefix}`;
  const recent = await env.DB.prepare("SELECT 1 FROM fetch_cache WHERE key = ? AND expires_at > ?").bind(marker, nowIso()).first();
  if (recent) return { added: 0, closed: 0 };

  const now = nowIso();
  const keys = jobs.map((j) => `${boardPrefix}:${j.id.toLowerCase()}`);
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 90) {
    const slice = keys.slice(i, i + 90);
    const r = await env.DB.prepare(`SELECT canonical_key FROM jobs WHERE canonical_key IN (${slice.map(() => '?').join(',')})`).bind(...slice).all<{ canonical_key: string }>();
    r.results.forEach((x) => existing.add(x.canonical_key));
  }
  const stmts: D1PreparedStatement[] = [];
  jobs.forEach((j, i) => {
    const key = keys[i]!;
    if (existing.has(key)) {
      stmts.push(env.DB.prepare("UPDATE jobs SET last_seen_at = ?, last_checked_at = ?, status = 'open' WHERE canonical_key = ? AND status != 'closed'").bind(now, now, key));
    } else {
      stmts.push(env.DB.prepare(
        `INSERT OR IGNORE INTO jobs (id, canonical_key, company_id, source_kind, title, location, fingerprint, status, first_seen_at, last_seen_at, last_checked_at, created_at)
         VALUES (?,?,?,?,?,?,?, 'open', ?,?,?,?)`,
      ).bind(newId('job'), key, companyId, sourceKind, j.title, j.location ?? null, postingFingerprint(companyName, j.title, j.location), now, now, now, now));
    }
  });
  // Close listings from this board that we previously saw open and that aren't there now.
  // (D1 caps bound parameters at 100 per query, so diff in JS instead of NOT IN (...).)
  const onBoard = new Set(keys);
  const open = await env.DB.prepare("SELECT id, canonical_key FROM jobs WHERE canonical_key LIKE ? AND status = 'open'")
    .bind(`${boardPrefix}:%`).all<{ id: string; canonical_key: string }>();
  let closed = 0;
  for (const j of open.results) {
    if (onBoard.has(j.canonical_key)) continue;
    closed++;
    stmts.push(env.DB.prepare("UPDATE jobs SET status = 'closed', closed_at = ? WHERE id = ?").bind(now, j.id));
    stmts.push(env.DB.prepare("INSERT INTO job_observations (id, job_id, observed_at, result, via) VALUES (?,?,?,'missing','board_scan')").bind(newId('ob'), j.id, now));
  }
  stmts.push(env.DB.prepare('INSERT OR REPLACE INTO fetch_cache (key, status, body, fetched_at, expires_at) VALUES (?,?,?,?,?)')
    .bind(marker, 200, '', now, new Date(Date.now() + 20 * 3600_000).toISOString()));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  return { added: jobs.length - existing.size, closed };
}
