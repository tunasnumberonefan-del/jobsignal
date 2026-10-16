// Lever Postings API. Public, no key: https://github.com/lever/postings-api
// GET https://api.lever.co/v0/postings/{site}/{id}   (EU sites use api.eu.lever.co)

import type { PostingEvidence, SourceRef } from '@shared/types';
import { apiFetch, UpstreamError } from '../lib/http';
import { htmlToText, pageTitle } from '../lib/html';
import { boardStats, notLive } from './greenhouse';
import type { AdapterResult, JobAdapter } from './types';

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; commitment?: string; team?: string; department?: string; allLocations?: string[] };
  descriptionPlain?: string;
  description?: string;
  lists?: Array<{ text: string; content: string }>;
  additionalPlain?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  workplaceType?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function apiBase(eu: boolean) {
  return eu ? 'https://api.eu.lever.co/v0/postings' : 'https://api.lever.co/v0/postings';
}

function money(n: number, cur?: string) {
  const sym = !cur || cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : cur + ' ';
  return n >= 1000 ? `${sym}${Math.round(n / 1000)}k` : `${sym}${n}`;
}

export const lever: JobAdapter = {
  kind: 'lever',

  parse(url) {
    const host = url.hostname.toLowerCase();
    if (host !== 'jobs.lever.co' && host !== 'jobs.eu.lever.co') return null;
    const [site, id] = url.pathname.split('/').filter(Boolean);
    if (!site || !id || !UUID.test(id)) return null;
    return { kind: 'lever', board: site.toLowerCase(), jobId: id.toLowerCase(), inputUrl: url.toString(), region: host.includes('.eu.') ? 'eu' : undefined };
  },

  async fetch(env, ref, opts) {
    const eu = ref.region === 'eu';
    const jobUrl = `${apiBase(eu)}/${encodeURIComponent(ref.board!)}/${ref.jobId}?mode=json`;
    const res = await apiFetch(env, jobUrl, { provider: 'lever', operation: 'job', cacheSeconds: 1800, fresh: opts?.fresh });
    const source: SourceRef = { name: 'Lever Postings API', url: jobUrl, reliability: 'official', fetchedAt: res.fetchedAt };
    const canonicalKey = `lever:${ref.board}:${ref.jobId}`;
    if (res.status === 404) return { canonicalKey, atsBoard: `lever:${ref.board}`, posting: notLive('lever', ref, source) };
    if (res.status !== 200) throw new UpstreamError('lever', res.status, 'Lever did not respond normally.');
    const p = JSON.parse(res.body) as LeverPosting;

    const boardRes = await apiFetch(env, `${apiBase(eu)}/${encodeURIComponent(ref.board!)}?mode=json`, { provider: 'lever', operation: 'board', cacheSeconds: 3600, fresh: opts?.fresh });
    let boardJobs: AdapterResult['boardJobs'];
    if (boardRes.status === 200) {
      const list = JSON.parse(boardRes.body) as LeverPosting[];
      boardJobs = list.map((j) => ({ id: j.id, title: j.text, location: j.categories?.location }));
    }

    // The API doesn't include the company name. The public board page title is the company name.
    let employerName: string | undefined;
    const pageRes = await apiFetch(env, `https://${eu ? 'jobs.eu.lever.co' : 'jobs.lever.co'}/${encodeURIComponent(ref.board!)}`, {
      provider: 'lever', operation: 'board_page', cacheSeconds: 86_400, headers: { accept: 'text/html' },
    });
    if (pageRes.status === 200) employerName = pageTitle(pageRes.body)?.replace(/\s*[-|–].*$/, '').trim() || undefined;

    const parts = [
      p.descriptionPlain ?? htmlToText(p.description ?? ''),
      ...(p.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`),
      p.additionalPlain ?? '',
    ];
    const sr = p.salaryRange;
    const posting: PostingEvidence = {
      sourceKind: 'lever',
      inputUrl: ref.inputUrl,
      canonicalUrl: p.hostedUrl,
      applyUrl: p.applyUrl ?? p.hostedUrl,
      liveOnOfficialSource: true,
      fetchOutcome: 'ok',
      employerName,
      title: p.text.trim(),
      location: p.categories?.allLocations?.join(' / ') || p.categories?.location,
      employmentType: p.categories?.commitment,
      compensationText: sr && sr.min && sr.max ? `${money(sr.min, sr.currency)} – ${money(sr.max, sr.currency)}${sr.interval ? ` ${sr.interval.replace(/-/g, ' ')}` : ''}` : undefined,
      publishedAt: p.createdAt ? new Date(p.createdAt).toISOString() : undefined,
      descriptionText: parts.filter(Boolean).join('\n\n').trim(),
      sources: [source],
      ...boardStats(boardJobs, p.id, p.text, p.categories?.location),
    };
    return { canonicalKey, atsBoard: `lever:${ref.board}`, posting, boardJobs };
  },
};
