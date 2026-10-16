// Greenhouse Job Board API. Public, no key, documented at
// https://developers.greenhouse.io/job-board.html
// GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?pay_transparency=true

import type { PostingEvidence, SourceRef } from '@shared/types';
import { apiFetch, UpstreamError } from '../lib/http';
import { htmlToText } from '../lib/html';
import { baseDomain, normalizeLocation, normalizeTitle } from '@shared/normalize';
import type { AdapterResult, JobAdapter, JobRef } from './types';

const API = 'https://boards-api.greenhouse.io/v1/boards';

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at?: string;
  first_published?: string;
  company_name?: string;
  location?: { name?: string };
  content?: string;
  application_deadline?: string | null;
  pay_input_ranges?: Array<{ min_cents: number; max_cents: number; currency_type: string; title?: string }>;
  metadata?: Array<{ name: string; value: unknown }> | null;
}

// Hostnames that are never a company's own careers domain.
const NOT_A_COMPANY = new Set(['www', 'careers', 'jobs', 'boards', 'job-boards', 'apply', 'work', 'join', 'hire', 'talent']);

/** For "careers.acme.com/...?gh_jid=123", guess the board token "acme". Confirmed later against the API. */
function guessBoardFromHost(host: string): string | undefined {
  const parts = baseDomain(host).split('.');
  const label = parts[0];
  if (!label || NOT_A_COMPANY.has(label)) return undefined;
  return label.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function formatPay(r: NonNullable<GhJob['pay_input_ranges']>[number]): string {
  const fmt = (c: number) => {
    const v = c / 100;
    return v >= 1000 ? `${Math.round(v / 1000)}k` : v.toFixed(v % 1 ? 2 : 0);
  };
  const sym = r.currency_type === 'USD' ? '$' : r.currency_type === 'GBP' ? '£' : r.currency_type === 'EUR' ? '€' : r.currency_type + ' ';
  return `${sym}${fmt(r.min_cents)} – ${sym}${fmt(r.max_cents)}${r.title ? ` (${r.title})` : ''}`;
}

export const greenhouse: JobAdapter = {
  kind: 'greenhouse',

  parse(url) {
    const host = url.hostname.toLowerCase();
    const segs = url.pathname.split('/').filter(Boolean);
    if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io' || host.endsWith('.greenhouse.io')) {
      // /embed/job_app?for=board&token=123
      if (segs[0] === 'embed') {
        const board = url.searchParams.get('for') ?? undefined;
        const jobId = url.searchParams.get('token') ?? undefined;
        if (board && jobId && /^\d+$/.test(jobId)) return { kind: 'greenhouse', board, jobId, inputUrl: url.toString() };
        return null;
      }
      // /{board}/jobs/{id}
      const i = segs.indexOf('jobs');
      if (i >= 1 && segs[i + 1] && /^\d+$/.test(segs[i + 1]!)) {
        return { kind: 'greenhouse', board: segs[i - 1]!, jobId: segs[i + 1]!, inputUrl: url.toString() };
      }
      return null;
    }
    const gh = url.searchParams.get('gh_jid');
    if (gh && /^\d+$/.test(gh)) {
      const board = guessBoardFromHost(host);
      if (board) return { kind: 'greenhouse', board, jobId: gh, inputUrl: url.toString(), boardGuessed: true };
    }
    return null;
  },

  async fetch(env, ref, opts) {
    const jobUrl = `${API}/${encodeURIComponent(ref.board!)}/jobs/${ref.jobId}?pay_transparency=true`;
    const res = await apiFetch(env, jobUrl, { provider: 'greenhouse', operation: 'job', cacheSeconds: 1800, fresh: opts?.fresh });
    const source: SourceRef = { name: 'Greenhouse Job Board API', url: jobUrl.replace('?pay_transparency=true', ''), reliability: 'official', fetchedAt: res.fetchedAt };
    const canonicalKey = `greenhouse:${ref.board!.toLowerCase()}:${ref.jobId}`;

    if (res.status === 404) {
      if (ref.boardGuessed) throw new UpstreamError('greenhouse', 404, 'board_guess_failed');
      return {
        canonicalKey,
        atsBoard: `greenhouse:${ref.board!.toLowerCase()}`,
        posting: notLive('greenhouse', ref, source),
      };
    }
    if (res.status !== 200) throw new UpstreamError('greenhouse', res.status, 'Greenhouse did not respond normally.');
    const job = JSON.parse(res.body) as GhJob;

    // If we guessed the board from a custom domain, make sure the job really points back there.
    if (ref.boardGuessed) {
      const inputHost = baseDomain(new URL(ref.inputUrl).hostname);
      const jobHost = baseDomain(new URL(job.absolute_url).hostname);
      if (inputHost !== jobHost && jobHost !== 'greenhouse.io') throw new UpstreamError('greenhouse', 404, 'board_guess_failed');
    }

    const boardRes = await apiFetch(env, `${API}/${encodeURIComponent(ref.board!)}/jobs`, { provider: 'greenhouse', operation: 'board', cacheSeconds: 3600, fresh: opts?.fresh });
    let boardJobs: AdapterResult['boardJobs'];
    if (boardRes.status === 200) {
      const list = (JSON.parse(boardRes.body) as { jobs: GhJob[] }).jobs ?? [];
      boardJobs = list.map((j) => ({ id: String(j.id), title: j.title, location: j.location?.name }));
    }

    const absHost = new URL(job.absolute_url).hostname;
    const employerDomain = absHost.endsWith('greenhouse.io') ? undefined : baseDomain(absHost);
    const posting: PostingEvidence = {
      sourceKind: 'greenhouse',
      inputUrl: ref.inputUrl,
      canonicalUrl: job.absolute_url,
      applyUrl: job.absolute_url,
      liveOnOfficialSource: true,
      fetchOutcome: 'ok',
      employerName: job.company_name?.trim() || undefined,
      employerDomain,
      title: job.title.trim(),
      location: job.location?.name?.trim() || undefined,
      employmentType: metaValue(job, /employment type|job type/i),
      compensationText: job.pay_input_ranges?.length ? job.pay_input_ranges.map(formatPay).join('; ') : undefined,
      publishedAt: job.first_published ?? undefined,
      sourceUpdatedAt: job.updated_at ?? undefined,
      validThrough: job.application_deadline ?? undefined,
      descriptionText: htmlToText(job.content ?? ''),
      sources: [source],
      ...boardStats(boardJobs, String(job.id), job.title, job.location?.name),
    };
    return { canonicalKey, atsBoard: `greenhouse:${ref.board!.toLowerCase()}`, posting, boardJobs };
  },
};

function metaValue(job: GhJob, re: RegExp): string | undefined {
  const m = job.metadata?.find((x) => re.test(x.name));
  return typeof m?.value === 'string' ? m.value : undefined;
}

export function boardStats(
  board: AdapterResult['boardJobs'],
  selfId: string,
  title: string,
  location: string | undefined,
): Pick<PostingEvidence, 'boardOpenRoles' | 'boardDuplicates'> {
  if (!board) return {};
  const t = normalizeTitle(title);
  const l = normalizeLocation(location);
  const dupes = board.filter((j) => j.id !== selfId && normalizeTitle(j.title) === t && normalizeLocation(j.location) === l).length;
  return { boardOpenRoles: board.length, boardDuplicates: dupes };
}

export function notLive(kind: PostingEvidence['sourceKind'], ref: JobRef, source: SourceRef): PostingEvidence {
  return {
    sourceKind: kind,
    inputUrl: ref.inputUrl,
    liveOnOfficialSource: false,
    fetchOutcome: 'not_found',
    title: 'Listing not found',
    descriptionText: '',
    sources: [source],
  };
}
