import type { Env } from '../env';
import { newId, nowIso, parseJson } from '../lib/util';
import { emailConfigured, sendEmail } from './email';

export interface UserPrefs {
  emailAlerts?: boolean;        // send monitoring alerts by email
  weeklyDigest?: boolean;
  deadlineEmails?: boolean;
  dashboard?: { showStats?: boolean; showAlerts?: boolean; showRecent?: boolean };
  defaultPublicReports?: boolean;
}

export const DEFAULT_PREFS: Required<Pick<UserPrefs, 'emailAlerts' | 'weeklyDigest' | 'deadlineEmails' | 'defaultPublicReports'>> = {
  emailAlerts: true,
  weeklyDigest: true,
  deadlineEmails: true,
  defaultPublicReports: false,
};

export function readPrefs(json: string): UserPrefs & typeof DEFAULT_PREFS {
  return { ...DEFAULT_PREFS, ...parseJson<UserPrefs>(json, {}) };
}

export interface NotifyInput {
  kind: string;
  title: string;
  body: string;
  link?: string;
  /** Same key twice = one notification. Stops the cron from repeating itself. */
  dedupeKey: string;
  /** Try to email too (respects the user's preference for alerts). */
  email?: boolean;
}

export async function notify(env: Env, userId: string, n: NotifyInput): Promise<boolean> {
  const id = newId('ntf');
  const inserted = await env.DB.prepare(
    'INSERT OR IGNORE INTO notifications (id, user_id, kind, title, body, link, dedupe_key, created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
  ).bind(id, userId, n.kind, n.title, n.body, n.link ?? null, n.dedupeKey, nowIso()).first();
  if (!inserted) return false;
  if (n.email && emailConfigured(env)) {
    const user = await env.DB.prepare('SELECT email, prefs_json FROM users WHERE id = ?').bind(userId).first<{ email: string; prefs_json: string }>();
    const prefs = user ? readPrefs(user.prefs_json) : null;
    const wants = n.kind === 'deadline' ? prefs?.deadlineEmails : n.kind === 'billing' ? true : prefs?.emailAlerts;
    if (user && wants) {
      const r = await sendEmail(env, { to: user.email, subject: n.title, text: n.body, action: n.link ? { label: 'Open JobSignal', url: env.APP_URL + n.link } : undefined });
      if (r.sent) await env.DB.prepare('UPDATE notifications SET emailed_at = ? WHERE id = ?').bind(nowIso(), id).run();
    }
  }
  return true;
}
