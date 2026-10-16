import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z, ZodError } from 'zod';
import type { Env } from './env';
import { PLANS, type Entitlements, type PlanId } from '@shared/entitlements';
import { AppError, forbidden, unauthorized } from './lib/errors';
import { log } from './lib/log';
import { newId, randomToken, sha256Hex } from './lib/util';
import { SESSION_COOKIE, userFromSession, type UserRow } from './services/auth';
import { planForUser, type SubscriptionRow } from './services/billing';

export interface Vars {
  requestId: string;
  user: UserRow | null;
  plan: PlanId;
  ent: Entitlements;
  sub: SubscriptionRow | null;
  anonId: string;
  ipHash: string;
}

export type AppEnv = { Bindings: Env; Variables: Vars };
export type Ctx = Context<AppEnv>;

export function createApp() {
  return new Hono<AppEnv>();
}

const ANON_COOKIE = 'js_anon';

/** Request id, logging, and turning errors into clean JSON. */
export const base: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = newId('req', 10);
  c.set('requestId', requestId);
  const started = Date.now();
  await next();
  c.header('x-request-id', requestId);
  if (c.req.path.startsWith('/api/')) {
    c.header('cache-control', c.res.headers.get('cache-control') ?? 'no-store');
    c.header('x-content-type-options', 'nosniff');
    c.header('referrer-policy', 'strict-origin-when-cross-origin');
  }
  log('info', 'request', { requestId, method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started });
};

export function errorHandler(err: Error, c: Ctx) {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message, ...err.extra } }, err.status as 400);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return c.json({ error: { code: 'bad_request', message: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input.' } }, 400);
  }
  log('error', 'unhandled', { requestId: c.get('requestId'), error: err.message, stack: err.stack?.slice(0, 800) });
  return c.json({ error: { code: 'internal', message: `Something broke on our side. It's been logged (ref ${c.get('requestId')}).` } }, 500);
}

/**
 * CSRF: state-changing API calls must come from our own pages. Browsers always send
 * Origin on cross-site POSTs, and Sec-Fetch-Site where supported. Webhooks are exempt
 * because they're authenticated by signature instead.
 */
export const csrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  const m = c.req.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS' || c.req.path === '/api/billing/webhook') return next();
  const origin = c.req.header('origin');
  const site = c.req.header('sec-fetch-site');
  const allowed = new URL(c.env.APP_URL).origin;
  const reqOrigin = new URL(c.req.url).origin;
  const ok = (origin && (origin === allowed || origin === reqOrigin)) || (!origin && (site === 'same-origin' || site === undefined && c.env.APP_ENV !== 'production'));
  if (!ok) throw new AppError('forbidden', 'Cross-site request blocked.');
  const ct = c.req.header('content-type') ?? '';
  if (m !== 'DELETE' && !ct.includes('application/json')) throw new AppError('bad_request', 'Expected a JSON body.');
  return next();
};

/** Loads the user (if any), their plan, and a stable anonymous id for visitors. */
export const identity: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = await userFromSession(c.env, getCookie(c, SESSION_COOKIE));
  let plan: PlanId = 'anonymous';
  let sub: SubscriptionRow | null = null;
  if (user) {
    const r = await planForUser(c.env, user.id);
    plan = r.plan;
    sub = r.sub;
  }
  let anonId = getCookie(c, ANON_COOKIE);
  if (!anonId || !/^[A-Za-z0-9_-]{16,64}$/.test(anonId)) {
    anonId = randomToken(18);
    setCookie(c, ANON_COOKIE, anonId, { path: '/', httpOnly: true, sameSite: 'Lax', secure: c.env.APP_URL.startsWith('https://'), maxAge: 60 * 86_400 });
  }
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  c.set('ipHash', (await sha256Hex(`${c.env.SESSION_PEPPER ?? 'dev-pepper'}|${ip}`)).slice(0, 32));
  c.set('user', user);
  c.set('plan', plan);
  c.set('ent', PLANS[plan]);
  c.set('sub', sub);
  c.set('anonId', anonId);
  return next();
};

export function requireUser(c: Ctx): UserRow {
  const u = c.get('user');
  if (!u) throw unauthorized();
  return u;
}

export function requireAdmin(c: Ctx): UserRow {
  const u = requireUser(c);
  if (u.role !== 'admin') throw forbidden();
  return u;
}

export async function body<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new AppError('bad_request', 'Expected a JSON body.');
  }
  return schema.parse(raw);
}

export function subjectKey(c: Ctx): string {
  const u = c.get('user');
  return u ? `user:${u.id}` : `anon:${c.get('ipHash')}`;
}
