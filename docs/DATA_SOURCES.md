# Data sources

Every source below is public and used through its intended interface. All were checked live in October 2026 while building this.

| Source | What we use | Access | Cost | Limits / terms we follow |
|---|---|---|---|---|
| **Greenhouse Job Board API** | `GET boards-api.greenhouse.io/v1/boards/{board}/jobs/{id}?pay_transparency=true`, and the board list | Public, no key | Free | Published for job boards to consume. Cached 30 min (job), 60 min (board). Gives `first_published` (used as the posting date) and `updated_at` (kept separately, never treated as a posting date). |
| **Lever Postings API** | `GET api.lever.co/v0/postings/{site}/{id}?mode=json`, board list, board page `<title>` for the company name | Public, no key (EU: `api.eu.lever.co`) | Free | `jobs.lever.co/robots.txt` allows all with crawl-delay 1. We make 1–3 requests per check and cache. `createdAt` used as the posting date. |
| **Ashby Posting API** | `GET api.ashbyhq.com/posting-api/job-board/{org}?includeCompensation=true` | Public, no key | Free | No single-job endpoint, so we read the board (cached 30 min). `publishedAt` used. |
| **Company career pages** | schema.org `JobPosting` JSON-LD | Public pages | Free | robots.txt checked first (our UA group, then `*`). One request, 2.5 MB cap, 9 s timeout. Aggregators (LinkedIn, Indeed, Glassdoor, ZipRecruiter, …) are never fetched. |
| **SEC EDGAR** | `efts.sec.gov/LATEST/search-index?keysTyped=` (company lookup), `data.sec.gov/submissions/CIK…json` (8-K items, latest 10-K/10-Q), full-text search for going-concern language, `data.sec.gov/api/xbrl/companyconcept/…` (revenue, net income) | Public, no key | Free | SEC asks for a descriptive User-Agent with contact email (`SEC_USER_AGENT`) and ≤10 req/s. We make ~5 per new company and cache 7 days (lookup), 12 h (submissions), 24 h (full-text), 3 days (XBRL). |
| **Texas WARN notices** | Socrata dataset `8w53-c4f6` on data.texas.gov | Public, no key | Free | Official Texas Workforce Commission data. Pulled at most daily, last 3 years. |
| **California WARN notices** | `edd.ca.gov/.../warn_report1.xlsx` ("Detailed WARN Report" sheet) | Public file | Free | Official EDD publication. Parsed with a small built-in .xlsx reader. Pulled at most daily. |
| Resend | Sending email | API key | Free to 3,000/mo | Only sign-in, alerts, reminders, digest |
| Stripe | Checkout, portal, webhooks | API keys | 2.9% + 30¢ per charge | No card data touches our servers |

## Provider adapter contract

Job sources implement `JobAdapter` (`src/worker/providers/types.ts`):

- `parse(url)`: no I/O. Return a `JobRef` if the adapter understands the URL.
- `fetch(env, ref)` → `AdapterResult` with a normalized `PostingEvidence`, a stable `canonicalKey`, the `atsBoard` (for entity resolution), and optionally `boardJobs`.
- Use `apiFetch` for fixed hosts. It logs every call to `provider_runs` (shown in Admin → Sources), caches in D1, and retries once on 429/5xx.
- Return `fetchOutcome: 'not_found'` for removed listings. Throw `UpstreamError` for outages (the user sees a clear message and isn't charged quota).

### Adding a job source (e.g. SmartRecruiters, Workable)
1. Create `providers/<name>.ts` implementing `JobAdapter`.
2. Add it to `ADAPTERS` in `providers/index.ts` (before the generic page reader).
3. Add the kind to `SourceKind` in `shared/types.ts` and a label in `ReportView.tsx` (`SOURCE_NAME`).
4. Add URL-parsing tests in `tests/normalize-and-urls.test.ts` and a fake upstream in `tests/helpers/upstream.ts`.

### Adding a WARN state
Each state is a `WarnSource` in `providers/warn/index.ts` returning `WarnRecord[]`:
1. Find the official publication and confirm it's machine-readable and allowed to be downloaded.
2. Write `fetch(env, sinceIso)` that maps the state's columns to `WarnRecord`. Build `sourceRecordId` from stable fields so re-ingesting never duplicates.
3. Add it to `WARN_SOURCES`. The ingest job, matching, and UI pick it up automatically.
4. Add a parser test with a small fixture.

Good next candidates: New York (dol.ny.gov), Washington (esd.wa.gov), Illinois, New Jersey, Oregon. Formats vary (HTML tables, PDFs, Excel), so check each before committing.

## What we deliberately don't use

- Scraped data from job boards or review sites that prohibit it.
- Paid data brokers or "layoff trackers" that repackage news with unclear licensing.
- Any personal data about employees or recruiters.
