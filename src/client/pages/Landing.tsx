import { ArrowRight, Building2, FileSearch, ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnalyzeForm } from '../components/report/AnalyzeForm';
import { FindingItem } from '../components/report/Findings';
import { Verdicts } from '../components/report/Verdicts';
import { ButtonLink } from '../components/ui/button';
import { Arrow, Circle, Underline } from '../components/ui/marks';
import { EXAMPLE_REPORT } from '../lib/example';
import { useDocumentTitle } from '../lib/hooks';
import { PricingTable } from './Pricing';

const FAQ: Array<[string, string]> = [
  ['Is a "ghost job" score accurate?', "We don't give one. Nobody outside the company can know for sure whether a listing is real, so we show the evidence instead: is it live on their own job board, how long has it been up, have we seen it reposted, does the text ask for things scammers ask for. You decide what it adds up to."],
  ['Where does the company information come from?', 'Official sources only. State WARN Act layoff notices (Texas and California so far, more coming), SEC filings for public companies, and the employer\'s own job board. Every finding links to where it came from.'],
  ['Do I need an account?', 'No. You can run two checks a day without one. A free account gets you three a day, saved history, and shareable reports.'],
  ['What do you do with my data?', "Almost nothing, on purpose. We don't want your resume, and we don't sell anything. If you sign up we keep your email and the jobs you saved. You can download or delete all of it from your account page."],
  ['What if a report is wrong about my company?', 'Use the "Something wrong?" link on any report or company page. A person reads every one, and we correct or hide records that turn out to be mismatched.'],
];

