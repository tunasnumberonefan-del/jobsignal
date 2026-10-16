// The flagship flow: URL (or pasted text) in, report out.
//
// 1. Work out what the URL is and read it from the most official source available.
// 2. Record the observation (this is what builds posting history over time).
// 3. Resolve the employer and gather public records (WARN, SEC).
// 4. Run the deterministic scoring engine.
// 5. Store the analysis once, and give this person their own report row pointing at it.
//
// If two people check the same Greenhouse job within the hour, the second one reuses
// the first analysis instead of hitting every upstream source again.

import type { Env } from '../env';
import type { EvidenceBundle, PostingEvidence, Report } from '@shared/types';
import { buildReport } from '@shared/scoring/engine';
import { SCORING_VERSION } from '@shared/scoring/config';
import { postingFingerprint } from '@shared/normalize';
import { AppError, badRequest } from '../lib/errors';
import { UpstreamError, UrlRejected, validatePublicUrl } from '../lib/http';
import { log } from '../lib/log';
import { newId, nowIso, randomToken, sha256Hex } from '../lib/util';
import { fetchPosting, parseJobUrl } from '../providers';
import type { AdapterResult } from '../providers/types';
import { buildEmployerEvidence, resolveCompany } from './companies';
import { getJobByKey, recordObservation, scanBoard } from './jobs';

export interface AnalyzeInput {
  url?: string;
  manual?: { text: string; title?: string; company?: string; location?: string };
}

export interface Actor {
  userId: string | null;
  anonId: string | null;
}

export interface AnalyzeResult {
  reportId: string;
  slug: string;
  analysisId: string;
  report: Report;
  reused: boolean;
  /** True if this person already had a report for this exact analysis (doesn't count against quota). */
  alreadyHad: boolean;
}

const REUSE_WINDOW_MS = 60 * 60_000;

function manualPosting(m: NonNullable<AnalyzeInput['manual']>): PostingEvidence {
  return {
    sourceKind: 'manual',
    liveOnOfficialSource: null,
    fetchOutcome: null,
    employerName: m.company?.trim() || undefined,
    title: m.title?.trim() || 'Untitled listing',
    location: m.location?.trim() || undefined,
    descriptionText: m.text.trim().slice(0, 40_000),
    sources: [{ name: 'Text you pasted', reliability: 'user_supplied' }],
  };
}

