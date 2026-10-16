// Outbound HTTP. Every request to a URL a user gave us goes through safeFetch so we
// can't be pointed at internal addresses (SSRF), can't hang forever, and can't be fed
// a 200MB page. Requests to fixed, known APIs use apiFetch, which adds logging + caching.

import type { Env } from '../env';
import { newId, nowIso, sha256Hex } from './util';
import { log } from './log';

export const USER_AGENT = 'JobSignalBot/1.0 (+https://github.com/jobsignal; job posting verification)';
const MAX_BYTES = 2_500_000;
const MAX_REDIRECTS = 4;

export class UrlRejected extends Error {}

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.0\./, /^198\.(1[89])\./, /^2(2[4-9]|[3-5]\d)\./,
];

/** Validates a URL a user submitted. Throws UrlRejected with a human message. */
export function validatePublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new UrlRejected("That doesn't look like a web address. It should start with https://");
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new UrlRejected('Only http and https links are supported.');
  if (u.username || u.password) throw new UrlRejected("Links with a username or password in them aren't supported.");
  if (u.port && u.port !== '80' && u.port !== '443') throw new UrlRejected("Links with a custom port aren't supported.");
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.')) throw new UrlRejected('That address has no domain name.');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa'))
    throw new UrlRejected("That's a local address, not a public job listing.");
  // IP literals: we only accept domain names. Job listings don't live on bare IPs.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    if (PRIVATE_V4.some((r) => r.test(host))) throw new UrlRejected("That's a private network address.");
    throw new UrlRejected('Please use the listing\'s normal web address, not an IP address.');
  }
  if (host.startsWith('[') || host.includes(':')) throw new UrlRejected('Please use the listing\'s normal web address, not an IP address.');
  if (/^\d+$/.test(host.replace(/\./g, ''))) throw new UrlRejected("That address isn't valid.");
  if (raw.length > 2048) throw new UrlRejected('That link is too long.');
  u.hash = '';
  return u;
}

export interface FetchResult {
  status: number;
  url: string;          // final URL after redirects
  body: string;
  contentType: string;
}

async function readCapped(res: Response, max = MAX_BYTES): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(Math.min(total, max));
  let off = 0;
  for (const c of chunks) {
    all.set(c.subarray(0, Math.max(0, all.length - off)), off);
    off += c.byteLength;
    if (off >= all.length) break;
  }
  return new TextDecoder().decode(all);
}

/** Fetch a user-supplied URL. Follows redirects manually and re-validates every hop. */
export async function safeFetch(rawUrl: string, init: { accept?: string; timeoutMs?: number } = {}): Promise<FetchResult> {
  let url = validatePublicUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url.toString(), {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: init.accept ?? 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5' },
      signal: AbortSignal.timeout(init.timeoutMs ?? 9000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location')!, url);
      url = validatePublicUrl(next.toString());
      continue;
    }
    const body = await readCapped(res);
    return { status: res.status, url: url.toString(), body, contentType: res.headers.get('content-type') ?? '' };
  }
  throw new UrlRejected('That link redirects too many times.');
}

// ------------------------------------------------------------------ robots.txt

const robotsMemo = new Map<string, { at: number; rules: string[] }>();

/** Minimal robots.txt check for our user agent group and '*'. Disallow-prefix matching only. */
export async function robotsAllows(target: URL): Promise<boolean> {
  const origin = target.origin;
  let entry = robotsMemo.get(origin);
  if (!entry || Date.now() - entry.at > 3_600_000) {
    let rules: string[] = [];
    try {
      const r = await safeFetch(origin + '/robots.txt', { accept: 'text/plain', timeoutMs: 4000 });
      if (r.status === 200) rules = parseRobots(r.body);
      // 4xx = no robots file = allowed. 5xx = treat as allowed but we only do one request anyway.
    } catch {
      rules = [];
    }
    entry = { at: Date.now(), rules };
    robotsMemo.set(origin, entry);
  }
  const path = target.pathname + target.search;
  return !entry.rules.some((d) => d !== '' && path.startsWith(d));
}

export function parseRobots(txt: string): string[] {
  const groups: Array<{ agents: string[]; disallow: string[]; allowAll: boolean }> = [];
  let cur: { agents: string[]; disallow: string[]; allowAll: boolean } | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], disallow: [], allowAll: false };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'disallow') cur.disallow.push(val);
    }
  }
  const ours = groups.find((g) => g.agents.some((a) => a.includes('jobsignal')));
  const star = groups.find((g) => g.agents.includes('*'));
  return (ours ?? star)?.disallow ?? [];
}

// ------------------------------------------------------------------ known APIs

export interface ApiFetchOpts {
  provider: string;
  operation: string;
  /** Cache successful (and 404) responses in D1 for this long. 0 = no cache. */
  cacheSeconds?: number;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Bypass the cache read (still writes). Used by monitoring rechecks. */
  fresh?: boolean;
}

export interface ApiResult {
  status: number;
  body: string;
  fromCache: boolean;
  fetchedAt: string;
}

/**
 * Fetch from a fixed, trusted API host (Greenhouse, Lever, SEC...). Records provider health,
 * caches in D1 so a hundred people checking the same job cost one upstream request,
 * and retries once on 429/5xx.
 */
export async function apiFetch(env: Env, url: string, opts: ApiFetchOpts): Promise<ApiResult> {
  const key = opts.cacheSeconds ? await sha256Hex(url) : '';
  if (key && !opts.fresh) {
    const hit = await env.DB.prepare('SELECT status, body, fetched_at FROM fetch_cache WHERE key = ? AND expires_at > ?')
      .bind(key, nowIso())
      .first<{ status: number; body: string; fetched_at: string }>();
    if (hit) return { status: hit.status, body: hit.body, fromCache: true, fetchedAt: hit.fetched_at };
  }

  const started = Date.now();
  let status = 0;
  let body = '';
  let error: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
      });
      status = res.status;
      body = await readCapped(res, 6_000_000);
      error = undefined;
      if (status === 429 || status >= 500) {
        error = `HTTP ${status}`;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
      }
      break;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      status = 0;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
    }
  }
  const fetchedAt = nowIso();
  const ok = status >= 200 && status < 300;
  // Provider health is best effort. Never fail a request because logging failed.
  try {
    await env.DB.prepare('INSERT INTO provider_runs (id, provider, operation, ok, status_code, duration_ms, error, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(newId('pr'), opts.provider, opts.operation, ok || status === 404 ? 1 : 0, status || null, Date.now() - started, error ?? null, fetchedAt)
      .run();
  } catch (e) {
    log('warn', 'provider_run_log_failed', { error: String(e) });
  }
  if (key && (ok || status === 404) && body.length < 1_800_000) {
    const expires = new Date(Date.now() + opts.cacheSeconds! * 1000).toISOString();
    await env.DB.prepare('INSERT OR REPLACE INTO fetch_cache (key, status, body, fetched_at, expires_at) VALUES (?,?,?,?,?)')
      .bind(key, status, body, fetchedAt, expires)
      .run()
      .catch((e: unknown) => log('warn', 'cache_write_failed', { error: String(e) }));
  }
  return { status, body, fromCache: false, fetchedAt };
}

export class UpstreamError extends Error {
  constructor(readonly provider: string, readonly status: number, message: string) {
    super(message);
  }
}
