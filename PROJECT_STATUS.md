# Project status

_Last updated: October 16, 2026_

**Summary:** The application is built, runs locally end to end against real public data, and passes 106 automated unit/API tests and 9 browser tests. It has **not been deployed**. Deploying and turning on real email and payments need your accounts (SETUP_GUIDE.md).

Legend: ✅ done and verified · 🟡 done, verified only against a simulation or fake · ⛔ blocked on you · ➖ deliberately not built

## Core product

| Area | Status | How it was verified |
|---|---|---|
| URL analysis: Greenhouse | ✅ | Live against real boards (Airbnb, Stripe) in the running app; API tests with fixtures |
| URL analysis: Lever, Ashby | ✅ | Adapters written against live API responses (checked with curl); URL-parsing unit tests. Not run end to end through the UI |
| Generic career pages (schema.org JobPosting) | ✅ | API tests incl. robots.txt Disallow respected, no-data → manual fallback |
| Aggregators (LinkedIn, Indeed, …) refused without fetching | ✅ | API test asserts zero outbound requests |
| Manual text entry, clearly labeled unverified | ✅ | API + browser tests |
| Scoring engine (3 separate verdicts, versioned rules) | ✅ | 24 unit tests incl. every edge case in the spec |
| Anti-fraud-notice handling (no false scam flags) | ✅ | Found live on a real Airbnb listing, fixed, regression-tested |
| Posting history (observations, versions, reposts, reopen) | ✅ | API tests; only real observations, no fabricated dates (tested) |
| Board scans building repost history | ✅ | Code path exercised in API tests (≤400-role boards) |
| Company entity resolution | ✅ | Unit tests for normalization/matching; API test: variants → one company, similar name not merged |
| WARN ingestion: Texas (Socrata) | ✅ | Live: 626 real notices ingested locally |
| WARN ingestion: California (xlsx) | ✅ | Live: 368 real notices ingested; parser unit test |
| SEC EDGAR (lookup, 8-K items, going concern, XBRL revenue) | ✅ | Live: Airbnb and PayPal matched with real filings; API tests incl. SEC outage |
| Employer timeline, financials, coverage panel | ✅ | Visual check in browser |
| Suggested questions + pre-apply checklist | ✅ | Unit tests + UI |
| Public company profile pages (indexable only with sourced records) | ✅ | API test + server-rendered meta test |

## Accounts and recurring value

| Area | Status | Notes |
|---|---|---|
| Email-link sign-in, sessions, sign-out | ✅ | API tests: single-use, expiry; browser tests |
| Sign-in email delivery (Resend) | 🟡 ⛔ | Code complete; in dev the link prints to console. Needs your Resend account to verify real delivery |
| Anonymous reports moved into new account | ✅ | API test |
| Dashboard, history (search, filter, pagination), saved jobs tracker | ✅ | Browser tests + visual check |
| Notes, deadlines, reminders, checklist on saved jobs | ✅ | API test for reminders firing once |
| Job monitoring (rechecks, close/reopen/edit alerts) | 🟡 | API tests drive the real cron handler with a faked job board. Real Cloudflare cron not yet run |
| Company watchlists + new-record alerts | 🟡 | Implemented; covered indirectly by monitoring tests |
| Notification center, email alerts, weekly digest | 🟡 | In-app verified; email paths need Resend |
| Posting change history with diff (Pro) | ✅ | UI built; line-diff utility |
| Comparison engine (weights, sort, save) | ✅ | Browser test reaches it as Pro |
| Exports: report JSON, saved-jobs CSV (formula-injection safe), print/PDF stylesheet | ✅ | Code + manual check |
| Data download + account deletion | ✅ | API test confirms personal rows deleted |

## Commercial

| Area | Status | Notes |
|---|---|---|
| Config-driven entitlements, server-enforced | ✅ | Unit + API tests (free limits, 402s, redaction) |
| Free tier: every warning always shown in full | ✅ | API test |
| Stripe Checkout, portal, webhooks (verify, idempotent), renewal/failure/cancel handling | 🟡 ⛔ | Webhook signature + idempotency + state changes tested with real HMAC signatures. Real Stripe calls need a Stripe account owned by an adult (18+) |
| Dev billing simulator (refused in production) | ✅ | API tests incl. expired/past-due/canceled states |
| `BILLING_MODE="off"` to launch before payments | ✅ | Implemented |

## Admin, security, quality

| Area | Status | Notes |
|---|---|---|
| Admin panel (users, billing, source health, cron runs, run tasks, flags, data corrections, feature flags, notices, feedback, audit log) | ✅ | Server-side role check tested (401/403/200); panel used in browser |
| SSRF protection, CSRF, rate limits, quotas, hashed IPs, CSP/HSTS | ✅ | 15 SSRF cases + CSRF test; CSP verified on production build with zero console errors |
| Production config guard | ✅ | API test: refuses to start in production with unsafe settings |
| Accessibility (WCAG 2 A/AA via axe) | ✅ | 0 serious/critical issues on 8 public pages, both themes, report + compare pages. Contrast issues found and fixed |
| Mobile layouts | ✅ | No horizontal overflow on 7 pages + report + dashboard (Pixel 7 emulation) |
| Reduced motion, keyboard focus, skip link | ✅ | CSS + skip link present; not exhaustively tested by keyboard |
| Production build + Worker bundle | ✅ | 117 KB gzipped (free limit 3 MB); `wrangler deploy --dry-run` OK |
| Deployment to Cloudflare | ⛔ | Needs your Cloudflare login (SETUP_GUIDE §1) |

## Extras I added beyond the spec

- The employer's **own anti-scam notice** is turned into a finding that tells you which email domains real recruiters use.
- **"Ask them" questions** generated from the findings, with copy-to-clipboard.
- **Pre-apply safety checklist**, saved to the job when saved, otherwise kept in the browser only.
- **Share card image** drawn in the browser (no image service needed), plus a server-rendered social preview image.
- **Billing simulator controls** (fail payment, expire, cancel) to test every subscription state locally.
- **Admin "run now" buttons** for every background job, and source-health stats.
- **Anonymous reports carry over** to a new account on sign-up.
- **Private report links never leak** the job title in link previews.
- **CSV export protected against spreadsheet formula injection.**
- Six SEO guides, FAQ, methodology page generated from the same numbers as the code.

## Decisions made along the way

- **No AI model**: rules only, for explainability and $0 running cost.
- **Passwordless sign-in** instead of an auth vendor or passwords: fewer moving parts, nothing to leak.
- **Texas + California first** for WARN, because both publish machine-readable official data.
- **SEC matching requires exact name + ticker.** It misses some subsidiaries, but never attaches the wrong company's filings.
- **Report pages are `noindex`** (but not blocked in robots.txt, so link previews still work). Company pages are indexed only when they hold sourced records.

## Known gaps

See [docs/LIMITATIONS_AND_ROADMAP.md](docs/LIMITATIONS_AND_ROADMAP.md). The main ones: monitoring throughput on the free plan (~60 rechecks/day), WARN coverage limited to 2 states, Workday-style sites need manual paste, and the Privacy Policy and Terms should get a qualified review before you charge money.
