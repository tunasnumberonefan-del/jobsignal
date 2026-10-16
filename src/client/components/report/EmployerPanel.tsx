import { clsx } from 'clsx';
import { ArrowUpRight, Check, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CompanyEvent, EmployerEvidence, FinancialPoint } from '@shared/types';
import { fmtDate } from '../../lib/format';
import { ProLock, Tip } from '../ui/misc';

const KIND_LABEL: Record<string, string> = {
  warn_notice: 'WARN notice',
  sec_restructuring: 'Restructuring',
  sec_bankruptcy: 'Bankruptcy',
  sec_impairment: 'Write-down',
  sec_acquisition: 'Acquisition',
  going_concern: 'Going concern',
  other: 'Event',
};

const KIND_TONE: Record<string, string> = {
  warn_notice: 'bg-bad',
  sec_restructuring: 'bg-bad',
  sec_bankruptcy: 'bg-bad',
  going_concern: 'bg-bad',
  sec_impairment: 'bg-caution',
  sec_acquisition: 'bg-neutral',
  other: 'bg-neutral',
};

/**
 * A two-year strip with events placed by date. Drawn in plain SVG so it stays crisp and
 * light. Below it, the same events as a list, which is what screen readers get.
 */
export function Timeline({ events, now = new Date() }: { events: CompanyEvent[]; now?: Date }) {
  const end = now.getTime();
  const start = end - 2 * 365 * 86_400_000;
  const inRange = events.filter((e) => Date.parse(e.date) >= start);
  const years = [new Date(start).getUTCFullYear() + 1, new Date(end).getUTCFullYear()].filter((y, i, a) => a.indexOf(y) === i);
  const x = (iso: string) => ((Date.parse(iso) - start) / (end - start)) * 100;
  return (
    <div>
      <div className="relative h-[54px]" aria-hidden>
        <div className="absolute left-0 right-0 top-[26px] h-px bg-line-strong" />
        {years.map((y) => {
          const pos = x(`${y}-01-01`);
          return pos > 0 && pos < 100 ? (
            <div key={y} className="absolute top-[18px]" style={{ left: `${pos}%` }}>
              <div className="h-4 w-px bg-line-strong" />
              <span className="absolute left-1 top-[18px] font-mono text-[10.5px] text-faint">{y}</span>
            </div>
          ) : null;
        })}
        <span className="absolute right-0 top-[34px] font-mono text-[10.5px] text-faint">today</span>
        {inRange.map((e, i) => (
          <Tip key={i} content={`${fmtDate(e.date)}: ${e.title}${e.magnitude ? ` (${e.magnitude.toLocaleString()} people)` : ''}`}>
            <button
              type="button"
              tabIndex={-1}
              className={clsx('absolute top-[20px] size-3 -translate-x-1/2 rounded-full ring-2 ring-surface', KIND_TONE[e.kind] ?? 'bg-neutral')}
              style={{ left: `${Math.min(99, Math.max(1, x(e.date)))}%` }}
            />
          </Tip>
        ))}
      </div>
      {inRange.length === 0 && <p className="text-[13.5px] text-faint">No dated events in the last two years from the sources we check.</p>}
    </div>
  );
}

