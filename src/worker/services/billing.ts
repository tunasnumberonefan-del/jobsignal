// Subscriptions. Two modes:
//   BILLING_MODE=stripe  real Stripe Checkout + Customer Portal + webhooks (REST, no SDK)
//   BILLING_MODE=dev     a local simulator so the whole flow can be tested with no account.
//                        Refused in production (see assertConfig) and clearly labeled in the UI.
//
// The subscriptions table is the single source of truth for entitlements, and only the
// webhook handler (or the dev simulator) writes to it.

import type { Env } from '../env';
import { isProd } from '../env';
import { planFor, type PlanId } from '@shared/entitlements';
import { AppError, badRequest } from '../lib/errors';
import { hmacSha256Hex, newId, nowIso, safeEqual } from '../lib/util';
import { log } from '../lib/log';
import { notify } from './notifications';

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  provider: 'stripe' | 'dev';
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
}

export async function getSubscription(env: Env, userId: string): Promise<SubscriptionRow | null> {
  return env.DB.prepare('SELECT * FROM subscriptions WHERE user_id = ?').bind(userId).first<SubscriptionRow>();
}

export async function planForUser(env: Env, userId: string): Promise<{ plan: PlanId; sub: SubscriptionRow | null }> {
  const sub = await getSubscription(env, userId);
  return { plan: planFor(sub), sub };
}

// ------------------------------------------------------------------ Stripe REST

function form(data: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) p.append(k, String(v));
  return p.toString();
}

async function stripe<T>(env: Env, method: 'GET' | 'POST', path: string, body?: Record<string, string | number | boolean | undefined>): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new AppError('disabled', 'Billing is not configured yet.');
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2025-03-31.basil' },
    body: body ? form(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) {
    log('error', 'stripe_error', { path, status: res.status, message: json.error?.message });
    throw new AppError('upstream_unavailable', "Our payment provider didn't accept that request. Nothing was charged. Please try again.");
  }
  return json;
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  items?: { data: Array<{ current_period_end?: number; price?: { id: string } }> };
  metadata?: Record<string, string>;
}

export async function createCheckout(env: Env, user: { id: string; email: string }): Promise<{ url: string; simulated: boolean }> {
  const existing = await getSubscription(env, user.id);
  if (existing && planFor(existing) === 'pro' && existing.cancel_at_period_end === 0) {
    throw new AppError('conflict', 'You already have Pro. Manage it from the billing page.');
  }
  if (env.BILLING_MODE === 'off') throw new AppError('disabled', "Pro isn't available yet. Everything on the free plan works in the meantime.");
  if (env.BILLING_MODE === 'dev') {
    if (isProd(env)) throw new AppError('disabled', 'Billing is not configured.');
    return { url: `/billing/dev-checkout?ref=${newId('cs')}`, simulated: true };
  }
  if (!env.STRIPE_PRICE_PRO_MONTHLY) throw new AppError('disabled', 'Billing is not configured yet.');
  const session = await stripe<{ url: string }>(env, 'POST', '/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price]': env.STRIPE_PRICE_PRO_MONTHLY,
    'line_items[0][quantity]': 1,
    success_url: `${env.APP_URL}/account/billing?checkout=success`,
    cancel_url: `${env.APP_URL}/pricing?checkout=canceled`,
    client_reference_id: user.id,
    ...(existing?.provider_customer_id ? { customer: existing.provider_customer_id } : { customer_email: user.email }),
    'subscription_data[metadata][user_id]': user.id,
    allow_promotion_codes: true,
  });
  return { url: session.url, simulated: false };
}

export async function createPortal(env: Env, userId: string): Promise<{ url: string }> {
  const sub = await getSubscription(env, userId);
  if (!sub) throw badRequest("You don't have a subscription to manage yet.");
  if (sub.provider === 'dev') return { url: '/account/billing' };
  if (!sub.provider_customer_id) throw badRequest('No billing account found.');
  const s = await stripe<{ url: string }>(env, 'POST', '/billing_portal/sessions', {
    customer: sub.provider_customer_id,
    return_url: `${env.APP_URL}/account/billing`,
  });
  return { url: s.url };
}

