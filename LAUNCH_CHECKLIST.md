# Launch checklist

Work through this before taking real users, and the payments section before taking real money.

## Before real users

- [ ] Cloudflare account, D1 database created, `database_id` set in `wrangler.jsonc` (SETUP_GUIDE §1)
- [ ] `npm run db:migrate:remote` run
- [ ] `APP_ENV="production"`, `APP_URL` set to the real https address
- [ ] `SEC_USER_AGENT` contains a real contact email you check
- [ ] Secrets set: `SESSION_PEPPER` (long random), `ADMIN_EMAILS`
- [ ] Resend domain verified, `RESEND_API_KEY` set, `EMAIL_MODE="resend"`, `EMAIL_FROM` uses that domain
- [ ] `BILLING_MODE="off"` (until payments are ready) or `"stripe"`
- [ ] `npm test` and `npm run test:e2e` pass
- [ ] `npm run deploy`
- [ ] Open the live site: sign in with your admin email and receive the real email
- [ ] Admin → Sources & jobs → **Pull WARN notices now**. Texas and California should show rows
- [ ] Run checks on 3 to 5 real listings (Greenhouse, Lever, Ashby, a company careers page, pasted text). Read each report closely. Anything wrong or misleading?
- [ ] Share a report and paste the link into a chat app: the preview should show the job title and image
- [ ] Next day: Admin → Sources & jobs shows cron runs (`warn_ingest`, `job_recheck`, `prune`) succeeding
- [ ] Look at the site on your phone
- [ ] Decide who reads the corrections queue (Admin → Flagged) and how often. Weekly at minimum

## Legal and trust

- [ ] Read the Privacy Policy and Terms (`/privacy`, `/terms`) and make sure they match how you actually run things. They describe the product accurately as built, but they're not written by a lawyer. Have someone qualified look at them before you charge money, especially if you operate outside the US.
- [ ] Add the legal name (yours or your business's) and a contact method to both pages once you have them
- [ ] Never post screenshots of reports that make claims about a real company in your marketing. Use the fictional example, or reports about listings you've checked with the "live on their job board" result
- [ ] Keep the disclaimers on reports. They're part of what makes this defensible

## Before real payments

- [ ] Stripe account owned by an adult (18+) legally able to contract, fully activated (SETUP_GUIDE §3)
- [ ] Product + monthly price created; `STRIPE_PRICE_PRO_MONTHLY` set
- [ ] Webhook endpoint added with the 5 events; `STRIPE_WEBHOOK_SECRET` set
- [ ] Customer portal turned on (cancel + update card)
- [ ] **Test mode first**: subscribe with `4242 4242 4242 4242`, check Account → Billing shows Pro, Admin → Billing shows the webhook events as processed
- [ ] Test-mode cancel from the portal → plan drops to Free at period end
- [ ] Test a failed renewal (Stripe test clock or card `4000 0000 0000 0341`) → in-app "payment didn't go through" notice
- [ ] Switch to live keys, `BILLING_MODE="stripe"`, deploy
- [ ] Do one real $7.99 purchase yourself and refund it from Stripe
- [ ] Taxes: Stripe Tax or your own approach. Talk to someone if unsure. Many places tax digital subscriptions

## After launch, weekly

- [ ] Admin → Overview: analyses/day, helpful %, open flags
- [ ] Admin → Flagged: resolve corrections
- [ ] Admin → Sources & jobs: any provider below ~90% OK?
- [ ] Admin → Feedback: read the "not really" comments. They're the roadmap