function money(n: number) {
  const a = Math.abs(n);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(0)}M` : `$${a.toLocaleString()}`;
  return n < 0 ? `−${s}` : s;
}

function Financials({ points }: { points: FinancialPoint[] }) {
  return (
    <table className="w-full text-[14px]">
      <caption className="sr-only">Annual figures from SEC filings</caption>
      <thead>
        <tr className="text-left">
          <th className="label-mono pb-2 font-normal">Figure</th>
          <th className="label-mono pb-2 font-normal">Year</th>
          <th className="label-mono pb-2 text-right font-normal">Value</th>
          <th className="label-mono pb-2 text-right font-normal">Prior year</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => {
          const pct = p.priorValue ? Math.round(((p.value - p.priorValue) / Math.abs(p.priorValue)) * 100) : null;
          return (
            <tr key={p.label} className="border-t border-line">
              <td className="py-2 text-ink">{p.label}</td>
              <td className="py-2 font-mono text-muted">{p.fiscalYear}</td>
              <td className="py-2 text-right font-mono text-ink">{money(p.value)}</td>
              <td className="py-2 text-right font-mono text-muted">
                {p.priorValue !== undefined ? money(p.priorValue) : '—'}
                {pct !== null && <span className={clsx('ml-2', pct >= 0 ? 'text-good' : 'text-bad')}>{pct >= 0 ? '+' : ''}{pct}%</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Coverage({ profile }: { profile: EmployerEvidence }) {
  const rows: Array<[string, boolean, string]> = [
    ['SEC EDGAR filings', profile.checked.sec.matched, profile.checked.sec.matched ? `Matched${profile.ticker ? ` (${profile.ticker})` : ''}` : profile.checked.sec.error ? 'Lookup failed' : profile.checked.sec.ran ? 'No public filer found' : 'Not checked'],
    ['State WARN notices', profile.checked.warn.ran, profile.checked.warn.ran ? `Checked ${profile.checked.warn.states.join(', ')}` : 'No data loaded yet'],
  ];
  return (
    <ul className="space-y-1.5 text-[13.5px]">
      {rows.map(([name, ok, note]) => (
        <li key={name} className="flex items-center gap-2">
          {ok ? <Check className="size-3.5 text-good" /> : <Minus className="size-3.5 text-faint" />}
          <span className="text-ink-2">{name}</span>
          <span className="text-faint">· {note}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmployerPanel({ profile, lockedFinancials, lockedEvents }: { profile: EmployerEvidence; lockedFinancials: boolean; lockedEvents: number }) {
  if (!profile.name) return null;
  const events = profile.events;
  return (
    <section aria-labelledby="employer-h" className="panel px-5 py-6 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="employer-h" className="text-[24px] text-ink">{profile.name}</h3>
        {profile.companySlug && (
          <Link to={`/companies/${profile.companySlug}`} className="text-[13.5px] link text-muted">Company profile</Link>
        )}
      </div>
      <div className="mt-3"><Coverage profile={profile} /></div>

      <div className="mt-6">
        <p className="label-mono mb-1">Public record timeline · last 2 years</p>
        <Timeline events={events} />
      </div>

      {events.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {events.map((e, i) => (
            <li key={i} className="grid gap-x-4 gap-y-0.5 py-3 sm:grid-cols-[96px_1fr]">
              <span className="font-mono text-[12.5px] text-muted">{fmtDate(e.date)}</span>
              <div>
                <p className="text-[14.5px] text-ink">
                  <span className="mr-2 font-mono text-[10.5px] uppercase tracking-wider text-faint">{KIND_LABEL[e.kind] ?? 'Event'}</span>
                  {e.title}
                  {e.magnitude ? <span className="text-muted"> · {e.magnitude.toLocaleString()} people</span> : null}
                </p>
                {e.detail && <p className="text-[13.5px] text-muted">{e.detail}{e.matchQuality === 'probable' && ' Name match is close but not exact.'}</p>}
                {e.source.url && (
                  <a href={e.source.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[11.5px] text-faint hover:text-ink">
                    {e.source.name} <ArrowUpRight className="size-3" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {lockedEvents > 0 && <ProLock className="mt-3" what={`${lockedEvents} older event${lockedEvents === 1 ? '' : 's'} are in the full timeline.`} />}

      {profile.financials.length > 0 && (
        <div className="mt-6">
          <p className="label-mono mb-2">From annual SEC filings</p>
          <Financials points={profile.financials} />
          <p className="mt-2 text-[12.5px] text-faint">One year of numbers says little about any one team. Context, not a prediction.</p>
        </div>
      )}
      {lockedFinancials && <ProLock className="mt-6" what="Revenue and income figures from SEC filings are in the full report." />}
    </section>
  );
}
