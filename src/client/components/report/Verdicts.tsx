import { clsx } from 'clsx';
import { Building2, FileSearch, Gauge } from 'lucide-react';
import type { ReportView } from '../../lib/types';
import { confidenceLabel, employerLabel, postingLabel } from '../../lib/format';
import { Stamp, Tip } from '../ui/misc';

/**
 * The three answers, side by side and deliberately not merged. Ruled like a form, not
 * three floating cards: you read across, the way you'd read a case summary.
 */
export function Verdicts({ report, animate, compact }: { report: ReportView; animate?: boolean; compact?: boolean }) {
  const p = postingLabel(report.posting.label);
  const e = employerLabel(report.employer.label);
  const c = confidenceLabel(report.confidence.label);
  const cols = [
    {
      key: 'posting', icon: FileSearch, heading: 'The posting', q: 'Is it real and still open?',
      stamp: p, headline: report.posting.headline,
      tip: 'Based on whether the listing is live on an official source, how long it has been up, reposting we have seen, and what the text asks of you.',
    },
    {
      key: 'employer', icon: Building2, heading: 'The employer', q: 'What do public records show?',
      stamp: e, headline: report.employer.headline,
      tip: 'Based on state WARN layoff notices, SEC filings (for public companies), and hiring activity. No warning signs found is not the same as a guarantee.',
    },
    {
      key: 'confidence', icon: Gauge, heading: 'Evidence', q: 'How much did we have to go on?',
      stamp: { text: `${c.text} confidence`, tone: c.tone }, headline: report.confidence.headline,
      tip: 'How complete and current the underlying information is. Missing data lowers confidence. It never counts against the job or the company.',
    },
  ];
  if (compact) {
    return (
      <dl aria-label="Summary" className="divide-y divide-line border-y border-line">
        {cols.map((col) => (
          <div key={col.key} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="flex items-center gap-2 text-muted"><col.icon className="size-4" /><span className="label-mono">{col.heading}</span></dt>
            <dd><Stamp tone={col.stamp.tone}>{col.stamp.text}</Stamp></dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <section aria-label="Summary" className="panel grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
      {cols.map((col, i) => (
        <div key={col.key} className="relative px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2 text-muted">
            <col.icon className="size-4" />
            <span className="label-mono">{col.heading}</span>
          </div>
          <Tip content={col.tip}>
            <p className="mt-1 w-fit cursor-help text-[13px] text-faint underline decoration-dotted underline-offset-4">{col.q}</p>
          </Tip>
          <div className="mt-4">
            <Stamp tone={col.stamp.tone} animate={animate} className={clsx(animate && i === 1 && '[animation-delay:120ms]', animate && i === 2 && '[animation-delay:240ms]')}>
              {col.stamp.text}
            </Stamp>
          </div>
          <p className="mt-3.5 text-[14.5px] leading-snug text-ink-2">{col.headline}</p>
        </div>
      ))}
    </section>
  );
}
