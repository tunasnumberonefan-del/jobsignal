import type { Env } from '../env';
import { UpstreamError } from '../lib/http';
import { ashby } from './ashby';
import { greenhouse } from './greenhouse';
import { jsonld } from './jsonld';
import { lever } from './lever';
import type { AdapterResult, JobAdapter, JobRef } from './types';

/** Order matters: specific ATS adapters first, the generic page reader last. */
export const ADAPTERS: JobAdapter[] = [greenhouse, lever, ashby];

export function parseJobUrl(url: URL): JobRef {
  for (const a of ADAPTERS) {
    const ref = a.parse(url);
    if (ref) return ref;
  }
  return jsonld.parse(url)!;
}

export function adapterFor(kind: JobRef['kind']): JobAdapter {
  return [...ADAPTERS, jsonld].find((a) => a.kind === kind) ?? jsonld;
}

export async function fetchPosting(env: Env, ref: JobRef, opts?: { fresh?: boolean }): Promise<AdapterResult> {
  try {
    return await adapterFor(ref.kind).fetch(env, ref, opts);
  } catch (e) {
    // A guessed Greenhouse board that turned out wrong: fall back to reading the page itself.
    if (e instanceof UpstreamError && e.message === 'board_guess_failed') {
      return jsonld.fetch(env, { kind: 'jsonld', inputUrl: ref.inputUrl }, opts);
    }
    throw e;
  }
}

export const SUPPORTED_SOURCES = [
  { name: 'Greenhouse', example: 'boards.greenhouse.io/{company}/jobs/{id}', official: true },
  { name: 'Lever', example: 'jobs.lever.co/{company}/{id}', official: true },
  { name: 'Ashby', example: 'jobs.ashbyhq.com/{company}/{id}', official: true },
  { name: 'Company career pages', example: 'Pages that publish schema.org JobPosting data', official: false },
];
