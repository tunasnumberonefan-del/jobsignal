// State WARN Act notices. Each state is its own module so new states can be added
// one at a time. Every source here is an official state agency publication.
//
//   TX  Texas Workforce Commission, published on data.texas.gov (Socrata JSON API)
//   CA  California EDD, weekly-updated Excel report on edd.ca.gov
//
// See docs/DATA_SOURCES.md for the checklist to add a state.

import type { Env } from '../../env';
import { apiFetch, USER_AGENT } from '../../lib/http';
import { normalizeCompanyName } from '@shared/normalize';
import { excelDate, readSheet, tableFrom, type Cell } from './xlsx';

export interface WarnRecord {
  state: string;
  sourceRecordId: string;
  employer: string;
  employerNormalized: string;
  noticeDate?: string;
  effectiveDate?: string;
  city?: string;
  county?: string;
  employeesAffected?: number;
  layoffType?: string;
  sourceUrl: string;
}

export interface WarnSource {
  state: string;
  agency: string;
  homepage: string;
  fetch(env: Env, sinceIso: string): Promise<WarnRecord[]>;
}

async function stableId(parts: Array<string | number | undefined>): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.map((p) => p ?? '').join('|')));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const texas: WarnSource = {
  state: 'TX',
  agency: 'Texas Workforce Commission',
  homepage: 'https://data.texas.gov/d/8w53-c4f6',
  async fetch(env, sinceIso) {
    const since = sinceIso.slice(0, 10);
    const url = `https://data.texas.gov/resource/8w53-c4f6.json?$limit=5000&$order=notice_date%20DESC&$where=${encodeURIComponent(`notice_date >= '${since}T00:00:00'`)}`;
    const res = await apiFetch(env, url, { provider: 'warn_tx', operation: 'ingest', cacheSeconds: 0, timeoutMs: 20_000 });
    if (res.status !== 200) throw new Error(`Texas WARN HTTP ${res.status}`);
    const rows = JSON.parse(res.body) as Array<Record<string, string | undefined>>;
    const out: WarnRecord[] = [];
    for (const r of rows) {
      const employer = r.job_site_name?.trim();
      if (!employer) continue;
      const notice = r.notice_date?.slice(0, 10);
      out.push({
        state: 'TX',
        sourceRecordId: await stableId([employer, notice, r.city_name, r.total_layoff_number, r.layoff_date]),
        employer,
        employerNormalized: normalizeCompanyName(employer),
        noticeDate: notice,
        effectiveDate: r.layoff_date?.slice(0, 10),
        city: r.city_name,
        county: r.county_name,
        employeesAffected: r.total_layoff_number ? Number(r.total_layoff_number) || undefined : undefined,
        sourceUrl: 'https://data.texas.gov/d/8w53-c4f6',
      });
    }
    return out;
  },
};

const CA_URL = 'https://edd.ca.gov/siteassets/files/jobs_and_training/warn/warn_report1.xlsx';

const california: WarnSource = {
  state: 'CA',
  agency: 'California Employment Development Department',
  homepage: 'https://edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN/',
  async fetch(_env, sinceIso) {
    const res = await fetch(CA_URL, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`California WARN HTTP ${res.status}`);
    return parseCaliforniaWarn(new Uint8Array(await res.arrayBuffer()), sinceIso);
  },
};

export async function parseCaliforniaWarn(bytes: Uint8Array, sinceIso: string): Promise<WarnRecord[]> {
  const rows = readSheet(bytes, (n) => /detailed warn report/i.test(n));
  const table = tableFrom(rows, ['company', 'notice']);
  const pick = (r: Record<string, Cell>, re: RegExp) => {
    const k = Object.keys(r).find((h) => re.test(h));
    return k ? r[k] ?? null : null;
  };
  const since = sinceIso.slice(0, 10);
  const out: WarnRecord[] = [];
  for (const r of table) {
    const employer = String(pick(r, /^company/) ?? '').trim();
    if (!employer || /^total/i.test(employer)) continue;
    const notice = excelDate(pick(r, /notice/));
    if (notice && notice < since) continue;
    const count = Number(pick(r, /employees/));
    const address = String(pick(r, /address/) ?? '');
    // Addresses look like "2211 N. First Street  San Jose, CA 95131". The city is the
    // last chunk before ", CA", separated by a double space or a comma.
    const beforeState = address.split(/,?\s+CA\s+\d{5}/)[0] ?? '';
    const city = /\s{2,}|,/.test(beforeState) ? beforeState.split(/\s{2,}|,/).pop()?.trim() || undefined : undefined;
    const effective = excelDate(pick(r, /effective/));
    out.push({
      state: 'CA',
      sourceRecordId: await stableId([employer, notice, effective, address, count]),
      employer,
      employerNormalized: normalizeCompanyName(employer),
      noticeDate: notice,
      effectiveDate: effective,
      city,
      county: String(pick(r, /county/) ?? '').replace(/ county$/i, '') || undefined,
      employeesAffected: Number.isFinite(count) && count > 0 ? count : undefined,
      layoffType: String(pick(r, /layoff|closure/) ?? '') || undefined,
      sourceUrl: CA_URL,
    });
  }
  return out;
}

export const WARN_SOURCES: WarnSource[] = [texas, california];
export const WARN_STATES = WARN_SOURCES.map((s) => s.state);
export const WARN_AGENCY: Record<string, string> = Object.fromEntries(WARN_SOURCES.map((s) => [s.state, s.agency]));
