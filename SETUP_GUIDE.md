# Setup guide

Everything here is a step only you can do, because it needs your accounts. It's written for someone doing it the first time. Total cost to get online: **$0**. A custom domain is optional (about $10/year).

> **Important about payments.** Stripe, and every other payment company, requires the account holder to be a legal adult (18+) who can enter a contract, with real identity and bank details. If that isn't you, a parent or guardian has to open the Stripe account in their name and own it. Don't work around this. Until a payment account exists, JobSignal runs fine with billing switched off: everyone gets the free plan.

---

## 1. Cloudflare (hosting, database, scheduled jobs)

1. Create a free account at https://dash.cloudflare.com/sign-up.
2. In this project folder, log the CLI in:
   ```bash
   npx wrangler login
   ```
3. Create the database:
   ```bash
   npx wrangler d1 create jobsignal
   ```
   It prints a `database_id`. Paste it into `wrangler.jsonc`, replacing `00000000-0000-0000-0000-000000000000`.
4. Create the tables:
   ```bash
   npm run db:migrate:remote
   ```
5. Set production settings in `wrangler.jsonc` under `"vars"`:
   - `APP_ENV`: `"production"`
   - `APP_URL`: your site's address, e.g. `"https://jobsignal.yourname.workers.dev"` (you'll know it after the first deploy) or your own domain
   - `BILLING_MODE`: `"off"` to start, `"stripe"` once Stripe is set up. The app refuses to start in production with `"dev"` (the simulator), on purpose.
   - `EMAIL_MODE`: `"resend"`
   - `SEC_USER_AGENT`: `"JobSignal yourreal@email.com"`. The SEC requires a real contact in the User-Agent.
   - `EMAIL_FROM`: e.g. `"JobSignal <hello@yourdomain.com>"` (must be a domain you verify in Resend)
6. Set secrets (each command asks you to paste the value):
   ```bash
   npx wrangler secret put SESSION_PEPPER
   ```
   Use a long random string. Generate one with `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`.
   ```bash
   npx wrangler secret put ADMIN_EMAILS
   ```
   Your email. Comma-separate if there's more than one admin.
7. Deploy:
   ```bash
   npm run deploy
   ```
   The cron schedule in `wrangler.jsonc` (every 6 hours, plus Mondays for the digest) is set up automatically.
8. Sign in with your admin email, open **Admin → Sources & jobs**, and press **Pull WARN notices now** once. After that the cron keeps it fresh.

### Launching without payments
You can go live before Stripe exists. Set `BILLING_MODE` to `"off"`. Everyone gets the free plan, the pricing page shows Pro as "Coming soon", and nothing else changes. Switch to `"stripe"` once section 3 is done.

## 2. Resend (sign-in and alert emails)

Free plan: 3,000 emails/month, 100/day.

1. Sign up at https://resend.com.
2. Add and verify a domain you own (Resend shows DNS records to add; if your domain is on Cloudflare this takes a few minutes). Without your own domain you can only send to your own address, which isn't enough for real users.
3. Create an API key, then:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

## 3. Stripe (payments), when you're ready

1. Have the adult account owner sign up at https://dashboard.stripe.com/register and complete activation (identity, bank account).
2. **Products → Add product**: "JobSignal Pro", recurring, monthly, $7.99. Copy the **price ID** (`price_...`).
3. **Developers → API keys**: copy the **secret key** (`sk_live_...`; use `sk_test_...` first to test).
4. **Developers → Webhooks → Add endpoint**:
   - URL: `https://YOUR_APP_URL/api/billing/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
   - Copy the **signing secret** (`whsec_...`).
5. **Settings → Billing → Customer portal**: turn it on, allow cancellation and card updates.
6. Set the secrets:
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY
   ```
   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```
   ```bash
   npx wrangler secret put STRIPE_PRICE_PRO_MONTHLY
   ```
7. Set `BILLING_MODE` to `"stripe"` and deploy again.
8. Test with a test-mode key and card `4242 4242 4242 4242` before switching to live keys.

## 4. Optional: bot protection (Cloudflare Turnstile)

Free. Stops scripts from burning anonymous checks.

1. Cloudflare dashboard → Turnstile → Add site → copy the site key and secret key.
2. Add `"TURNSTILE_SITE_KEY": "..."` to `vars` in `wrangler.jsonc` (it's public), then:
   ```bash
   npx wrangler secret put TURNSTILE_SECRET_KEY
   ```

## 5. Optional: your own domain

Cloudflare dashboard → Workers & Pages → jobsignal → Settings → Domains & Routes → Add custom domain. Then update `APP_URL`, the Stripe webhook URL, and redeploy.

---

## Local development reference

| File | What it's for |
|---|---|
| `.dev.vars` | Local secrets (never commit). Copy from `.dev.vars.example`. |
| `wrangler.jsonc` | Worker config, D1 binding, cron, non-secret vars |

Useful commands:

```bash
npm run dev
```
```bash
npm test
```
```bash
npm run test:e2e
```
```bash
npm run build
```
```bash
npx wrangler tail
```
(`wrangler tail` streams live production logs.)
