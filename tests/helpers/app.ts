// Runs the real Hono app against the test database and the fake upstream services.
import { buildApp } from '../../src/worker/index';
import type { Env } from '../../src/worker/env';
import { TestD1 } from './d1';

export const ORIGIN = 'http://localhost:5173';

export function makeEnv(overrides: Partial<Env> = {}): Env & { DB: TestD1 } {
  const db = new TestD1().migrate();
  return {
    DB: db as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('<!doctype html><html><head><title>JobSignal</title><meta name="description" content="x"></head><body><div id="root"></div></body></html>') } as unknown as Fetcher,
    APP_ENV: 'development',
    APP_URL: ORIGIN,
    BILLING_MODE: 'dev',
    EMAIL_MODE: 'console',
    EMAIL_FROM: 'JobSignal <test@example.com>',
    SEC_USER_AGENT: 'JobSignal tests test@example.com',
    SESSION_PEPPER: 'test-pepper-test-pepper-test-pepper-1234',
    ADMIN_EMAILS: 'admin@example.com',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    ...overrides,
  } as Env & { DB: TestD1 };
}

/** A browser-ish client with its own cookie jar and IP. */
export class Client {
  private cookies = new Map<string, string>();
  constructor(private env: Env, private ip = '203.0.113.' + Math.floor(Math.random() * 200 + 1)) {}
  private app = buildApp();

  async req(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { 'cf-connecting-ip': this.ip, ...extraHeaders };
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (method !== 'GET') {
      headers.origin ??= ORIGIN;
      if (body !== undefined) headers['content-type'] ??= 'application/json';
    }
    const res = await this.app.fetch(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), this.env);
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const [k, v] = pair!.split('=');
      if (/max-age=0/i.test(sc) || !v) this.cookies.delete(k!.trim());
      else this.cookies.set(k!.trim(), v.trim());
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get(p: string) { return this.req('GET', p); }
  post(p: string, b: unknown = {}) { return this.req('POST', p, b); }
  patch(p: string, b: unknown) { return this.req('PATCH', p, b); }
  del(p: string, b?: unknown) { return this.req('DELETE', p, b); }

  /** Full magic-link sign-in using the dev link the API returns outside production. */
  async signIn(email: string) {
    const r = await this.post('/api/auth/request', { email });
    if (r.status !== 200) throw new Error('request failed ' + r.text);
    const token = decodeURIComponent(String(r.json.devLink).split('#token=')[1]!.split('&')[0]!);
    const v = await this.post('/api/auth/verify', { token });
    if (v.status !== 200) throw new Error('verify failed ' + v.text);
    return v.json;
  }
}
