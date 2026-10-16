// Everything the Worker reads from its environment. Bindings come from wrangler.jsonc,
// secrets from .dev.vars (local) or `wrangler secret put` (production).

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  APP_ENV: string;              // 'development' | 'production'
  APP_URL: string;              // public origin, no trailing slash
  BILLING_MODE: string;         // 'dev' | 'stripe' | 'off'
  EMAIL_MODE: string;           // 'console' | 'resend'
  EMAIL_FROM: string;
  SEC_USER_AGENT: string;       // SEC asks for "Company Name contact@email"

  SESSION_PEPPER?: string;
  ADMIN_EMAILS?: string;
  RESEND_API_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;  // public, safe to expose
}

export function isProd(env: Env): boolean {
  return env.APP_ENV === 'production';
}

/** Fails loudly at startup-ish time instead of half-working in production. */
export function assertConfig(env: Env): void {
  if (!isProd(env)) return;
  const missing: string[] = [];
  if (!env.SESSION_PEPPER || env.SESSION_PEPPER.length < 32) missing.push('SESSION_PEPPER (32+ chars)');
  if (!env.APP_URL.startsWith('https://')) missing.push('APP_URL must be https in production');
  if (env.BILLING_MODE === 'dev') missing.push('BILLING_MODE must not be "dev" in production');
  if (env.BILLING_MODE === 'stripe' && (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_PRICE_PRO_MONTHLY))
    missing.push('STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / STRIPE_PRICE_PRO_MONTHLY');
  if (env.EMAIL_MODE !== 'resend' || !env.RESEND_API_KEY) missing.push('EMAIL_MODE=resend and RESEND_API_KEY (sign-in emails)');
  if (/example\.com|set SEC_USER_AGENT/.test(env.SEC_USER_AGENT)) missing.push('SEC_USER_AGENT with a real contact email');
  if (missing.length) throw new Error('Production config incomplete: ' + missing.join('; '));
}