export async function analyze(env: Env, input: AnalyzeInput, actor: Actor): Promise<AnalyzeResult> {
  const now = nowIso();
  let adapter: AdapterResult;
  let inputKind: 'url' | 'manual';

  if (input.url) {
    inputKind = 'url';
    let url: URL;
    try {
      url = validatePublicUrl(input.url);
    } catch (e) {
      if (e instanceof UrlRejected) throw new AppError('unsupported_url', e.message);
      throw e;
    }
    const ref = parseJobUrl(url);

    // Fast path: same ATS job analyzed recently by anyone -> reuse that analysis.
    if (ref.board && ref.jobId && !ref.boardGuessed) {
      const key = `${ref.kind}:${ref.board.toLowerCase()}:${ref.jobId.toLowerCase()}`;
      const reused = await tryReuse(env, key, actor, now);
      if (reused) return reused;
    }

    try {
      adapter = await fetchPosting(env, ref);
    } catch (e) {
      if (e instanceof UrlRejected) throw new AppError('unsupported_url', e.message);
      if (e instanceof UpstreamError) {
        log('warn', 'upstream_failed', { provider: e.provider, status: e.status });
        throw new AppError('upstream_unavailable', `We couldn't reach ${e.provider[0]!.toUpperCase() + e.provider.slice(1)} just now. Nothing was counted against your limit. Try again in a minute, or paste the description instead.`);
      }
      throw e;
    }

    // Couldn't read the page but the person pasted text as a fallback: use their text,
    // keep the fetch outcome so the report says plainly that it wasn't verified.
    const p = adapter.posting;
    if (p.fetchOutcome !== 'ok' && input.manual?.text?.trim()) {
      const m = manualPosting(input.manual);
      adapter.posting = { ...p, title: m.title, employerName: m.employerName, location: m.location, descriptionText: m.descriptionText, sources: [...p.sources, ...m.sources] };
    } else if (p.fetchOutcome !== 'ok') {
      // Closed listing we've seen before: keep what we knew so the report isn't blank.
      const known = await getJobByKey(env, adapter.canonicalKey);
      if (known) adapter.posting = { ...p, title: known.title, location: known.location ?? undefined };
      if (!known && p.fetchOutcome !== 'not_found' && p.fetchOutcome !== 'gone') {
        throw new AppError('unsupported_url', p.fetchOutcome === 'blocked'
          ? "That site doesn't allow automated checks, so we didn't read it. Paste the job description below and we'll check the text."
          : "We couldn't find job details on that page. Paste the description below and we'll check the text instead.", { needsManual: true, outcome: p.fetchOutcome });
      }
    }
    // Fill only what the source didn't give us. Never overwrite official data with typed-in data.
    if (!adapter.posting.employerName && input.manual?.company) adapter.posting.employerName = input.manual.company.trim();
    if (!adapter.posting.location && input.manual?.location) adapter.posting.location = input.manual.location.trim();
  } else if (input.manual?.text?.trim()) {
    inputKind = 'manual';
    if (input.manual.text.trim().length < 80) throw badRequest('Paste the full job description. That looks too short to check.');
    const posting = manualPosting(input.manual);
    const key = `manual:${(await sha256Hex(postingFingerprint(posting.employerName, posting.title, posting.location) + '|' + posting.descriptionText.slice(0, 3000))).slice(0, 32)}`;
    adapter = { canonicalKey: key, posting };
  } else {
    throw badRequest('Paste a job link or the job description.');
  }

  const p = adapter.posting;
  const company = await resolveCompany(env, { name: p.employerName, domain: p.employerDomain, atsBoard: adapter.atsBoard, source: p.sourceKind });
  const obs = await recordObservation(env, adapter, company?.id ?? null, inputKind === 'manual' ? 'manual' : 'analysis');

  if (adapter.atsBoard && adapter.boardJobs) {
    try {
      await scanBoard(env, adapter.atsBoard, company?.id ?? null, p.employerName, p.sourceKind, adapter.boardJobs);
    } catch (e) {
      log('warn', 'board_scan_failed', { board: adapter.atsBoard, error: String(e) });
    }
  }

  const employer = await buildEmployerEvidence(env, company, now);
  const bundle: EvidenceBundle = { now, inputKind, posting: p, history: obs.history, employer };
  const report = buildReport(bundle);

  const analysisId = newId('an');
  const stmts = [
    env.DB.prepare(
      `INSERT INTO analyses (id, job_id, company_id, scoring_version, input_kind, posting_label, employer_label, confidence_label,
         posting_score, employer_score, confidence_score, report_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(analysisId, obs.job.id, company?.id ?? null, SCORING_VERSION, inputKind, report.posting.label, report.employer.label, report.confidence.label,
      report.posting.score, report.employer.score, report.confidence.score, JSON.stringify(report), now),
    ...report.findings.map((f) => env.DB.prepare('INSERT INTO analysis_findings (id, analysis_id, rule_id, dimension, polarity, weight, title) VALUES (?,?,?,?,?,?,?)')
      .bind(newId('af'), analysisId, f.ruleId, f.dimension, f.polarity, f.weight, f.title.slice(0, 300))),
  ];
  await env.DB.batch(stmts);
  const { reportId, slug } = await createReportRow(env, analysisId, actor);
  return { reportId, slug, analysisId, report, reused: false, alreadyHad: false };
}

async function tryReuse(env: Env, canonicalKey: string, actor: Actor, now: string): Promise<AnalyzeResult | null> {
  const row = await env.DB.prepare(
    `SELECT a.id, a.report_json, a.created_at FROM analyses a JOIN jobs j ON j.id = a.job_id
     WHERE j.canonical_key = ? AND a.scoring_version = ? ORDER BY a.created_at DESC LIMIT 1`,
  ).bind(canonicalKey, SCORING_VERSION).first<{ id: string; report_json: string; created_at: string }>();
  if (!row || Date.parse(now) - Date.parse(row.created_at) > REUSE_WINDOW_MS) return null;
  const mine = await env.DB.prepare(
    `SELECT id, slug FROM reports WHERE analysis_id = ? AND ((user_id IS NOT NULL AND user_id = ?) OR (anon_id IS NOT NULL AND anon_id = ?)) LIMIT 1`,
  ).bind(row.id, actor.userId, actor.anonId).first<{ id: string; slug: string }>();
  const report = JSON.parse(row.report_json) as Report;
  if (mine) return { reportId: mine.id, slug: mine.slug, analysisId: row.id, report, reused: true, alreadyHad: true };
  const { reportId, slug } = await createReportRow(env, row.id, actor);
  return { reportId, slug, analysisId: row.id, report, reused: true, alreadyHad: false };
}

async function createReportRow(env: Env, analysisId: string, actor: Actor): Promise<{ reportId: string; slug: string }> {
  const reportId = newId('rp');
  // Slugs are unguessable so a private report link can't be enumerated.
  const slug = randomToken(12).replace(/[-_]/g, 'x').slice(0, 14).toLowerCase();
  let isPublic = 0;
  if (actor.userId) {
    const u = await env.DB.prepare('SELECT prefs_json FROM users WHERE id = ?').bind(actor.userId).first<{ prefs_json: string }>();
    try {
      isPublic = JSON.parse(u?.prefs_json ?? '{}').defaultPublicReports ? 1 : 0;
    } catch { /* default private */ }
  }
  await env.DB.prepare('INSERT INTO reports (id, slug, analysis_id, user_id, anon_id, is_public, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(reportId, slug, analysisId, actor.userId, actor.userId ? null : actor.anonId, isPublic, nowIso())
    .run();
  return { reportId, slug };
}
