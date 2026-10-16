# Architecture

One Cloudflare Worker serves both the React app (as static assets) and the JSON API. One D1 (SQLite) database holds everything. A cron trigger runs background work. That's the whole system, and it all fits in Cloudflare's free plan.

```
Browser ──► Worker (Hono)
             ├─ static assets (React, built by Vite)
             ├─ /api/*            JSON API
             ├─ /r/:slug, /companies/:slug, /sitemap.xml, /robots.txt   server-rendered meta for previews + SEO
             └─ scheduled()       cron: WARN ingest, job rechecks, company watches, reminders, digest, pruning
                    │
                    ├─ D1 (SQLite): users, jobs, observations, analyses, companies, events, …
                    └─ outbound fetch: Greenhouse · Lever · Ashby · career pages · SEC EDGAR · Texas & California WARN · Resend · Stripe
```

## Why this stack

- **Cloudflare Workers + D1**: free tier covers 100k requests/day and 5 GB of database with no cold starts and no server to maintain. Cron triggers are included.
- **Hono**: tiny router built for Workers, with typed context.
- **React + Vite + Tailwind v4**: fast builds, small bundles, and the Cloudflare Vite plugin runs the real Workers runtime locally.
- **No AI model**: the product promise is "explainable". Rules are deterministic and testable, and there's no per-request inference bill.
- **No auth vendor, no ORM**: sign-in is email links built on WebCrypto random tokens (hashed at rest) and HTTP-only session cookies. There are no passwords, so there's no password hashing to get wrong. SQL is plain and visible.

## Code layout

```
src/shared/           used by both Worker and browser
  types.ts            report + evidence shapes (stored as JSON, so add fields, don't rename)
  entitlements.ts     plan limits; the only place they're defined
  normalize.ts        company-name cleanup, matching, fingerprints
  scoring/            config.ts (weights, version) · text.ts (description checks) · rules.ts · engine.ts

src/worker/
  index.ts            app assembly + scheduled handler
  app.ts              middleware: request id/logging, errors, CSRF, identity (session, plan, anon id, IP hash)
  lib/                http (SSRF-safe fetch, robots.txt, cached API fetch) · html (untrusted HTML → text) · redact (plan-based trimming)
  providers/          one adapter per source: greenhouse, lever, ashby, jsonld (generic pages), sec, warn/*
  services/           analysis pipeline · companies (entity resolution, WARN/SEC) · jobs (observations, history) · auth · billing · usage · notifications · email · monitoring
  routes/             public · auth · me · billing · admin · seo

src/client/
  components/         ui primitives, layout, report pieces
  pages/              landing, check, report, company, pricing, auth, app/*, admin/*, content/*
```

## The analysis pipeline (`services/analysis.ts`)

1. **Validate** the URL (`lib/http.ts`): http(s) only, ports 80/443, no IP literals, no private/local hostnames, no credentials. Redirects are followed by hand and re-validated on every hop.
2. **Route** to an adapter (`providers/index.ts`). Greenhouse, Lever, and Ashby use their public JSON APIs. Anything else is read once for schema.org `JobPosting`, after checking robots.txt. Known aggregators (LinkedIn, Indeed, …) aren't fetched at all.
3. **Reuse**: if the same ATS job was analyzed in the last hour (same rules version), hand out the stored analysis. API responses are also cached in D1 (`fetch_cache`), so a popular listing costs one upstream request.
4. **Resolve the company** (`services/companies.ts`): same job board → same company; else same website domain; else same normalized name with no conflicting domain. Otherwise create a new company. Similar names are never merged.
5. **Record the observation** (`services/jobs.ts`): create or update the job, store a description version if the text changed, log the observation. When a whole job board is read, every listing on it is recorded (up to 400), which is how repost history builds up. Listings that vanish from a board are marked closed.
6. **Employer evidence**: match ingested WARN notices by name, look up SEC (exact name + ticker only), read 8-K items, search for going-concern language, pull XBRL revenue and net income. Each check reports whether it ran, so "nothing found" and "didn't check" stay different.
7. **Score** with the pure engine (`shared/scoring/engine.ts`) → `Report`.
8. **Store** the analysis (full report JSON + findings rows) once, and create a per-person `reports` row with an unguessable slug. Sharing flips `is_public` on that row only.

## Data model highlights

See `migrations/0001_init.sql` for the full schema with comments.

- `jobs` + `job_observations` + `job_versions`: everything we know about a listing over time, only from real observations. `published_at` is only set from a source-stated date; `source_updated_at` is kept separately and never used as a creation date.
- `companies` + `company_aliases` (kinds: name, domain, ats_board) + `company_events` (WARN, SEC events, each with source, reliability, match quality, and an admin-only `hidden_at` for corrections).
- `analyses` (shared, non-personal) vs `reports` (who ran it, public or not). Deleting an account deletes reports, not analyses.
- `subscriptions` is the only source of entitlements and is written only by the Stripe webhook (or the dev simulator).
- Ops tables: `provider_runs` (source health), `job_runs` (cron), `fetch_cache`, `rate_limits`, `usage_records`, `feature_flags`, `announcements`, `admin_audit_logs`, `flags` (corrections queue), `feedback`.

## Security

| Concern | How it's handled |
|---|---|
| SSRF | `validatePublicUrl` + manual redirect handling, every hop re-validated; 2.5 MB body cap; 9 s timeout |
| Untrusted HTML | Never rendered. Converted to plain text server-side (`htmlToText`) and rendered as text by React |
| CSRF | Mutating `/api/*` requests need a matching `Origin` (or same-origin fetch metadata) and a JSON content type. SameSite=Lax cookies |
| Sessions | 256-bit random tokens, only SHA-256 hashes stored, HttpOnly + Secure + SameSite=Lax, 30-day sliding expiry |
| Sign-in links | Single use (atomic `UPDATE … RETURNING`), 20-minute expiry, token in the URL fragment so it isn't logged, POSTed by the page so mail scanners can't consume it |
| Authorization | Every personal query is scoped by `user_id`; other users' rows return 404. Admin checked server-side on every admin route |
| Plan limits | Enforced server-side in routes and in `viewReport` redaction. The browser only displays them |
| Payments | Stripe signature verified (HMAC-SHA256, 5-minute tolerance, constant-time compare); events idempotent by id |
| Abuse | Daily quotas by account or hashed IP, per-minute burst limit, optional Turnstile for visitors, login rate limits by email and IP |
| Privacy | IPs are stored only as salted hashes; no resumes; public reports never include owner info; private report previews don't leak titles |
| Headers | CSP, HSTS, frame-deny, nosniff, referrer and permissions policies (`public/_headers` for assets, `PAGE_HEADERS` for Worker-rendered pages) |
| Config mistakes | `assertConfig` refuses to serve in production with the dev billing simulator, console email, http URL, or a placeholder SEC contact |

## Background work (`services/monitoring.ts`)

Every 6 hours: WARN ingest (at most daily) → watched-company checks (SEC refresh for 3 per run, WARN matching from the DB) → watched-job rechecks (15 per run, oldest first, Pro watchers only) → due reminders → pruning. Mondays: weekly digests. Each task is logged in `job_runs`, and admins can trigger any of them by hand.

The free plan allows 50 outbound requests per invocation, which is why the batches are small. See [COST_ANALYSIS.md](../COST_ANALYSIS.md) for when to upgrade.
