# Known limitations and roadmap

## Limitations (honest list)

**Coverage**
- Direct reading works for Greenhouse, Lever, and Ashby, plus pages with schema.org JobPosting data. Workday, iCIMS, Taleo, SuccessFactors and similar mostly don't expose a public API, and many block bots, so those listings usually need the paste-the-text path.
- WARN data covers **Texas and California** only. No WARN notices found elsewhere means "not checked", and the UI says which states were checked.
- SEC data only exists for public companies, and we only match on an exact normalized name with a ticker. Subsidiaries hiring under a different name won't match the parent.
- No news coverage, funding rounds, or hiring-freeze announcements. Those would need a licensed news source.

**History**
- Repost and reopen detection only knows what JobSignal has seen. A brand-new install has no history, and it builds up as people use the product (and as whole boards get recorded during checks).
- Board scans skip boards with more than 400 open roles, to protect the free-tier write budget.

**Monitoring on the free Cloudflare plan**
- 15 job rechecks per cron run × 4 runs/day = **about 60 rechecks/day across all users**. Each watched job is rechecked at most every 12 hours, oldest first. With more than ~30 actively watched jobs, rechecks start lagging. The fix is the $5/mo Workers plan (see COST_ANALYSIS.md).
- Monitoring is honest: if a source can't be read, the job isn't marked closed, and no alert is created.

**Text checks**
- Pattern-based, English only. They catch common scam phrasing but can miss creative wording, and occasionally flag legitimate text. The fraud-notice negation handling cuts the biggest source of false positives.

**Dev environment**
- On Windows, the local Workers proxy (miniflare under Vite) occasionally returns "fetch failed" for one request under parallel load. It's a dev-tooling issue, not app logic (the Worker never logs an error for it), and the client retries. It doesn't affect deployed Workers.

**Not yet verified in production**
- Real Stripe payments, real Resend delivery, and real cron execution on Cloudflare haven't run, because they need your accounts. All three are implemented and tested against simulated or faked counterparts. See PROJECT_STATUS.md.

## Roadmap

### Next (high value, low cost)
1. **More WARN states**: New York, Washington, Illinois, New Jersey, Oregon.
2. **SmartRecruiters and Workable adapters**: both have public posting APIs.
3. **Browser extension**: a "Check this job" button on job pages. It only sends the URL to JobSignal, so no scraping happens in the extension.
4. **Annual plan** ($59/yr) and **one-time credit packs** for people who don't want a subscription. Entitlements are already config-driven.
5. **Email-forward check**: forward a recruiter email to a JobSignal address and get the domain and scam-pattern checks back.

### Later
- Workday public career-site JSON (where allowed), with per-tenant robots.txt checks.
- Career-coach accounts (shared watchlists for clients). Wait until there's demand.
- More languages for the text checks.
- Duplicate detection across sources (same posting on Greenhouse and a company page) using `textSimilarity`, which already exists in `normalize.ts`.
- A durable queue (Cloudflare Queues) for monitoring, once on the paid plan.
