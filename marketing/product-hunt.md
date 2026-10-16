# Product Hunt

**Name:** JobSignal

**Tagline (60 chars max):** Check a job posting and the company before you apply

**Description (260 chars max):**
Paste a job link. JobSignal checks if it's live on the employer's own job board, how long it's really been up, whether it keeps getting reposted, and what layoff notices and SEC filings say about the company. Every finding links to its source.

**Topics:** Productivity, Hiring, Career, Tech

**First comment (from the maker):**
Hi PH! JobSignal exists because a lot of job listings online aren't what they look like: some were filled months ago, some are reposted on a loop, and some are scams wearing a real company's name. *(If you have a real story about why you built this, put it here instead. Don't invent one.)*

The idea is simple: most companies post jobs through Greenhouse, Lever, or Ashby, and those systems publish every live listing through a public API. State labor departments publish layoff (WARN) notices. Public companies file with the SEC. All of it is public, but nobody checks it for every application. JobSignal does it from one link.

A few decisions I made on purpose:
- No single "trust score". You get three separate answers (the posting, the employer, and how much evidence there was), because squashing them into one number hides uncertainty.
- No AI deciding things. It's a versioned rule set, and the methodology page shows every weight.
- It never calls a listing a "ghost job" or a company a scam. It shows what the records say and suggests what to ask the recruiter.

Free: 3 checks a day with an account. Pro ($7.99/mo) watches jobs and companies for you and alerts you when a listing closes, reopens, or a new layoff notice shows up.

I'd love to hear where it gets things wrong. There's a "Something wrong?" link on every report and I read all of them.

**Gallery ideas:** 1) the landing hero, 2) a full report with all three stamps, 3) a company timeline with a WARN notice, 4) the comparison view, 5) the methodology table.
