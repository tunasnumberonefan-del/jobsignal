import { ContentPage } from './Page';

const POSTING_RULES: Array<[string, string, string]> = [
  ['Live on official job board API', '+35', 'Greenhouse, Lever, or Ashby returns the listing right now.'],
  ['Structured job data on the page', '+15', 'schema.org JobPosting found. +10 more if the page is on the employer\'s own domain.'],
  ['Listing not published anymore', '−40', 'The source answers but the job is gone (404/410).'],
  ['Employer named', '+5', 'Missing employer: −10.'],
  ['Posted within 30 days', '+8', 'Only from a stated publish date. 61–120 days: −8. Over 120 days: −15.'],
  ['Past its own "valid through" date', '−20', 'The page\'s data says applications closed but it\'s still up.'],
  ['Taken down and put back', '−8', 'Only from JobSignal\'s own observations.'],
  ['Reposted', '−8', 'Two or more earlier, now-closed listings with the same company, title, and location.'],
  ['Clear description', '+8', '250+ words with responsibilities and qualifications. Thin or vague: −10.'],
  ['Pay range listed', '+5', 'Missing in a pay-transparency state: −3. Missing elsewhere: 0.'],
  ['Entry level but 5+ years required', '−6', ''],
  ['Asks for SSN, bank details, or ID', '−30', 'Sentences that are fraud warnings are ignored.'],
  ['Interviews over chat apps', '−25', 'Telegram, WhatsApp, Signal, Hangouts, text-only interviews.'],
  ['Asks you to pay or deposit a check', '−35', ''],
  ['Personal email as contact', '−10', 'gmail.com, yahoo.com, outlook.com and similar.'],
  ['Talent-pool wording', '−10', 'Narrow phrases only, like "join our talent community" or "not an active opening".'],
  ['Big-earnings language', '−10', '"Earn up to", "unlimited earning potential", etc.'],
  ['Apply link on an unrelated domain', '−8', 'Not the employer\'s domain and not a known applicant tracking system.'],
];

const EMPLOYER_RULES: Array<[string, string, string]> = [
  ['WARN notice in last 12 months', '−15', '−20 if 100+ people. −5 more if within 90 days. Halved if the name match is probable, not exact.'],
  ['8-K Item 1.03 bankruptcy (24 months)', '−40', ''],
  ['Going-concern language (18 months)', '−35', 'Full-text match on "substantial doubt" and "going concern" in 10-K/10-Q.'],
  ['8-K Item 2.05 restructuring (12 months)', '−15', ''],
  ['8-K Item 2.06 impairment (12 months)', '−5', ''],
  ['Revenue down 20%+ year over year', '−10', 'Up 10%+: +8.'],
  ['10+ open roles on their board', '+5', ''],
  ['Periodic SEC filings current', '+5', 'Latest 10-K or 10-Q within ~200 days.'],
];

function RuleTable({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-[10px] border border-line bg-surface">
      <table className="w-full text-[14px]">
        <thead><tr className="border-b border-line text-left"><th className="label-mono px-4 py-2.5 font-normal">Signal</th><th className="label-mono px-3 py-2.5 font-normal">Weight</th><th className="label-mono px-3 py-2.5 font-normal">Notes</th></tr></thead>
        <tbody>
          {rows.map(([a, w, n]) => (
            <tr key={a} className="border-b border-line last:border-0 align-top">
              <td className="px-4 py-2.5 text-ink">{a}</td>
              <td className={`px-3 py-2.5 font-mono ${w.startsWith('+') ? 'text-good' : 'text-bad'}`}>{w}</td>
              <td className="px-3 py-2.5 text-muted">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Methodology() {
  return (
    <ContentPage kicker="Methodology · rules version 2026.10.1" title="How the scoring works" intro="Every report is produced by a fixed set of rules. No AI model decides anything. The same evidence always produces the same report, and every number below is the one the code actually uses." updated="October 2026">
      <h2>Three answers, never one score</h2>
      <p>
        A single "trust score" would mash together very different questions and hide how much we actually knew. So every report gives three separate answers:
      </p>
      <ul>
        <li><strong>The posting.</strong> Is it live on an official source, how long has it been up, has it been reposted, and does the text ask for anything a real employer wouldn't?</li>
        <li><strong>The employer.</strong> What do layoff notices, SEC filings, and hiring activity show?</li>
        <li><strong>Evidence confidence.</strong> How much of what we normally check was actually available and current?</li>
      </ul>

      <h2>Posting signals</h2>
      <p>Each rule adds or subtracts from a starting point of 50, clamped to 0–100.</p>
      <RuleTable rows={POSTING_RULES} />
      <h3>Posting labels</h3>
      <ul>
        <li><strong>Significant inconsistencies:</strong> two or more serious requests (sensitive info, payment, chat-app interviews), or one plus another warning, or one on a listing we couldn't verify.</li>
        <li><strong>Unable to verify:</strong> the listing is gone, or we couldn't read it and there's no text to check.</li>
        <li><strong>Limited evidence:</strong> we couldn't confirm it at an official source and nothing in the text stood out.</li>
        <li><strong>Some caution signals:</strong> verified, but with a warning or enough minor cautions to total −15 or worse.</li>
        <li><strong>Strong verification signals:</strong> verified at the source, score 70+, no warnings.</li>
      </ul>

      <h2>Employer signals</h2>
      <RuleTable rows={EMPLOYER_RULES} />
      <h3>Employer labels</h3>
      <ul>
        <li><strong>Multiple significant warning signals:</strong> two or more warnings, or any bankruptcy filing.</li>
        <li><strong>Some warning signals:</strong> one warning, or any caution.</li>
        <li><strong>No significant warning signals found:</strong> no warnings or cautions, and we had real coverage (an SEC match or financial data). Not a guarantee.</li>
        <li><strong>Not enough public information:</strong> anything else. Common for private companies, and not a negative sign.</li>
      </ul>

      <h2>Evidence confidence</h2>
      <p>Points for what was available, out of 100:</p>
      <ul>
        <li>Live on official source: 25 (structured page data: 15)</li>
        <li>SEC filer matched: 20 (looked up, not a filer: 5)</li>
        <li>Original posting date: 10 · employer named: 10 · history of 2+ observations: 10 · WARN data checked: 10 · description of 150+ words: 10 · company records less than ~13 months old: 5</li>
      </ul>
      <p>High is 70 or more. Moderate is 40 to 69. Low is below 40. The report lists exactly which pieces were missing.</p>

      <h2>Things we deliberately don't do</h2>
      <ul>
        <li>Treat a "last updated" date as a posting date. Greenhouse, for one, updates that timestamp for all sorts of reasons.</li>
        <li>Penalize missing pay outside pay-transparency states, or treat reposting by itself as proof of anything.</li>
        <li>Count missing data against a job or company. It only lowers confidence.</li>
        <li>Merge companies on a similar name. Exact cleaned-up name, website domain, or job board only.</li>
      </ul>

      <h2>Versioning</h2>
      <p>
        When a weight or rule changes, the rules version changes. Every stored report records the version that produced it, so an old report always reflects the rules at the time it was made.
      </p>
    </ContentPage>
  );
}