export function Landing() {
  useDocumentTitle('JobSignal: know before you apply');
  const ex = EXAMPLE_REPORT;
  return (
    <main id="main">
      {/* ---------------------------------------------------------------- hero */}
      <section className="mx-auto max-w-[1180px] px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className="label-mono">For people applying to a lot of jobs</p>
            <h1 className="mt-4 text-[42px] leading-[1.04] text-ink sm:text-[58px]">
              Stop wasting applications on{' '}
              <span className="relative inline-block italic">
                questionable
                <Underline />
              </span>{' '}
              job listings.
            </h1>
            <p className="mt-6 max-w-[52ch] text-[17.5px] leading-relaxed text-ink-2">
              Paste a job link. We check whether it's live on the employer's own job board, how long it's really been up, whether it keeps getting reposted, and what layoff notices and SEC filings say about the company.
            </p>
            <div className="mt-8 max-w-[620px]">
              <AnalyzeForm />
            </div>
            <p className="mt-3 text-[13px] text-faint">Free. No account needed for your first couple of checks.</p>
          </div>

          {/* Example report, labeled as such */}
          <div className="relative lg:pt-6">
            <div className="absolute -top-2 right-2 hidden rotate-[2deg] text-muted lg:block">
              <span className="hand text-[22px]">what you get back</span>
              <Arrow className="ml-10 mt-1 h-10 w-14" />
            </div>
            <div className="panel overflow-hidden lg:mt-14">
              <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
                <span className="label-mono">Example report</span>
                <span className="font-mono text-[11px] text-faint">fictional company · illustrative data</span>
              </div>
              <div className="px-5 pb-5 pt-4">
                <p className="font-serif text-[26px] leading-tight text-ink">{ex.job.title}</p>
                <p className="font-serif italic text-ink-2">{ex.job.employer} · {ex.job.location}</p>
                <div className="mt-4">
                  <Verdicts report={ex} compact />
                </div>
                <div className="relative mt-5 space-y-3.5">
                  {ex.findings.slice(0, 3).map((f) => (
                    <ul key={f.ruleId} className="relative">
                      <FindingItem f={f} />
                      {f.ruleId === 'warn_recent' && <Circle className="-left-4 -top-3 hidden h-[calc(100%+22px)] w-[calc(100%+20px)] sm:block" />}
                    </ul>
                  ))}
                </div>
                <p className="hand mt-3 -rotate-1 text-right text-[20px] text-caution">the part most people never look up</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- the problem */}
      <section className="border-y border-line bg-surface/60">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-16 sm:px-6 md:grid-cols-[280px_1fr]">
          <h2 className="text-[30px] leading-tight text-ink">Why this exists</h2>
          <div className="max-w-[62ch] space-y-4 text-[17px] leading-relaxed text-ink-2">
            <p>
              Some listings stay up for months after the role is filled. Some were never really open. Some are copies of real jobs, posted by someone who wants your bank details. And some companies are hiring at the front door while filing layoff notices out back.
            </p>
            <p>
              None of that is secret. It's just spread across job board APIs, state labor department spreadsheets, and SEC filings that nobody has time to dig through for every application. So we do the digging, and show you what we found and where we found it.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- how */}
      <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
        <div className="flex items-end justify-between gap-6">
          <h2 className="text-[36px] text-ink">How it works</h2>
          <Link to="/how-it-works" className="hidden text-[14px] link text-muted sm:block">The longer version</Link>
        </div>
        <ol className="mt-10 grid gap-10 md:grid-cols-3">
          {[
            ['Paste a job posting', 'A link from Greenhouse, Lever, Ashby, or a company careers page. Or paste the text if the site won\'t let us read it.'],
            ['We pull the evidence', 'From the job board itself, our own history of what we have seen, state WARN notices, and SEC filings. Live, not from a stale scrape.'],
            ['You read it and decide', 'Three plain answers, every finding with its source, the gaps we couldn\'t fill, and the questions worth asking the recruiter.'],
          ].map(([t, d], i) => (
            <li key={t} className="relative">
              <span className="hand text-[44px] leading-none text-accent">{i + 1}</span>
              <h3 className="mt-2 text-[23px] text-ink">{t}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- what we check */}
      <section className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <div className="grid gap-px overflow-hidden rounded-[12px] border border-line bg-line md:grid-cols-2">
          {[
            {
              I: FileSearch, title: 'The posting', items: [
                "Is it live on the employer's own applicant tracking system right now",
                'When it was first published (only if the source says so)',
                'Whether we have seen it taken down and put back up',
                'Earlier listings with the same title and location',
                'Requests for money, ID, or bank details, and chat-app interviews',
                'Talent-pool wording, vague descriptions, missing pay in states that require it',
              ],
            },
            {
              I: Building2, title: 'The employer', items: [
                'WARN Act layoff and closure notices filed with the state',
                'SEC 8-K filings for restructurings, impairments, bankruptcy',
                'Going-concern warnings in annual and quarterly reports',
                'Revenue trend from annual filings',
                'How many roles they are hiring for right now',
                "A timeline you can actually read, with links to every record",
              ],
            },
          ].map(({ I, title, items }) => (
            <div key={title} className="bg-surface px-6 py-8 sm:px-8">
              <div className="flex items-center gap-2.5 text-ink">
                <I className="size-5 text-accent" />
                <h3 className="text-[25px]">{title}</h3>
              </div>
              <ul className="mt-5 space-y-2.5">
                {items.map((x) => (
                  <li key={x} className="flex gap-3 text-[15px] text-ink-2">
                    <span className="mt-[9px] h-px w-3 shrink-0 bg-line-strong" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- honesty */}
      <section className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
          <div>
            <ScrollText className="size-6 text-accent" />
            <h2 className="mt-3 text-[34px] leading-tight text-ink">What we won't do</h2>
            <p className="mt-3 text-[16px] text-muted">A confident wrong answer would be worse than useless here, so there are some rules we hold ourselves to.</p>
          </div>
          <ul className="space-y-5">
            {[
              ["We won't call a company a scam, or a listing a ghost job.", "We show you patterns and records. The conclusion is yours."],
              ["We won't make up dates.", "If a listing first showed up for us today, the report says today. We never back-fill a posting history we didn't see."],
              ["We won't treat no news as good news.", 'If there\'s not much public information about a company, the report says so and lowers its confidence instead.'],
              ["We won't hide where things came from.", 'Every finding links to its source. If you think one is wrong, tell us and a person will look.'],
            ].map(([t, d]) => (
              <li key={t} className="border-l-2 border-accent/60 pl-5">
                <p className="text-[17px] font-medium text-ink">{t}</p>
                <p className="mt-1 text-[15px] text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- pricing */}
      <section className="border-t border-line bg-surface/50">
        <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6">
          <h2 className="text-[36px] text-ink">Free covers most people</h2>
          <p className="mt-2 max-w-[56ch] text-[16px] text-muted">Pro is for when you're applying to dozens of places a week and want us to keep an eye on them for you.</p>
          <div className="mt-10"><PricingTable /></div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- faq */}
      <section className="mx-auto max-w-[880px] px-4 py-20 sm:px-6">
        <h2 className="text-[36px] text-ink">Questions people ask</h2>
        <div className="mt-8 divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] text-ink marker:hidden">
                {q}
                <span className="font-mono text-[18px] text-faint transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-ink-2">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-[14px] text-muted">More in the <Link to="/faq" className="link text-ink">full FAQ</Link>.</p>
      </section>

      {/* ---------------------------------------------------------------- final */}
      <section className="mx-auto max-w-[1180px] px-4 sm:px-6">
        <div className="panel flex flex-col items-start gap-6 px-6 py-10 sm:px-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[32px] leading-tight text-ink">Got a listing open in another tab?</h2>
            <p className="mt-2 text-[16px] text-muted">Check it before you spend the evening on the cover letter.</p>
          </div>
          <ButtonLink to="/check" size="lg" icon={<ArrowRight className="size-4.5" />}>Check a job, free</ButtonLink>
        </div>
      </section>
    </main>
  );
}
