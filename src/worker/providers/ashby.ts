// Ashby public job board API: https://developers.ashbyhq.com/docs/public-job-posting-api
// GET https://api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true
// There is no single-job endpoint, so we read the board and pick the job out of it.

import type { PostingEvidence, SourceRef } from '@shared/types';
import { apiFetch, UpstreamError } from '../lib/http';
import { htmlToText, pageTitle } from '../lib/html';
import { boardStats, notLive } from './greenhouse';
import type { JobAdapter } from './types';

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: Array<{ location: string }>;
  employmentType?: string;
  publishedAt?: string;
  isListed?: boolean;
  jobUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string };
  shouldDisplayCompensationOnJobPostings?: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPLOYMENT: Record<string, string> = { FullTime: 'Full-time', PartTime: 'Part-time', Intern: 'Internship', Contract: 'Contract', Temporary: 'Temporary' };

export const ashby: JobAdapter = {
  kind: 'ashby',

  parse(url) {
    if (url.hostname.toLowerCase() !== 'jobs.ashbyhq.com') return null;
    const [org, id] = url.pathname.split('/').filter(Boolean);
    if (!org || !id || !UUID.test(id)) return null;
    return { kind: 'ashby', board: decodeURIComponent(org), jobId: id.toLowerCase(), inputUrl: url.toString() };
  },

  async fetch(env, ref, opts) {
    const boardUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.board!)}?includeCompensation=true`;
    const res = await apiFetch(env, boardUrl, { provider: 'ashby', operation: 'board', cacheSeconds: 1800, fresh: opts?.fresh });
    const source: SourceRef = { name: 'Ashby Job Posting API', url: boardUrl, reliability: 'official', fetchedAt: res.fetchedAt };
    const boardKey = ref.board!.toLowerCase();
    const canonicalKey = `ashby:${boardKey}:${ref.jobId}`;
    if (res.status === 404) return { canonicalKey, atsBoard: `ashby:${boardKey}`, posting: notLive('ashby', ref, source) };
    if (res.status !== 200) throw new UpstreamError('ashby', res.status, 'Ashby did not respond normally.');
    const jobs = ((JSON.parse(res.body) as { jobs?: AshbyJob[] }).jobs ?? []).filter((j) => j.isListed !== false);
    const job = jobs.find((j) => j.id.toLowerCase() === ref.jobId);
    if (!job) return { canonicalKey, atsBoard: `ashby:${boardKey}`, posting: notLive('ashby', ref, source) };

    // Company name: Ashby's board page title is "<Company> Jobs" or similar.
    let employerName: string | undefined;
    const page = await apiFetch(env, `https://jobs.ashbyhq.com/${encodeURIComponent(ref.board!)}`, {
      provider: 'ashby', operation: 'board_page', cacheSeconds: 86_400, headers: { accept: 'text/html' },
    });
    if (page.status === 200) {
      const t = pageTitle(page.body)?.replace(/\s*(jobs|careers|job board).*$/i, '').replace(/\s*[-|–@].*$/, '').trim();
      if (t) employerName = t;
    }

    const boardJobs = jobs.map((j) => ({ id: j.id, title: j.title, location: j.location }));
    const comp = job.shouldDisplayCompensationOnJobPostings !== false
      ? job.compensation?.scrapeableCompensationSalarySummary || job.compensation?.compensationTierSummary
      : undefined;
    const posting: PostingEvidence = {
      sourceKind: 'ashby',
      inputUrl: ref.inputUrl,
      canonicalUrl: job.jobUrl,
      applyUrl: job.applyUrl ?? job.jobUrl,
      liveOnOfficialSource: true,
      fetchOutcome: 'ok',
      employerName,
      title: job.title.trim(),
      location: [job.location, ...(job.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean).slice(0, 6).join(' / ') || undefined,
      employmentType: job.employmentType ? (EMPLOYMENT[job.employmentType] ?? job.employmentType) : undefined,
      compensationText: comp || undefined,
      publishedAt: job.publishedAt,
      descriptionText: job.descriptionPlain?.trim() || htmlToText(job.descriptionHtml ?? ''),
      sources: [source],
      ...boardStats(boardJobs, job.id, job.title, job.location),
    };
    return { canonicalKey, atsBoard: `ashby:${boardKey}`, posting, boardJobs };
  },
};
