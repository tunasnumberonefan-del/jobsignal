# Reddit post concepts

Check each subreddit's rules first. Several ban self-promotion outright or only allow it in weekly threads. When in doubt, message the mods and ask. Post from an account with real history, reply to every comment, and never use alt accounts to upvote or comment.

---

## 1. r/recruitinghell: the frustration post

**Title:** I built a free thing that checks whether a job listing is actually still open

*(Swap the first paragraph for your own real experience if you have one. Only tell stories that happened.)*

**Body:**
A lot of listings stay up long after the role is filled, so before applying it's worth checking a few things by hand. Is it actually on the company's own job board? When was it first published (the real date, not the "2 days ago" an aggregator shows)? Has it been taken down and reposted?

Turns out most companies use Greenhouse, Lever, or Ashby, and those have public APIs that tell you exactly this. So I built a free tool that does it automatically, and also pulls state layoff notices and SEC filings for the company.

It won't tell you a job is "fake". Nobody outside the company can know that. It shows you what the records say and links to every source.

[link] if you want to try it. Two checks a day without an account. I'd genuinely like to hear where it gets things wrong.

---

## 2. r/jobs: the practical tip, tool second

**Title:** How to tell if a job posting is actually still open (takes 2 minutes)

**Body:**
A few things that have saved me a lot of wasted applications:

1. Click "Apply" on LinkedIn/Indeed and see where it goes. If it's `boards.greenhouse.io`, `jobs.lever.co`, `jobs.ashbyhq.com`, or `myworkdayjobs.com`, that's the company's real job board.
2. If that page says "job not found", the listing is dead, whatever LinkedIn says.
3. Ignore "updated" dates. Companies bump them constantly. You want the original publish date.
4. Same title, same city, reposted every few weeks? Ask the recruiter whether the role is being actively filled before you write a cover letter.
5. Search the company in your state's WARN notice list for recent layoffs.

I made a free tool that does all five from one link (and flags scam-style text), but you can do every step by hand too. [link]

---

## 3. r/layoffs: the data post

**Title:** I pulled every Texas and California WARN notice from the past year. A few things stood out.

**Body:** (Write this from your real data. Pull numbers from Admin → Overview and the `warn_notices` table. Don't round up, and say exactly what the data covers.)
- How many notices, how many people, which months were heaviest
- Which industries showed up most
- How many companies filing notices were also posting jobs at the same time (from JobSignal's own data. Say how you counted.)
- The caveat: WARN only covers larger layoffs, and states publish differently

At the end: "I built this into a free tool that shows a company's WARN notices when you check one of their job listings: [link]. Happy to answer questions about the data."

---

## 4. r/jobsearchhacks: the scam angle

**Title:** The job scam pattern I keep seeing (and the one sentence that gives it away)

**Body:**
Real listing copied word for word, real company name, but somewhere in the description or the first message: interview "via Telegram", or "we'll send you a check to buy your equipment".

Real employers don't interview over chat apps, and they never have you deposit a check and buy things. Lots of real listings even include a line like "our recruiters only email from @company.com". If the person contacting you isn't on that domain, it isn't them.

I built a free checker that flags these patterns and pulls out that "our recruiters only use @…" line when the listing has one: [link]. It's pattern matching, not magic, so trust your gut too.

---

## 5. r/SideProject: the build post (for feedback)

**Title:** JobSignal: checks a job posting + the company behind it before you apply. Built on Cloudflare's free tier, no AI

**Body:**
What it does: paste a job link → it reads the listing from the employer's applicant tracking system API (Greenhouse/Lever/Ashby), tracks reposts over time, checks the text for scam patterns, and pulls state WARN layoff notices and SEC 8-K filings for the company. Three separate answers instead of one fake-precise score.

Stack: Cloudflare Workers + D1, Hono, React. Rules-based scoring (versioned, fully explained on a methodology page), no LLM calls, so it costs $0 to run right now.

Hardest part: matching public records to the right company without pinning one company's layoffs on another with a similar name. It ended up very strict: exact cleaned-up names only.

Would love feedback, especially on reports that seem wrong: [link]
