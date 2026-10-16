import { z } from 'zod';
import { body, createApp, requireUser } from '../app';
import { createCheckout, createPortal, devAction, devActivate, getSubscription, handleStripeWebhook } from '../services/billing';
import { planFor } from '@shared/entitlements';

export const billingRoutes = createApp();

billingRoutes.post('/api/billing/checkout', async (c) => {
  const user = requireUser(c);
  return c.json(await createCheckout(c.env, user));
});

billingRoutes.post('/api/billing/portal', async (c) => {
  const user = requireUser(c);
  return c.json(await createPortal(c.env, user.id));
});

billingRoutes.get('/api/billing/status', async (c) => {
  const user = requireUser(c);
  const sub = await getSubscription(c.env, user.id);
  return c.json({
    mode: c.env.BILLING_MODE === 'stripe' ? 'stripe' : 'dev',
    plan: planFor(sub),
    subscription: sub && {
      status: sub.status,
      provider: sub.provider,
      currentPeriodEnd: sub.current_period_end,
      cancelAtPeriodEnd: sub.cancel_at_period_end === 1,
      updatedAt: sub.updated_at,
    },
  });
});

// Stripe calls this. Authenticated by signature, not cookies, so it skips CSRF (see app.ts).
billingRoutes.post('/api/billing/webhook', async (c) => {
  const raw = await c.req.text();
  const r = await handleStripeWebhook(c.env, raw, c.req.header('stripe-signature') ?? null);
  return c.json({ received: r.status === 200, message: r.message }, r.status as 200);
});

// ---- development simulator (refuses to run in production) ----

billingRoutes.post('/api/billing/dev/complete', async (c) => {
  const user = requireUser(c);
  await devActivate(c.env, user.id);
  return c.json({ ok: true, simulated: true });
});

billingRoutes.post('/api/billing/dev/action', async (c) => {
  const user = requireUser(c);
  const b = await body(c, z.object({ action: z.enum(['cancel_at_period_end', 'resume', 'cancel_now', 'payment_failed', 'expire']) }));
  await devAction(c.env, user.id, b.action);
  return c.json({ ok: true, simulated: true });
});
