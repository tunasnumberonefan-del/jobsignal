// Passwordless sign-in with emailed links.
// - No passwords to store, leak, or reset. "Forgot password" is just signing in again.
// - Tokens are 256-bit random values. We store only their SHA-256 hash.
// - The emailed link opens a page that POSTs the token, so link scanners in mail clients
//   (which follow GET links) can't burn the token before the person clicks.

import type { Env } from '../env';
import { isProd } from '../env';
import { AppError, badRequest } from '../lib/errors';
import { addDays, newId, nowIso, randomToken, sha256Hex } from '../lib/util';
import { sendEmail } from './email';
import { rateLimit } from './usage';

export const SESSION_COOKIE = 'js_session';
export const SESSION_DAYS = 30;
const LOGIN_TOKEN_MINUTES = 20;

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: 'user' | 'admin';
  prefs_json: string;
  created_at: string;
  last_login_at: string | null;
  email_verified_at: string | null;
  suspended_at: string | null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function requestLoginLink(env: Env, rawEmail: string, ipHash: string, next?: string): Promise<{ devLink?: string }> {
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) throw badRequest('That email address doesn\'t look right.');
  if (!(await rateLimit(env, `login:email:${await sha256Hex(email)}`, 5, 3600))) throw new AppError('rate_limited', 'Too many sign-in emails for that address. Try again in an hour.');
  // Locally every test run signs in from the same address, so only production gets the tight limit.
  if (!(await rateLimit(env, `login:ip:${ipHash}`, isProd(env) ? 20 : 1000, 3600))) throw new AppError('rate_limited', 'Too many sign-in attempts from here. Try again later.');

  const signupsOn = await env.DB.prepare("SELECT enabled FROM feature_flags WHERE key = 'signups'").first<{ enabled: number }>();
  if (signupsOn && signupsOn.enabled === 0) {
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
    if (!exists) throw new AppError('disabled', "We've paused new sign-ups for a bit. Please try again soon.");
  }

  const token = randomToken(32);
  const now = nowIso();
  await env.DB.prepare('INSERT INTO login_tokens (token_hash, email, created_at, expires_at, ip_hash) VALUES (?,?,?,?,?)')
    .bind(await sha256Hex(token), email, now, new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000).toISOString(), ipHash)
    .run();
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  const link = `${env.APP_URL}/auth/verify#token=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNext)}`;
  await sendEmail(env, {
    to: email,
    subject: 'Your JobSignal sign-in link',
    text: `Here's your link to sign in to JobSignal. It works once and expires in ${LOGIN_TOKEN_MINUTES} minutes.\n\nIf you didn't ask for this, you can ignore it. Nobody can sign in without clicking the link.`,
    action: { label: 'Sign in to JobSignal', url: link },
  });
  // Only ever returned outside production, so you can sign in locally without an email provider.
  return isProd(env) ? {} : { devLink: link };
}

export async function verifyLoginToken(env: Env, token: string, userAgent: string | null): Promise<{ user: UserRow; sessionToken: string; isNew: boolean }> {
  if (!token || token.length < 20) throw badRequest('That sign-in link is incomplete.');
  const hash = await sha256Hex(token);
  const now = nowIso();
  // Mark used and read in one statement so the same link can't be used twice in parallel.
  const row = await env.DB.prepare('UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email')
    .bind(now, hash, now)
    .first<{ email: string }>();
  if (!row) throw new AppError('unauthorized', 'That sign-in link has expired or was already used. Request a new one.');

  let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(row.email).first<UserRow>();
  const isNew = !user;
  const admins = (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const role = admins.includes(row.email) ? 'admin' : 'user';
  if (!user) {
    const id = newId('usr');
    await env.DB.prepare('INSERT INTO users (id, email, role, created_at, last_login_at, email_verified_at) VALUES (?,?,?,?,?,?)')
      .bind(id, row.email, role, now, now, now)
      .run();
    user = (await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>())!;
  } else {
    if (user.suspended_at) throw new AppError('forbidden', 'This account has been suspended. Contact support if you think this is a mistake.');
    // Admin is granted by config only. Removing someone from ADMIN_EMAILS removes admin on next sign-in.
    await env.DB.prepare('UPDATE users SET last_login_at = ?, email_verified_at = COALESCE(email_verified_at, ?), role = ? WHERE id = ?')
      .bind(now, now, role, user.id)
      .run();
    user.role = role;
  }
  const sessionToken = randomToken(32);
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?,?,?,?,?,?)')
    .bind(await sha256Hex(sessionToken), user.id, now, addDays(now, SESSION_DAYS), now, userAgent?.slice(0, 200) ?? null)
    .run();
  return { user, sessionToken, isNew };
}

export async function userFromSession(env: Env, token: string | undefined): Promise<UserRow | null> {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const now = nowIso();
  const s = await env.DB.prepare('SELECT user_id, last_seen_at FROM sessions WHERE id_hash = ? AND expires_at > ?').bind(hash, now).first<{ user_id: string; last_seen_at: string }>();
  if (!s) return null;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.user_id).first<UserRow>();
  if (!user || user.suspended_at) return null;
  // Sliding expiry, but only touch the row once an hour to save writes.
  if (Date.now() - Date.parse(s.last_seen_at) > 3_600_000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?').bind(now, addDays(now, SESSION_DAYS), hash).run();
  }
  return user;
}

export async function destroySession(env: Env, token: string | undefined): Promise<void> {
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256Hex(token)).run();
}

export function sessionCookie(env: Env, token: string, maxAgeSeconds = SESSION_DAYS * 86_400): string {
  const secure = env.APP_URL.startsWith('https://') ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie(env: Env): string {
  return sessionCookie(env, '', 0);
}
