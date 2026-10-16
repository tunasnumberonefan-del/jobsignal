# Cost analysis

## Today: $0/month

| Service | Free allowance | What uses it |
|---|---|---|
| Cloudflare Workers (free) | 100,000 requests/day · 10 ms CPU per request · 50 outbound requests per invocation · cron triggers | Every page view that hits the API, every analysis, the cron |
| Cloudflare static assets | Unlimited requests, free | The React app |
| Cloudflare D1 (free) | 5 GB storage · 5M rows read/day · 100k rows written/day | Everything |
| Resend (free) | 3,000 emails/month, 100/day | Sign-in links, alerts, digests |
| Stripe | No monthly fee. 2.9% + 30¢ per successful charge | Pro subscriptions |
| SEC EDGAR, state WARN data, Greenhouse/Lever/Ashby | Free public data | Analyses |

Optional: a domain (~$10/year).

## What one analysis costs

| Resource | Typical | Notes |
|---|---|---|
| Outbound requests | 2 (job + board) + ~5 SEC (first time per company, then cached) | Repeat checks of the same job within an hour cost 0 |
| D1 writes | ~15 to 40 | Observation, version, analysis, findings, report, provider logs, cache. Board scans add up to 400 the first time a board is seen (then at most once every 20 hours) |
| D1 reads | ~30 to 80 | |
| CPU | ~5 to 20 ms | JSON parsing dominates. Big SEC submissions files are the heaviest part |

## Where the free tier runs out

1. **Writes (100k/day)** are the first real limit. At ~40 writes per analysis plus board scans, plan on roughly **1,500 to 2,500 analyses per day**. That's a good problem.
2. **CPU (10 ms per request on free)**. Cloudflare's free plan measures CPU time, not wall time, so waiting on Greenhouse or the SEC costs nothing, but parsing a large SEC submissions file can go over on a cold cache. If you see "exceeded CPU" errors in `wrangler tail`, the $5 plan (30 s CPU) removes this entirely.
3. **Monitoring throughput**: 50 outbound requests per cron run limits rechecks to ~60/day. Fine for the first ~30 Pro users who each watch a few jobs.
4. **Email (100/day)**: sign-ins plus alerts. Around 100 daily active users signing in every day, you'll hit it.

## When to upgrade, and what it costs

| Trigger | Upgrade | Cost |
|---|---|---|
| ~20 paying users, or monitoring lag, or CPU errors | Cloudflare Workers Paid | $5/mo: 10M requests, 30 s CPU, 1,000 subrequests/invocation, 50M D1 writes/month. Raise `RECHECK_BATCH` in `monitoring.ts` to ~150 |
| ~100 daily sign-ins or alert emails | Resend Pro | $20/mo for 50,000 emails |
| Lots of anonymous abuse | Turnstile | Free |

## Break-even

At $7.99/mo, Stripe takes about $0.53, so you net ~$7.46 per subscriber.

- **1 subscriber** covers the $5 Workers plan.
- **4 subscribers** cover Workers plus Resend Pro.
- Everything after that is margin, until you're doing tens of thousands of analyses a day.
