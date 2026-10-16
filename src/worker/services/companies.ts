// Company entity resolution and public-record lookups.
//
// Matching rules, strongest first:
//   1. Same ATS board token            -> same company (a board belongs to one employer)
//   2. Same website domain             -> same company
//   3. Same normalized name, and no conflicting domain -> same company
// Anything weaker creates a new company record. Two similarly named employers stay separate.

import type { Env } from '../env';
import type { CompanyEvent, EmployerEvidence, SourceRef } from '@shared/types';
import { isDistinctiveName, matchCompanyName, normalizeCompanyName, slugify } from '@shared/normalize';
import { newId, nowIso } from '../lib/util';
import { log } from '../lib/log';
import { findSecCompany, loadSecProfile } from '../providers/sec';
import { WARN_AGENCY, WARN_STATES } from '../providers/warn';

export interface CompanyRow {
  id: string;
  slug: string;
  name: string;
  normalized_name: string;
  domain: string | null;
  cik: string | null;
  ticker: string | null;
  sec_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCompany(env: Env, id: string): Promise<CompanyRow | null> {
  return env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(id).first<CompanyRow>();
}

async function byAlias(env: Env, kind: string, value: string): Promise<CompanyRow[]> {
  const r = await env.DB.prepare(
    'SELECT c.* FROM company_aliases a JOIN companies c ON c.id = a.company_id WHERE a.kind = ? AND a.value = ? LIMIT 5',
  ).bind(kind, value).all<CompanyRow>();
  return r.results;
}

async function addAlias(env: Env, companyId: string, kind: string, value: string, display: string | null, source: string) {
  await env.DB.prepare('INSERT OR IGNORE INTO company_aliases (id, company_id, kind, value, display, source, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(newId('ca'), companyId, kind, value, display, source, nowIso())
    .run();
}

async function uniqueSlug(env: Env, base: string): Promise<string> {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const hit = await env.DB.prepare('SELECT 1 FROM companies WHERE slug = ?').bind(slug).first();
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${newId('x', 6).slice(2)}`;
}

export interface ResolveInput {
  name?: string;
  domain?: string;
  atsBoard?: string;
  source: string;
}

export async function resolveCompany(env: Env, input: ResolveInput): Promise<CompanyRow | null> {
  const name = input.name?.trim();
  const normalized = name ? normalizeCompanyName(name) : '';
  const domain = input.domain?.toLowerCase();

  let company: CompanyRow | null = null;
  if (input.atsBoard) company = (await byAlias(env, 'ats_board', input.atsBoard))[0] ?? null;
  if (!company && domain) {
    const hits = await byAlias(env, 'domain', domain);
    if (hits.length === 1) company = hits[0]!;
  }
  if (!company && normalized && (isDistinctiveName(normalized) || normalized.includes(' '))) {
    const hits = await byAlias(env, 'name', normalized);
    const compatible = hits.filter((h) => !domain || !h.domain || h.domain === domain);
    if (compatible.length === 1) company = compatible[0]!;
  }

  if (!company) {
    if (!name) return null;
    const now = nowIso();
    const id = newId('co');
    const slug = await uniqueSlug(env, slugify(name));
    await env.DB.prepare('INSERT INTO companies (id, slug, name, normalized_name, domain, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
      .bind(id, slug, name, normalized, domain ?? null, now, now)
      .run();
    company = (await getCompany(env, id))!;
    log('info', 'company_created', { companyId: id, source: input.source });
  } else if (domain && !company.domain) {
    await env.DB.prepare('UPDATE companies SET domain = ?, updated_at = ? WHERE id = ?').bind(domain, nowIso(), company.id).run();
    company.domain = domain;
  }

  if (normalized) await addAlias(env, company.id, 'name', normalized, name ?? null, input.source);
  if (domain) await addAlias(env, company.id, 'domain', domain, null, input.source);
  if (input.atsBoard) {
    try {
      await addAlias(env, company.id, 'ats_board', input.atsBoard, null, input.source);
    } catch {
      // Board already claimed by another company. Keep the existing mapping.
    }
  }
  return company;
}

// ---------------------------------------------------------------- WARN

/** Match ingested WARN notices to a company and store them as company events. */
export async function syncWarnEvents(env: Env, company: CompanyRow): Promise<void> {
  const norm = company.normalized_name;
  if (!norm || !isDistinctiveName(norm)) return;
  const rows = await env.DB.prepare(
    `SELECT * FROM warn_notices WHERE employer_normalized = ? OR employer_normalized LIKE ? ORDER BY notice_date DESC LIMIT 60`,
  ).bind(norm, `${norm} %`).all<{
    id: string; state: string; source_record_id: string; employer: string; notice_date: string | null; effective_date: string | null;
    city: string | null; employees_affected: number | null; layoff_type: string | null; source_url: string;
  }>();
  const stmts: D1PreparedStatement[] = [];
  for (const r of rows.results) {
    const q = matchCompanyName(company.name, r.employer);
    if (q === 'none') continue;
    const date = r.notice_date ?? r.effective_date;
    if (!date) continue;
    const where = [r.city, r.state].filter(Boolean).join(', ');
    stmts.push(env.DB.prepare(
      `INSERT OR IGNORE INTO company_events (id, company_id, kind, event_date, title, detail, magnitude, source_name, source_url, reliability, match_quality, external_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      newId('ev'), company.id, 'warn_notice', date,
      `WARN notice${where ? `: ${where}` : ''}`,
      [`Filed as "${r.employer}".`, r.layoff_type ? `Type: ${r.layoff_type}.` : '', r.effective_date ? `Effective ${r.effective_date}.` : ''].filter(Boolean).join(' '),
      r.employees_affected, WARN_AGENCY[r.state] ?? `${r.state} WARN notices`, r.source_url, 'official', q, `${r.state}:${r.source_record_id}`, nowIso(),
    ));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ---------------------------------------------------------------- full profile

interface EventRow {
  kind: CompanyEvent['kind']; event_date: string; title: string; detail: string | null; magnitude: number | null;
  source_name: string; source_url: string | null; reliability: 'official' | 'reported' | 'derived'; match_quality: 'exact' | 'probable';
}

export async function loadEvents(env: Env, companyId: string): Promise<CompanyEvent[]> {
  const r = await env.DB.prepare(
    'SELECT * FROM company_events WHERE company_id = ? AND hidden_at IS NULL ORDER BY event_date DESC LIMIT 100',
  ).bind(companyId).all<EventRow>();
  return r.results.map((e) => ({
    kind: e.kind,
    date: e.event_date,
    title: e.title,
    detail: e.detail ?? undefined,
    magnitude: e.magnitude ?? undefined,
    matchQuality: e.match_quality,
    source: { name: e.source_name, url: e.source_url ?? undefined, reliability: e.reliability },
  }));
}

async function featureOn(env: Env, key: string): Promise<boolean> {
  const r = await env.DB.prepare('SELECT enabled FROM feature_flags WHERE key = ?').bind(key).first<{ enabled: number }>();
  return r ? r.enabled === 1 : true;
}

/**
 * Builds the employer half of the evidence bundle. Runs the WARN match and the SEC lookup,
 * stores what it finds as company events, and reports exactly which checks ran.
 */
export async function buildEmployerEvidence(env: Env, company: CompanyRow | null, now: string): Promise<EmployerEvidence> {
  const evidence: EmployerEvidence = {
    checked: { warn: { states: WARN_STATES, ran: false }, sec: { ran: false, matched: false } },
    events: [],
    financials: [],
    sources: [],
  };
  if (!company) return evidence;
  evidence.companyId = company.id;
  evidence.companySlug = company.slug;
  evidence.name = company.name;
  evidence.domain = company.domain ?? undefined;

  // WARN: only counts as "checked" if we have ingested data at all.
  const warnCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM warn_notices').first<{ n: number }>();
  if ((warnCount?.n ?? 0) > 0) {
    await syncWarnEvents(env, company);
    const states = await env.DB.prepare('SELECT DISTINCT state FROM warn_notices').all<{ state: string }>();
    evidence.checked.warn = { states: states.results.map((s) => s.state), ran: true };
    evidence.sources.push(...evidence.checked.warn.states.map((s): SourceRef => ({ name: WARN_AGENCY[s] ?? `${s} WARN notices`, reliability: 'official' })));
  }

  // SEC
  if (await featureOn(env, 'sec_lookup')) {
    try {
      const recentlyChecked = company.sec_checked_at && Date.parse(now) - Date.parse(company.sec_checked_at) < 7 * 86_400_000;
      let cik = company.cik;
      let ticker = company.ticker;
      if (!cik && !recentlyChecked) {
        const m = await findSecCompany(env, company.name);
        if (m) {
          cik = m.cik;
          ticker = m.ticker ?? null;
          try {
            await env.DB.prepare('UPDATE companies SET cik = ?, ticker = ? WHERE id = ?').bind(cik, ticker, company.id).run();
          } catch {
            // Another company record already holds this CIK (a name variant). Use the data, don't merge blindly.
            log('info', 'cik_already_assigned', { companyId: company.id, cik });
          }
        }
        await env.DB.prepare('UPDATE companies SET sec_checked_at = ? WHERE id = ?').bind(now, company.id).run();
      }
      evidence.checked.sec.ran = true;
      if (cik) {
        evidence.checked.sec.matched = true;
        evidence.cik = cik;
        evidence.ticker = ticker ?? undefined;
        const profile = await loadSecProfile(env, { cik, name: company.name, ticker: ticker ?? undefined }, now);
        evidence.financials = profile.financials;
        evidence.latestPeriodicFiling = profile.latestPeriodicFiling;
        evidence.sources.push(...profile.sources);
        if (profile.events.length) {
          await env.DB.batch(profile.events.map((e) => env.DB.prepare(
            `INSERT OR IGNORE INTO company_events (id, company_id, kind, event_date, title, detail, magnitude, source_name, source_url, reliability, match_quality, external_id, created_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).bind(newId('ev'), company.id, e.kind, e.date, e.title, e.detail ?? null, null, e.source.name, e.source.url ?? null, 'official', 'exact', e.externalId, now)));
        }
      }
    } catch (e) {
      evidence.checked.sec = { ran: false, matched: false, error: e instanceof Error ? e.message : String(e) };
      log('warn', 'sec_lookup_failed', { companyId: company.id, error: String(e) });
    }
  }

  evidence.events = await loadEvents(env, company.id);
  return evidence;
}
