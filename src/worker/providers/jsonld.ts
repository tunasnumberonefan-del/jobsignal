// Fallback for any careers page that isn't on a supported ATS. Many sites publish
// schema.org JobPosting data for Google for Jobs. If it's there, we can read it.
// We check robots.txt first and only make one request to the page.

import type { PostingEvidence, SourceRef } from '@shared/types';
import { robotsAllows, safeFetch, UrlRejected } from '../lib/http';
import { extractJsonLd, htmlToText } from '../lib/html';
import { baseDomain } from '@shared/normalize';
import { sha256Hex } from '../lib/util';
import type { AdapterResult, JobAdapter } from './types';

type Obj = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Aggregators that block bots or copy listings from elsewhere. We say so instead of failing quietly. */
export const AGGREGATORS: Record<string, string> = {
  'linkedin.com': 'LinkedIn',
  'indeed.com': 'Indeed',
  'glassdoor.com': 'Glassdoor',
  'ziprecruiter.com': 'ZipRecruiter',
  'monster.com': 'Monster',
  'simplyhired.com': 'SimplyHired',
  'careerbuilder.com': 'CareerBuilder',
  'google.com': 'Google',
  'handshake.com': 'Handshake',
  'joinhandshake.com': 'Handshake',
  'wellfound.com': 'Wellfound',
  'dice.com': 'Dice',
};

function isJobPosting(o: unknown): o is Obj {
  if (!o || typeof o !== 'object') return false;
  const t = (o as Obj)['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

function locationText(loc: unknown): string | undefined {
  const list = Array.isArray(loc) ? loc : loc ? [loc] : [];
  const parts = list.map((l) => {
    const a = (l as Obj)?.address as Obj | string | undefined;
    if (typeof a === 'string') return a;
    if (!a) return str((l as Obj)?.name);
    return [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry && typeof a.addressCountry === 'object' ? (a.addressCountry as Obj).name : a.addressCountry)]
      .filter(Boolean).join(', ');
  }).filter(Boolean);
  return parts.length ? [...new Set(parts)].join(' / ') : undefined;
}

function salaryText(s: unknown): string | undefined {
  if (!s || typeof s !== 'object') return undefined;
  const o = s as Obj;
  const cur = str(o.currency) ?? 'USD';
  const v = o.value as Obj | number | undefined;
  const sym = cur === 'USD' ? '$' : cur + ' ';
  if (typeof v === 'number') return `${sym}${v.toLocaleString('en-US')}`;
  if (!v) return undefined;
  const min = Number(v.minValue);
  const max = Number(v.maxValue);
  const unit = str(v.unitText)?.toLowerCase();
  const fmt = (n: number) => `${sym}${n.toLocaleString('en-US')}`;
  if (Number.isFinite(min) && Number.isFinite(max) && min > 0) return `${fmt(min)} – ${fmt(max)}${unit ? ` per ${unit}` : ''}`;
  if (Number.isFinite(Number(v.value))) return `${fmt(Number(v.value))}${unit ? ` per ${unit}` : ''}`;
  return undefined;
}

function isoOrUndefined(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

export const jsonld: JobAdapter = {
  kind: 'jsonld',

  parse(url) {
    return { kind: 'jsonld', inputUrl: url.toString() };
  },

  async fetch(_env, ref) {
    const url = new URL(ref.inputUrl);
    const host = baseDomain(url.hostname);
    const keyBase = `page:${url.hostname}${url.pathname}`;
    const empty = (outcome: PostingEvidence['fetchOutcome'], source?: SourceRef): AdapterResult => ({
      canonicalKey: `${keyBase}`,
      posting: { sourceKind: 'jsonld', inputUrl: ref.inputUrl, liveOnOfficialSource: null, fetchOutcome: outcome, title: '', descriptionText: '', sources: source ? [source] : [] },
    });

    if (AGGREGATORS[host]) return empty('blocked');
    if (!(await robotsAllows(url))) return empty('blocked');

    let res;
    try {
      res = await safeFetch(url.toString());
    } catch (e) {
      if (e instanceof UrlRejected) throw e;
      return empty('error');
    }
    const fetchedAt = new Date().toISOString();
    const source: SourceRef = { name: `Job page on ${new URL(res.url).hostname}`, url: res.url, reliability: 'reported', fetchedAt };
    if (res.status === 404) return empty('not_found', source);
    if (res.status === 410) return empty('gone', source);
    if (res.status === 401 || res.status === 403 || res.status === 429) return empty('blocked', source);
    if (res.status !== 200) return empty('error', source);

    const job = extractJsonLd(res.body).find(isJobPosting);
    if (!job) return empty('unsupported', source);

    const org = (Array.isArray(job.hiringOrganization) ? job.hiringOrganization[0] : job.hiringOrganization) as Obj | string | undefined;
    const orgName = typeof org === 'string' ? org : str(org?.name);
    const orgUrl = typeof org === 'object' ? str(org?.sameAs) ?? str(org?.url) : undefined;
    let employerDomain: string | undefined;
    try {
      if (orgUrl) employerDomain = baseDomain(new URL(orgUrl).hostname);
    } catch { /* not a URL */ }

    const finalUrl = new URL(res.url);
    const identifier = job.identifier as Obj | string | undefined;
    const idValue = typeof identifier === 'string' ? identifier : str(identifier?.value) ?? (identifier?.value != null ? String(identifier.value) : undefined);
    const canonicalKey = idValue
      ? `page:${finalUrl.hostname}:${idValue}`
      : `page:${finalUrl.hostname}:${(await sha256Hex(finalUrl.pathname)).slice(0, 20)}`;

    const posting: PostingEvidence = {
      sourceKind: 'jsonld',
      inputUrl: ref.inputUrl,
      canonicalUrl: str(job.url) ?? res.url,
      applyUrl: str((job.directApply as unknown) === true ? job.url : undefined) ?? res.url,
      liveOnOfficialSource: null,
      fetchOutcome: 'ok',
      employerName: orgName,
      employerDomain,
      title: str(job.title) ?? 'Untitled listing',
      location: locationText(job.jobLocation) ?? (str(job.jobLocationType) === 'TELECOMMUTE' ? 'Remote' : undefined),
      employmentType: Array.isArray(job.employmentType) ? job.employmentType.join(', ') : str(job.employmentType),
      compensationText: salaryText(job.baseSalary),
      publishedAt: isoOrUndefined(job.datePosted),
      validThrough: isoOrUndefined(job.validThrough),
      descriptionText: htmlToText(str(job.description) ?? ''),
      sources: [source],
    };
    return { canonicalKey, posting };
  },
};
