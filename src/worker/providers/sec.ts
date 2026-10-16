// SEC EDGAR. Free, official, no key. The SEC asks for a descriptive User-Agent with a
// contact email and at most 10 requests/second: https://www.sec.gov/os/accessing-edgar-data
//
// What we use:
//   efts.sec.gov/LATEST/search-index?keysTyped=  company name lookup (EDGAR's own autocomplete)
//   data.sec.gov/submissions/CIK##########.json  filing index: 8-K items, latest 10-K/10-Q
//   efts.sec.gov/LATEST/search-index?q=          full-text search, for going-concern language
//   data.sec.gov/api/xbrl/companyconcept/...     revenue and net income from annual reports

import type { Env } from '../env';
import type { CompanyEvent, FinancialPoint, SourceRef } from '@shared/types';
import { apiFetch } from '../lib/http';
import { matchCompanyName } from '@shared/normalize';

const H = (env: Env) => ({ 'user-agent': env.SEC_USER_AGENT, accept: 'application/json' });

export interface SecMatch {
  cik: string;      // zero-padded to 10
  name: string;
  ticker?: string;
}

export async function findSecCompany(env: Env, companyName: string): Promise<SecMatch | null> {
  const q = companyName.replace(/[^\w\s&.-]/g, ' ').trim().slice(0, 80);
  if (q.length < 2) return null;
  const res = await apiFetch(env, `https://efts.sec.gov/LATEST/search-index?keysTyped=${encodeURIComponent(q)}`, {
    provider: 'sec', operation: 'entity_search', cacheSeconds: 7 * 86_400, headers: H(env),
  });
  if (res.status !== 200) throw new Error(`SEC entity search HTTP ${res.status}`);
  const hits = (JSON.parse(res.body) as { hits?: { hits?: Array<{ _id: string; _source: { entity: string; tickers?: string } }> } }).hits?.hits ?? [];
  // Only operating companies with a ticker, and only an exact normalized name match.
  // "Probable" isn't good enough when we're about to attach financial filings to someone.
  for (const h of hits.slice(0, 10)) {
    const name = h._source.entity.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!h._source.tickers) continue;
    if (matchCompanyName(companyName, name) === 'exact') {
      return { cik: h._id.padStart(10, '0'), name, ticker: h._source.tickers.split(',')[0]?.trim() };
    }
  }
  return null;
}

interface Submissions {
  name: string;
  tickers?: string[];
  website?: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      items: string[];
      primaryDocument: string[];
    };
  };
}

const ITEM_EVENTS: Array<{ item: string; kind: CompanyEvent['kind']; title: string }> = [
  { item: '1.03', kind: 'sec_bankruptcy', title: 'Bankruptcy or receivership (8-K Item 1.03)' },
  { item: '2.05', kind: 'sec_restructuring', title: 'Exit or disposal costs, often layoffs (8-K Item 2.05)' },
  { item: '2.06', kind: 'sec_impairment', title: 'Material impairment (8-K Item 2.06)' },
  { item: '2.01', kind: 'sec_acquisition', title: 'Completed acquisition or disposition (8-K Item 2.01)' },
];

