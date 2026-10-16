import { Link } from 'react-router-dom';
import { ContentPage } from './Page';

export default function HowItWorks() {
  return (
    <ContentPage kicker="How it works" title="What happens when you paste a link" intro="The short version: we read the listing from the most official place we can, compare it with what we've seen before, look the company up in public records, and write down what we found. Here's the longer version.">
      <h2>1. Reading the listing</h2>
      <p>
        Most companies don't host their own job listings. They use an applicant tracking system like Greenhouse, Lever, or Ashby, and those systems publish every live job through a public API. When you give us a link from one of them, we ask that API directly. If the job is there, it's published right now by the company that owns that job board. If it isn't, the listing has been taken down.
      </p>
      <p>
        For other career pages, we look for the structured job data (schema.org <code>JobPosting</code>) that sites publish so Google can show their jobs. We check the site's robots.txt first and make a single request. If a site asks bots not to read it, or blocks automated access, we stop and ask you to paste the text.
      </p>
      <p>
        LinkedIn, Indeed, and similar sites don't allow automated checks. They also often show copies of listings from elsewhere, so the best link is usually the one behind "Apply on company site".
      </p>

      <h2>2. Comparing with what we've seen</h2>
      <p>
        Every time someone checks a job, we note that we saw it, when, and what the description said. When we read a whole job board, we note every listing on it. Over time that tells us when a listing disappears and comes back, when the text gets edited, and when the same title and location keep getting reposted.
      </p>
      <p>
        That history only covers what we actually observed. If a job is new to us, the report says so. We don't estimate how long it was up before we saw it, and we never show a "posted 90 days ago" date the source didn't give us.
      </p>

      <h2>3. Reading the text</h2>
      <p>
        We look for things legitimate employers almost never do before an offer: ask for your Social Security number or bank details, ask you to buy equipment or deposit a check, or move interviews to Telegram or WhatsApp. We also flag talent-pool language, very thin descriptions, contradictory requirements, and missing pay ranges in states with pay transparency laws.
      </p>
      <p>
        A lot of real listings include a fraud warning that mentions exactly those things ("we will never ask for your bank details"). We read those sentences as warnings, not requests, and we'll tell you which email domains the company says its recruiters use.
      </p>

      <h2>4. Looking up the employer</h2>
      <ul>
        <li><strong>WARN notices.</strong> The federal WARN Act requires larger employers to notify the state before mass layoffs and closures. We pull official notices from Texas and California today and are adding states.</li>
        <li><strong>SEC filings.</strong> For public companies we read the EDGAR filing index for 8-K items that report restructurings (2.05), impairments (2.06), bankruptcy (1.03), and acquisitions (2.01), search annual and quarterly reports for going-concern language, and pull revenue and net income from the XBRL data.</li>
        <li><strong>Hiring activity.</strong> How many roles are open on the same job board right now.</li>
      </ul>
      <p>
        Matching public records to a company is the riskiest part, so we're strict about it. We match on the exact cleaned-up company name, website domain, or job board. Similar names stay separate. A record that's a close-but-not-exact match is labeled as such.
      </p>

      <h2>5. Writing the report</h2>
      <p>
        The rules that turn evidence into the three answers are deterministic and versioned, so the same evidence gives the same report every time. The details, weights, and thresholds are on the <Link to="/methodology">methodology page</Link>.
      </p>
      <p>
        Three things are kept apart on purpose: what the posting looks like, what public records say about the employer, and how much evidence there was to go on. Missing information lowers confidence. It never counts against the job or the company.
      </p>
    </ContentPage>
  );
}
