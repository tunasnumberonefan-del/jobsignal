import { Link } from 'react-router-dom';
import { ContentPage } from './Page';

const SECTIONS: Array<{ title: string; items: Array<[string, React.ReactNode]> }> = [
  {
    title: 'Accuracy',
    items: [
      ['How accurate is it?', "We don't publish an accuracy percentage, because we can't honestly measure one: nobody outside a company knows for certain whether a listing is real. What we can promise is that every finding comes from a real source you can click, and that the rules are the same for everyone. If a listing is live on the company's own Greenhouse board, that's a fact. Whether a 150-day-old listing is still being hired for is a question, and we frame it as one."],
      ['Can you tell me if a job is a ghost job?', "Not with certainty, and we won't pretend to. We show the signals that tend to go along with ghost jobs (long-open, repeatedly reposted, talent-pool wording) and suggest what to ask. You make the call."],
      ['Why does it say "not enough public information" about a company?', 'Private companies don\'t file with the SEC, and layoff notices only exist for larger layoffs in states we cover. Less information isn\'t a bad sign. We just say so plainly instead of guessing.'],
      ['Something in a report is wrong. What do I do?', <>Use "Something wrong? Tell us" at the bottom of any report or the <Link to="/report-a-problem">report a problem</Link> page. A person reviews every one and we fix or hide mismatched records.</>],
    ],
  },
  {
    title: 'Data',
    items: [
      ['Which job sites do you support?', 'Greenhouse, Lever, and Ashby links are read directly from their public APIs. Other career pages work if they publish schema.org JobPosting data and allow automated access. LinkedIn, Indeed, and Glassdoor don\'t allow it, so use the employer\'s own link or paste the text.'],
      ['Which states do you have WARN data for?', 'Texas and California right now. Each state publishes in its own format, so we add them one at a time.'],
      ['Do you scrape websites?', "We use official public APIs where they exist. For other pages we check robots.txt and respect it, make one request, and never try to get around access controls or bot protection."],
      ['How fresh is the data?', 'Job listings are read live when you check them (cached for up to 30 minutes so a popular listing doesn\'t hammer the job board). WARN notices update daily. SEC data is cached for up to 12 hours.'],
    ],
  },
  {
    title: 'Privacy',
    items: [
      ['Do you need my resume?', "No, and we don't want it. JobSignal never asks for a resume or any application materials."],
      ['Who can see my reports?', 'Only you, unless you turn on sharing for a specific report. Shared reports never show who ran them.'],
      ['Can I delete my data?', <>Yes. Account → Privacy & data has a download button and a delete button. Deleting removes everything tied to you. See the <Link to="/privacy">privacy policy</Link> for details.</>],
    ],
  },
  {
    title: 'Plans and billing',
    items: [
      ['What do I get for free?', 'Three checks a day with an account (two without), every check fully run, all warnings shown, sources, sharing, and a saved list of up to 25 jobs.'],
      ['What does Pro add?', 'Monitoring (we recheck jobs and companies for you and alert you), every finding in full with financial figures, posting change history, comparisons, a weekly digest, exports, and 300 checks a month.'],
      ['How do I cancel?', 'Account → Billing → Manage billing. You keep Pro until the end of the period you paid for. No emails, no phone calls.'],
      ['Do you offer refunds?', "If something went wrong, get in touch through the report a problem page and we'll sort it out."],
    ],
  },
];

export default function Faq() {
  return (
    <ContentPage kicker="FAQ" title="Questions, answered plainly">
      {SECTIONS.map((s) => (
        <section key={s.title}>
          <h2>{s.title}</h2>
          {s.items.map(([q, a]) => (
            <div key={q}>
              <h3>{q}</h3>
              <p>{a}</p>
            </div>
          ))}
        </section>
      ))}
    </ContentPage>
  );
}