function periodEnd(s: StripeSubscription): string | null {
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

async function upsertFromStripe(env: Env, s: StripeSubscription, userIdHint?: string): Promise<string | null> {
  let userId = userIdHint ?? s.metadata?.user_id ?? null;
  if (!userId) {
    const bySub = await env.DB.prepare('SELECT user_id FROM subscriptions WHERE provider_subscription_id = ? OR provider_customer_id = ?').bind(s.id, s.customer).first<{ user_id: string }>();
    userId = bySub?.user_id ?? null;
  }
  if (!userId) {
    log('warn', 'stripe_subscription_unmatched', { subscription: s.id });
    return null;
  }
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE id = ?').bind(userId).first();
  if (!exists) return null;
  const now = nowIso();
  const status = ['active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid'].includes(s.status) ? s.status : s.status === 'incomplete_expired' ? 'canceled' : 'incomplete';
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, user_id, plan, status, provider, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status, provider = excluded.provider,
       provider_customer_id = excluded.provider_customer_id, provider_subscription_id = excluded.provider_subscription_id,
       current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at`,
  ).bind(newId('sub'), userId, 'pro', status, 'stripe', s.customer, s.id, periodEnd(s), s.cancel_at_period_end ? 1 : 0, now, now).run();
  return userId;
}

/**
 * Verify Stripe's signature header: "t=<unix>,v1=<hex hmac>[,v1=...]".
 * Signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the endpoint secret.
 */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || !sigs.length) return false;
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}

interface StripeEvent { id: string; type: string; data: { object: Record<string, unknown> } }

export async function handleStripeWebhook(env: Env, rawBody: string, signature: string | null): Promise<{ status: number; message: string }> {
  if (!env.STRIPE_WEBHOOK_SECRET) return { status: 503, message: 'webhooks not configured' };
  if (!(await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET))) return { status: 400, message: 'invalid signature' };
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return { status: 400, message: 'invalid json' };
  }
  // Idempotency: Stripe retries. If we've processed this event id, acknowledge and stop.
  const inserted = await env.DB.prepare('INSERT OR IGNORE INTO payment_events (id, provider, type, received_at) VALUES (?,?,?,?) RETURNING id')
    .bind(event.id, 'stripe', event.type, nowIso()).first();
  if (!inserted) {
    const prior = await env.DB.prepare('SELECT processed_at FROM payment_events WHERE id = ?').bind(event.id).first<{ processed_at: string | null }>();
    if (prior?.processed_at) return { status: 200, message: 'duplicate' };
  }
  try {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode === 'subscription' && typeof obj.subscription === 'string') {
          const sub = await stripe<StripeSubscription>(env, 'GET', `/subscriptions/${obj.subscription}`);
          const userId = await upsertFromStripe(env, sub, typeof obj.client_reference_id === 'string' ? obj.client_reference_id : undefined);
          if (userId) await notify(env, userId, { kind: 'billing', title: 'Welcome to Pro', body: 'Your subscription is active. Monitoring, comparisons, and full reports are unlocked.', link: '/dashboard', dedupeKey: `billing:welcome:${sub.id}` });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await upsertFromStripe(env, obj as unknown as StripeSubscription);
        break;
      }
      case 'invoice.payment_failed': {
        const customer = obj.customer as string | undefined;
        const row = customer ? await env.DB.prepare('SELECT user_id FROM subscriptions WHERE provider_customer_id = ?').bind(customer).first<{ user_id: string }>() : null;
        if (row) await notify(env, row.user_id, { kind: 'billing', title: "Your payment didn't go through", body: "We couldn't charge your card for Pro. Stripe will retry automatically. You can update your card from the billing page. You keep Pro while it retries.", link: '/account/billing', dedupeKey: `billing:failed:${obj.id as string}`, email: true });
        break;
      }
      default:
        break;
    }
    await env.DB.prepare('UPDATE payment_events SET processed_at = ?, error = NULL WHERE id = ?').bind(nowIso(), event.id).run();
    return { status: 200, message: 'ok' };
  } catch (e) {
    await env.DB.prepare('UPDATE payment_events SET error = ? WHERE id = ?').bind(String(e).slice(0, 500), event.id).run();
    log('error', 'stripe_webhook_failed', { event: event.id, type: event.type, error: String(e) });
    // 500 so Stripe retries later.
    return { status: 500, message: 'processing failed' };
  }
}

// ------------------------------------------------------------------ dev simulator

function assertDev(env: Env) {
  if (env.BILLING_MODE !== 'dev' || isProd(env)) throw new AppError('forbidden', 'The billing simulator is only available in development.');
}

export async function devActivate(env: Env, userId: string): Promise<void> {
  assertDev(env);
  const now = nowIso();
  const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, user_id, plan, status, provider, provider_subscription_id, current_period_end, cancel_at_period_end, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,0,?,?)
     ON CONFLICT(user_id) DO UPDATE SET plan='pro', status='active', provider='dev', provider_subscription_id=excluded.provider_subscription_id,
       current_period_end=excluded.current_period_end, cancel_at_period_end=0, updated_at=excluded.updated_at`,
  ).bind(newId('sub'), userId, 'pro', 'active', 'dev', newId('devsub'), end, now, now).run();
  await notify(env, userId, { kind: 'billing', title: 'Pro activated (simulated)', body: 'This is a development simulation. No payment was taken.', link: '/dashboard', dedupeKey: `billing:dev:${now}` });
}

export type DevBillingAction = 'cancel_at_period_end' | 'resume' | 'cancel_now' | 'payment_failed' | 'expire';

export async function devAction(env: Env, userId: string, action: DevBillingAction): Promise<void> {
  assertDev(env);
  const sub = await getSubscription(env, userId);
  if (!sub) throw badRequest('No simulated subscription yet.');
  const now = nowIso();
  const set = (sql: string, ...args: unknown[]) => env.DB.prepare(`UPDATE subscriptions SET ${sql}, updated_at = ? WHERE user_id = ?`).bind(...args, now, userId).run();
  switch (action) {
    case 'cancel_at_period_end': await set('cancel_at_period_end = 1'); break;
    case 'resume': await set("cancel_at_period_end = 0, status = 'active'"); break;
    case 'cancel_now': await set("status = 'canceled', cancel_at_period_end = 0"); break;
    case 'payment_failed':
      await set("status = 'past_due'");
      await notify(env, userId, { kind: 'billing', title: "Your payment didn't go through (simulated)", body: 'Simulated failed renewal. In production Stripe retries automatically.', link: '/account/billing', dedupeKey: `billing:devfail:${now}` });
      break;
    case 'expire': await set('current_period_end = ?', new Date(Date.now() - 5 * 86_400_000).toISOString()); break;
  }
}
