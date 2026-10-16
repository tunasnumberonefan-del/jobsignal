# JobSignal

**Know before you apply.** Paste a job link and JobSignal checks whether the listing is live on the employer's own job board, how long it has really been up, whether it keeps getting reposted, whether the text asks for things scammers ask for, and what public layoff notices and SEC filings say about the company. Every finding links to its source.

It runs on Cloudflare's free tier, needs no paid APIs, and uses no AI model to decide anything. The scoring is a fixed, versioned rule set you can read in [docs/SCORING.md](docs/SCORING.md).

## What's in here

| | |
|---|---|
| `src/shared/` | Types, plan limits, name matching, and the **scoring engine** (pure functions, used by both sides) |
| `src/worker/` | Cloudflare Worker API (Hono): analysis pipeline, job-board adapters, SEC/WARN sources, auth, billing, monitoring, admin |
| `src/client/` | React app: landing page, reports, dashboard, saved jobs, comparisons, account, admin |
| `migrations/` | D1 (SQLite) schema |
| `tests/` | Unit + API integration tests (Vitest, runs the real Worker against an in-memory SQLite) |
| `e2e/` | Browser tests (Playwright + axe accessibility checks, desktop and mobile) |
| `docs/` | Architecture, scoring, data sources, limitations and roadmap |
| `marketing/` | Launch copy, post ideas, video scripts, outreach plan |

## Run it locally

You need Node 22 or newer.

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Open `.dev.vars` and put your own email in `ADMIN_EMAILS`, then:

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

Open http://localhost:5173. In development:

- **Sign-in emails** aren't sent. The sign-in page shows the link directly, and it's printed in the terminal.
- **Payments** are simulated. "Upgrade" goes to a clearly labeled fake checkout, and Account → Billing has buttons to simulate failed payments, cancellation, and expiry.
- **WARN data** starts empty. Sign in with your admin email, go to Admin → Sources & jobs, and press "Pull WARN notices now".

## Tests

```bash
npm test
```

```bash
npm run test:e2e
```

The e2e tests use the Microsoft Edge that ships with Windows. On Mac/Linux, install Chromium with `npx playwright install chromium` and run with `PW_CHANNEL=chromium`.

## Deploy

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for the step-by-step (Cloudflare, Resend, Stripe), and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) before taking real users or payments.

## More

- [PROJECT_STATUS.md](PROJECT_STATUS.md): what's done, tested, and not
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/SCORING.md](docs/SCORING.md)
- [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)
- [docs/LIMITATIONS_AND_ROADMAP.md](docs/LIMITATIONS_AND_ROADMAP.md)
- [COST_ANALYSIS.md](COST_ANALYSIS.md) and [GROWTH_PLAN.md](GROWTH_PLAN.md)