function filingUrl(cik: string, accession: string, doc: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, '')}/${doc}`;
}

export interface SecProfile {
  events: Array<CompanyEvent & { externalId: string }>;
  latestPeriodicFiling?: { form: string; date: string; url: string };
  financials: FinancialPoint[];
  sources: SourceRef[];
  website?: string;
}

export async function loadSecProfile(env: Env, match: SecMatch, nowIso: string): Promise<SecProfile> {
  const subUrl = `https://data.sec.gov/submissions/CIK${match.cik}.json`;
  const res = await apiFetch(env, subUrl, { provider: 'sec', operation: 'submissions', cacheSeconds: 12 * 3600, headers: H(env) });
  if (res.status !== 200) throw new Error(`SEC submissions HTTP ${res.status}`);
  const sub = JSON.parse(res.body) as Submissions;
  const r = sub.filings.recent;
  const cutoff = new Date(Date.parse(nowIso) - 2 * 365 * 86_400_000).toISOString().slice(0, 10);
  const events: SecProfile['events'] = [];
  let latestPeriodicFiling: SecProfile['latestPeriodicFiling'];
  const browse = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${match.cik}`;

  for (let i = 0; i < r.form.length; i++) {
    const form = r.form[i]!;
    const date = r.filingDate[i]!;
    if (!latestPeriodicFiling && (form === '10-K' || form === '10-Q' || form === '20-F' || form === '10-K/A')) {
      latestPeriodicFiling = { form, date, url: filingUrl(match.cik, r.accessionNumber[i]!, r.primaryDocument[i]!) };
    }
    if (date < cutoff) continue;
    if (form !== '8-K' && form !== '8-K/A') continue;
    const items = (r.items[i] ?? '').split(',').map((s) => s.trim());
    for (const def of ITEM_EVENTS) {
      if (!items.includes(def.item)) continue;
      const url = filingUrl(match.cik, r.accessionNumber[i]!, r.primaryDocument[i]!);
      events.push({
        kind: def.kind,
        date,
        title: def.title,
        detail: `Filed ${form} on ${date}.`,
        matchQuality: 'exact',
        externalId: `${r.accessionNumber[i]}:${def.item}`,
        source: { name: 'SEC EDGAR 8-K filing', url, reliability: 'official', fetchedAt: res.fetchedAt },
      });
    }
  }

  // Going concern: full-text search over 10-K and 10-Q filings from the last ~18 months.
  const start = new Date(Date.parse(nowIso) - 545 * 86_400_000).toISOString().slice(0, 10);
  const fts = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent('"substantial doubt" "going concern"')}&ciks=${match.cik}&forms=10-K,10-Q&dateRange=custom&startdt=${start}&enddt=${nowIso.slice(0, 10)}`;
  try {
    const g = await apiFetch(env, fts, { provider: 'sec', operation: 'fulltext', cacheSeconds: 24 * 3600, headers: H(env) });
    if (g.status === 200) {
      const hits = (JSON.parse(g.body) as { hits?: { hits?: Array<{ _id: string; _source: { file_date: string; form?: string; root_forms?: string[]; adsh?: string } }> } }).hits?.hits ?? [];
      for (const h of hits.slice(0, 3)) {
        const [adsh, doc] = h._id.split(':');
        const form = h._source.form ?? h._source.root_forms?.[0] ?? 'periodic report';
        events.push({
          kind: 'going_concern',
          date: h._source.file_date,
          title: form,
          detail: 'Filing text includes "substantial doubt" and "going concern".',
          matchQuality: 'exact',
          externalId: `gc:${adsh}`,
          source: { name: 'SEC EDGAR full-text search', url: adsh && doc ? filingUrl(match.cik, adsh, doc) : browse, reliability: 'official', fetchedAt: g.fetchedAt },
        });
      }
    }
  } catch {
    // Full-text search is a nice-to-have. The rest of the profile still stands.
  }

  const financials = await loadFinancials(env, match.cik);
  return {
    events,
    latestPeriodicFiling,
    financials,
    website: sub.website || undefined,
    sources: [{ name: 'SEC EDGAR company filings', url: browse, reliability: 'official', fetchedAt: res.fetchedAt }],
  };
}

interface ConceptUnit { fy: number; fp: string; form: string; val: number; filed: string; end: string; start?: string; frame?: string }

async function annualSeries(env: Env, cik: string, concept: string): Promise<ConceptUnit[] | null> {
  const res = await apiFetch(env, `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${concept}.json`, {
    provider: 'sec', operation: 'xbrl', cacheSeconds: 3 * 86_400, headers: H(env),
  });
  if (res.status !== 200) return null;
  const units = (JSON.parse(res.body) as { units?: Record<string, ConceptUnit[]> }).units?.USD;
  if (!units) return null;
  // Full-year values only: frames like "CY2025" (no Q) are calendar-year aggregates the SEC deduplicates for us.
  const annual = units.filter((u) => u.frame && /^CY\d{4}$/.test(u.frame) && (u.form === '10-K' || u.form === '20-F'));
  annual.sort((a, b) => a.frame!.localeCompare(b.frame!));
  return annual.length ? annual : null;
}

async function loadFinancials(env: Env, cik: string): Promise<FinancialPoint[]> {
  const out: FinancialPoint[] = [];
  const pick = async (label: FinancialPoint['label'], concepts: string[]) => {
    for (const c of concepts) {
      const s = await annualSeries(env, cik, c);
      if (!s) continue;
      const last = s.at(-1)!;
      const prev = s.length > 1 ? s.at(-2) : undefined;
      // Ignore stale data: if the newest annual figure is more than ~2 years old, skip it.
      if (Number(last.frame!.slice(2)) < new Date().getUTCFullYear() - 2) continue;
      out.push({ label, unit: 'USD', fiscalYear: Number(last.frame!.slice(2)), value: last.val, priorValue: prev?.val, filed: last.filed, form: last.form });
      return;
    }
  };
  try {
    await pick('Revenue', ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet']);
    await pick('Net income', ['NetIncomeLoss']);
  } catch {
    // XBRL is best effort.
  }
  return out;
}
