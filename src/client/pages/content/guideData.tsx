import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Guide {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  body: ReactNode;
}

export const GUIDES: Guide[] = [
  {
    slug: 'what-is-a-ghost-job',
    title: 'What is a ghost job?',
    summary: "Listings that are up, but nobody's really hiring. Why they exist and how to spot the likely ones.",
    minutes: 4,
    body: (
      <>
        <p>
          A ghost job is a listing for a role the company isn't actively trying to fill. It might have been filled weeks ago and never taken down. It might be on hold because the budget froze. Or it might be up on purpose: to collect resumes for later, to look like the company is growing, or because someone has to post it even though an internal candidate already has the job.
        </p>
        <p>
          None of that is necessarily sinister. Big companies have hundreds of open requisitions, and taking one down is somebody's chore. But from the outside, a ghost job looks exactly like a real one, and applying costs you the same hour either way.
        </p>
        <h2>Signs a listing might not be live</h2>
        <ul>
          <li><strong>It's been up a long time.</strong> Most roles fill within one to three months. A listing that's four or five months old isn't automatically dead, but it's worth asking.</li>
          <li><strong>It keeps coming back.</strong> The same title in the same city, taken down and reposted every few weeks. Sometimes that means high turnover. Sometimes it means the listing is permanent.</li>
          <li><strong>It talks about the future.</strong> "Join our talent community", "for future opportunities", "this is not an active opening". Those are honest about being a pipeline. Believe them.</li>
          <li><strong>It isn't on the company's own site.</strong> If you can only find it on an aggregator, and the company's careers page doesn't list it, it may be a stale copy.</li>
          <li><strong>The company is cutting elsewhere.</strong> Hiring for one team while filing layoff notices for another happens all the time. It's not proof of anything, but it's useful context.</li>
        </ul>
        <h2>What you can actually do</h2>
        <p>
          Check the listing on the employer's own applicant tracking system. If it's live there, it's at least published by the company right now. Then ask early: "Is this role actively being filled, and where are you in the process?" A recruiter with a real opening will usually give you a straight answer.
        </p>
        <p>
          JobSignal does the first part for you. Paste a Greenhouse, Lever, or Ashby link and we'll tell you if it's live, when it was first published, and whether we've seen it reposted. <Link to="/check">Try it on a listing</Link>.
        </p>
      </>
    ),
  },
  {
    slug: 'how-to-spot-a-fake-job-posting',
    title: 'How to spot a fake job posting',
    summary: 'The handful of things real employers almost never do, and the scams that rely on you not noticing.',
    minutes: 5,
    body: (
      <>
        <p>
          Fake job postings are a different problem from ghost jobs. A ghost job wastes your time. A fake one is trying to take something: money, your identity, or your bank account. They often copy a real company's listing word for word, so "it looks professional" isn't much of a test.
        </p>
        <h2>The red flags that matter most</h2>
        <ul>
          <li><strong>They ask for money.</strong> A fee for training, a background check, a starter kit, or equipment you buy and get "reimbursed" for. Real employers don't charge you to work for them.</li>
          <li><strong>They send you a check.</strong> The classic: they mail a check, you deposit it, buy equipment from "their vendor", and the check bounces a week later. You're out the money.</li>
          <li><strong>They want your SSN or bank details to apply.</strong> You'll give those to a real employer eventually, through their HR system, after a written offer. Not in an application form or a chat.</li>
          <li><strong>The interview is a chat.</strong> Telegram, WhatsApp, Signal, or a "text-based interview" with no video and no call. This is one of the most common patterns in job scams right now.</li>
          <li><strong>The email doesn't match.</strong> A recruiter for a big company writing from a Gmail address, or from a domain that's one letter off from the real one.</li>
          <li><strong>The offer comes fast.</strong> Hired after one chat, with no interview with anyone on the team. Real hiring is slow, sometimes painfully so.</li>
        </ul>
        <h2>How to check a listing</h2>
        <ol>
          <li>Find the job on the company's real careers page. Get there by typing the company's domain yourself, not by clicking a link in a message.</li>
          <li>Look at where the apply button goes. It should be the company's own site or a known applicant tracking system (Greenhouse, Lever, Workday, iCIMS, and so on).</li>
          <li>Many real listings include a fraud notice listing the email domains their recruiters use. If someone contacts you from anywhere else, it isn't them.</li>
          <li>If you've already shared information, the FTC's IdentityTheft.gov site walks you through what to do next.</li>
        </ol>
        <p>
          JobSignal checks the text of every listing for these patterns, and tells you when a listing includes the employer's own scam warning. <Link to="/check">Check one now</Link>.
        </p>
      </>
    ),
  },
  {
    slug: 'check-if-a-job-posting-is-still-active',
    title: 'How to check if a job posting is still active',
    summary: "The dates on job sites aren't always what they look like. Here's how to find the real ones.",
    minutes: 4,
    body: (
      <>
        <p>
          "Posted 2 days ago" on an aggregator often means "we scraped it 2 days ago." The listing might have been up at the company for months. So the first step is getting to the source.
        </p>
        <h2>Go to the source</h2>
        <p>
          Most companies post jobs through an applicant tracking system. You can usually tell from the apply link: <code>boards.greenhouse.io</code>, <code>jobs.lever.co</code>, <code>jobs.ashbyhq.com</code>, <code>myworkdayjobs.com</code>, and so on. If the job is on the company's board, it's published right now. If the link gives a "job not found" page, it's been taken down, whatever the aggregator says.
        </p>
        <h2>Read the dates carefully</h2>
        <ul>
          <li><strong>Publish date</strong> is when the listing first went up. This is the one you want.</li>
          <li><strong>Updated date</strong> is when someone last edited it. Companies bump this for all sorts of reasons, including tiny edits and system migrations. It doesn't tell you how old the job is.</li>
          <li><strong>"Valid through"</strong> dates, when a page has them, say when applications close. If that date has passed and the job is still up, someone forgot to take it down.</li>
        </ul>
        <h2>Watch it for a while</h2>
        <p>
          The most reliable sign of a live search is change: the listing gets edited, or it closes. A listing that's been word-for-word identical for five months is telling you something.
        </p>
        <p>
          JobSignal reads the publish date directly from the job board when it has one, and never treats an update date as a posting date. Pro accounts can watch a listing and get an alert when it closes, comes back, or changes. <Link to="/pricing">More on Pro</Link>.
        </p>
      </>
    ),
  },
  {
    slug: 'how-to-research-company-layoffs',
    title: "How to research a company's layoffs",
    summary: "WARN notices, SEC filings, and what each one can and can't tell you.",
    minutes: 6,
    body: (
      <>
        <p>
          Before you take a job, it's fair to want to know whether the company has been cutting people. News coverage is patchy and mostly covers big tech. The better sources are official, and they're public.
        </p>
        <h2>WARN notices</h2>
        <p>
          The federal Worker Adjustment and Retraining Notification (WARN) Act generally requires employers with 100 or more employees to give 60 days' notice before a plant closing or mass layoff at a site. Those notices go to the state, and most states publish them. Some states, like California and New York, have their own stricter versions that apply at smaller numbers.
        </p>
        <p>
          What a WARN notice tells you: the employer, the site, the number of people affected, and the dates. What it doesn't tell you: which teams, or anything about layoffs too small to trigger the law. A company with no WARN notices hasn't necessarily had no layoffs.
        </p>
        <p>
          You can search each state's list directly. Texas publishes a dataset on data.texas.gov. California's Employment Development Department posts a spreadsheet that updates regularly. Other states vary a lot in format.
        </p>
        <h2>SEC filings (public companies only)</h2>
        <p>Public companies have to report material events in an 8-K filing, usually within four business days. A few item numbers are worth knowing:</p>
        <ul>
          <li><strong>Item 2.05</strong>: costs associated with exit or disposal activities. This is how restructurings and layoffs usually show up.</li>
          <li><strong>Item 2.06</strong>: material impairments, meaning something was worth a lot less than they thought.</li>
          <li><strong>Item 1.03</strong>: bankruptcy or receivership.</li>
        </ul>
        <p>
          Annual (10-K) and quarterly (10-Q) reports can also include a <strong>going-concern</strong> warning: language saying there's "substantial doubt" the company can keep operating for the next year. That's the most serious financial flag a public company can raise about itself.
        </p>
        <p>All of this is free on SEC EDGAR. The full-text search tool is especially handy.</p>
        <h2>Putting it together</h2>
        <p>
          One layoff notice for a warehouse in another state probably says little about an engineering role at headquarters. A going-concern warning says a lot about everyone. Read the records for context, then ask the recruiter directly. "Was this team affected by the recent restructuring?" is a completely normal interview question.
        </p>
        <p>JobSignal pulls all of this automatically for every job you check and links to each original record. <Link to="/check">See it on a real listing</Link>.</p>
      </>
    ),
  },
  {
    slug: 'how-to-verify-an-employer',
    title: 'How to verify an employer is real',
    summary: 'Ten minutes of checking that protects you from impersonation scams.',
    minutes: 4,
    body: (
      <>
        <p>
          Most job scams don't invent a company. They borrow a real one. So "is this company real?" is usually the wrong question. The right one is "am I actually talking to them?"
        </p>
        <h2>A quick checklist</h2>
        <ol>
          <li><strong>Find the company's website yourself.</strong> Search for it, or type the domain. Don't trust a link someone sent you.</li>
          <li><strong>Find the job on that website.</strong> Real jobs are on the real careers page. If it isn't there, ask the recruiter why.</li>
          <li><strong>Match the email domain.</strong> Recruiters should be writing from the company's domain, or a known recruiting firm's. Look closely: <code>acme-careers.com</code> is not <code>acme.com</code>.</li>
          <li><strong>Look the recruiter up.</strong> A real recruiter usually has a professional profile that's more than a few weeks old and lists the company.</li>
          <li><strong>Insist on a real interview.</strong> A video or phone call with a person, ideally including someone from the team you'd join.</li>
          <li><strong>Get the offer in writing</strong> before giving your SSN, bank details, or ID, and give them through an official HR or payroll system.</li>
        </ol>
        <h2>For staffing agencies</h2>
        <p>
          Agencies are legitimate and often useful, but you should know who the actual employer is and who'll be paying you. It's fine to ask: "Who is the client, and will I be on your payroll or theirs?"
        </p>
        <p>
          JobSignal checks whether a listing is live on the employer's own job board and flags apply links that go somewhere unrelated. <Link to="/check">Check a listing</Link>.
        </p>
      </>
    ),
  },
  {
    slug: 'how-to-evaluate-a-job-offer',
    title: 'How to evaluate a job opportunity before you apply',
    summary: 'A short, practical way to decide where your applications are best spent.',
    minutes: 5,
    body: (
      <>
        <p>
          When you're applying to a lot of places, the scarce thing isn't openings, it's your energy. A careful application takes an hour or more. It's worth spending five minutes first to decide whether a listing deserves that hour.
        </p>
        <h2>Is the opening real and current?</h2>
        <p>Confirm it's live on the employer's own job board and check when it was first published. Anything more than a few months old, or anything that keeps getting reposted, gets a quick question before a full application.</p>
        <h2>Is the company in a steady place?</h2>
        <p>
          Look for recent layoffs (WARN notices), restructurings, and for public companies, the trend in revenue and any going-concern language. None of these mean "don't apply." They mean "ask about it." A company that just cut 10% might be hiring carefully for exactly the role you want.
        </p>
        <h2>Does the listing tell you what you need?</h2>
        <ul>
          <li>What you'd actually do day to day</li>
          <li>The pay range (required by law in a growing number of states)</li>
          <li>Whether it's remote, hybrid, or on site, and where</li>
          <li>Who you'd report to</li>
        </ul>
        <p>Vague listings aren't automatically bad, but you'll need to get those answers early, before you're three interviews in.</p>
        <h2>Compare, don't just collect</h2>
        <p>
          It helps to line up your options side by side: which ones are verified, which employers have warning signs, which ones list pay. Then put your best effort into the top few.
        </p>
        <p>JobSignal's comparison view does exactly that, with weights you set yourself. <Link to="/pricing">See what's in Pro</Link>.</p>
      </>
    ),
  },
];
