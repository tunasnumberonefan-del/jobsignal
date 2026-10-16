import type { Env } from '../env';
import type { PostingEvidence, SourceKind } from '@shared/types';

/** What an adapter pulls out of a URL before fetching anything. */
export interface JobRef {
  kind: SourceKind;
  /** Board / org token on the ATS (greenhouse board token, lever site, ashby org). */
  board?: string;
  jobId?: string;
  inputUrl: string;
  /** True when the board token was guessed (e.g. from a custom careers domain) and must be confirmed. */
  boardGuessed?: boolean;
  region?: 'eu';
}

export interface AdapterResult {
  posting: PostingEvidence;
  /** Stable key for the jobs table. */
  canonicalKey: string;
  /** e.g. 'greenhouse:airbnb'. Used for company entity resolution. */
  atsBoard?: string;
  /** Other open jobs on the same board, for duplicate + hiring-activity checks. */
  boardJobs?: Array<{ id: string; title: string; location?: string }>;
}

export interface JobAdapter {
  kind: SourceKind;
  /** Return a JobRef if this adapter understands the URL, else null. Must not do I/O. */
  parse(url: URL): JobRef | null;
  fetch(env: Env, ref: JobRef, opts?: { fresh?: boolean }): Promise<AdapterResult>;
}
