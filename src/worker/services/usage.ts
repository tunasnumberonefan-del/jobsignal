import type { Env } from '../env';
import type { Entitlements } from '@shared/entitlements';
import { newId, nowIso } from '../lib/util';

export function windowStart(window: 'day' | 'month', now = Date.now()): string {
  const ms = window === 'day' ? 86_400_000 : 30 * 86_400_000;
  return new Date(now - ms).toISOString();
}

export async function usageCount(env: Env, subjectKey: string, kind: string, sinceIso: string): Promise<number> {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM usage_records WHERE subject_key = ? AND kind = ? AND created_at > ?')
    .bind(subjectKey, kind, sinceIso)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

export interface QuotaState {
  used: number;
  limit: number;
  window: 'day' | 'month';
  remaining: number;
  resetsAt: string | null;   // when the oldest counted use falls out of the window
}

export async function analysisQuota(env: Env, subjectKey: string, ent: Entitlements): Promise<QuotaState> {
  const since = windowStart(ent.analyses.window);
  const used = await usageCount(env, subjectKey, 'analysis', since);
  let resetsAt: string | null = null;
  if (used >= ent.analyses.limit) {
    const oldest = await env.DB.prepare('SELECT created_at FROM usage_records WHERE subject_key = ? AND kind = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1')
      .bind(subjectKey, 'analysis', since)
      .first<{ created_at: string }>();
    if (oldest) resetsAt = new Date(Date.parse(oldest.created_at) + (ent.analyses.window === 'day' ? 86_400_000 : 30 * 86_400_000)).toISOString();
  }
  return { used, limit: ent.analyses.limit, window: ent.analyses.window, remaining: Math.max(0, ent.analyses.limit - used), resetsAt };
}

export async function recordUsage(env: Env, subjectKey: string, kind: string): Promise<void> {
  await env.DB.prepare('INSERT INTO usage_records (id, subject_key, kind, created_at) VALUES (?,?,?,?)').bind(newId('use'), subjectKey, kind, nowIso()).run();
}

/**
 * Fixed-window rate limiter in D1. Good enough for abuse protection at our scale.
 * Returns true if the request is allowed.
 */
export async function rateLimit(env: Env, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const win = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds; // window start, epoch seconds
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,
       window_start = excluded.window_start
     RETURNING count`,
  ).bind(key, win).first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}
