# Growth plan ($0 budget)

The product does the marketing if you let it: every shared report is an ad that's actually useful to the person reading it. The job is to get the first few hundred people to run a check, and make sharing easy and worth doing.

## Who to reach first

People already angry about ghost jobs and job scams, in places they already gather:

1. **Reddit**: r/recruitinghell, r/jobs, r/jobsearchhacks, r/careerguidance, r/layoffs, r/resumes, r/cscareerquestions (strict self-promo rules), r/SideProject and r/InternetIsBeautiful (for the launch itself).
2. **Short video** (TikTok, YouTube Shorts, Instagram Reels): "checking if this job is real" is a format people already watch.
3. **LinkedIn**: recently laid-off people post daily. Comment helpfully, don't pitch.
4. **Career coaches, university career centers, and laid-off community organizers**: one coach who likes it brings dozens of clients.
5. **Search**: the six guides target questions people actually type ("is this job posting real", "how to check if a company had layoffs").

## Rules for yourself

- **Follow every community's self-promotion rules.** Read the sidebar. When in doubt, message the mods first. Getting banned from r/recruitinghell would hurt.
- **Lead with something useful, not the link.** "I pulled every Texas WARN notice from the last year, here's what surprised me" beats "I made an app".
- **Never claim accuracy numbers** you can't back up. Never post a report that implies a named real company is running a scam.
- **Never fake reviews, testimonials, or user counts.** Not even "1,000+ users" until it's true.
- **Answer every comment**, including the hostile ones. That's where you learn what's broken.

## Week by week (first month)

### Week 1: soft launch
- Deploy with `BILLING_MODE="off"`. Everything is free while you find the rough edges.
- Run 30+ real listings yourself and fix whatever looks wrong.
- Show 5 to 10 people who are job hunting right now (friends, a Discord, a class). Watch them use it without helping. Write down where they hesitate.
- Post on r/SideProject asking for feedback (marketing/reddit-posts.md, post 5).

### Week 2: the data post
- Write one genuinely interesting post from the WARN data you already have: which industries filed the most notices in Texas and California this year, how many companies were hiring and filing at the same time. Post to r/layoffs or r/dataisbeautiful (with a chart), link JobSignal only where allowed.
- Start the short-video series (marketing/video-scripts.md). One a day for two weeks. Same format, different listing.

### Week 3: the useful-tool post
- r/recruitinghell / r/jobs: "I built a free tool that checks whether a job posting is still live on the company's own job board" (post 1 or 2), following each sub's rules.
- Reach out to 10 career coaches and 5 university career centers (marketing/outreach.md). Offer to walk them through it. Ask what would make it useful for their clients.

### Week 4: Product Hunt + Pro
- Turn on Stripe (`BILLING_MODE="stripe"`) once people are coming back on their own (check Admin → Overview for repeat users).
- Launch on Product Hunt on a Tuesday-to-Thursday (marketing/product-hunt.md).
- Email or message everyone who gave feedback: thank them, show what you changed.

## Built-in growth features (already in the product)

- **Shareable report pages** with Open Graph previews (`/r/:slug`) and a "Download image" share card.
- **"Someone shared this report with you"** banner with a link to run your own check.
- **Company profile pages** (`/companies/:slug`), indexed when they contain real sourced records, so people searching "[company] layoffs" can find them.
- **Six guides** written for search (see the sitemap).
- **The free plan is genuinely useful**, so people recommend it without feeling like they're pushing a paywall.

## What to measure (Admin → Overview)

| Metric | Why | Rough first-month goal |
|---|---|---|
| Analyses per day | Is anyone using it? | 50+ |
| Helpful % (report feedback) | Is it actually useful? | 70%+ |
| Accounts created | Do people want to come back? | 200 |
| Shared reports | Is the loop working? | 1 in 10 reports |
| Open correction flags | Are we getting things wrong? | Resolve all weekly |
| Pro conversions | Will people pay? | First 5 to 10 |

If helpful % is low, stop promoting and fix the reports first. Promotion only amplifies what's already there.
