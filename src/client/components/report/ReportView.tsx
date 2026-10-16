import * as DM from '@radix-ui/react-dropdown-menu';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowUpRight, Bookmark, BookmarkCheck, Eye, EyeOff, FileDown, Flag, MoreHorizontal, Printer, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError, download } from '../../lib/api';
import { fmtDate, hostOf, plural, timeAgo } from '../../lib/format';
import { useMe } from '../../lib/hooks';
import type { ReportResponse, ReportView as RV } from '../../lib/types';
import { Button, buttonClass } from '../ui/button';
import { ProLock, Tip } from '../ui/misc';
import { EmployerPanel } from './EmployerPanel';
import { Feedback, FlagDialog } from './FlagDialog';
import { Findings } from './Findings';
import { ShareDialog } from './ShareDialog';
import { Checklist, Questions, SourcesPanel } from './Sidebar';
import { Verdicts } from './Verdicts';

const SOURCE_NAME: Record<string, string> = {
  greenhouse: 'Greenhouse job board',
  lever: 'Lever job board',
  ashby: 'Ashby job board',
  jsonld: 'the page itself',
  manual: 'text you pasted',
};

function HistoryPanel({ report }: { report: RV }) {
  const h = report.history;
  if (!h) return null;
  return (
    <section aria-labelledby="hist-h" className="panel px-5 py-6 sm:px-6">
      <h3 id="hist-h" className="text-[24px] text-ink">What we've seen of this listing</h3>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          ['First seen by us', fmtDate(h.firstSeenAt)],
          ['Times checked', String(h.observationCount)],
          ['Taken down & back', String(h.reopenedCount)],
          ['Edits seen', String(h.descriptionChanges)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="label-mono">{k}</dt>
            <dd className="mt-1 font-serif text-[22px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {report.job.publishedAt && (
        <p className="mt-4 text-[13.5px] text-muted">
          The source says it was first published {fmtDate(report.job.publishedAt)}.
          {report.job.sourceUpdatedAt && <> Last edited {fmtDate(report.job.sourceUpdatedAt)} (an edit date, not a posting date).</>}
        </p>
      )}
      {h.similarPostings.length > 0 && (
        <div className="mt-5">
          <p className="label-mono mb-2">Same title & location from this employer</p>
          <ul className="divide-y divide-line border-y border-line text-[13.5px]">
            {h.similarPostings.map((s) => (
              <li key={s.key} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-mono text-[12px] text-muted">{s.key.split(':').slice(0, 2).join(' / ')}</span>
                <span className="text-ink-2">first seen {fmtDate(s.firstSeenAt)} · <span className={s.status === 'closed' ? 'text-caution' : 'text-good'}>{s.status}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-faint">
        History only includes what JobSignal has actually observed. We never fill in dates we didn't see.
      </p>
      {report.locks.history && <ProLock className="mt-4" what="See every check, the exact text that changed between versions, and alerts when it closes." />}
    </section>
  );
}

export function ReportView({ data, animate, onChange }: { data: ReportResponse; animate?: boolean; onChange: () => void }) {
  const { report, slug } = data;
  const { data: me } = useMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [shareOpen, setShareOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ent = me?.entitlements;
  const job = report.job;

  const needAccount = (what: string) => {
    toast(`Create a free account to ${what}.`, { action: { label: 'Sign in', onClick: () => nav(`/sign-in?next=/r/${slug}`) } });
  };

  const save = async (monitor = false) => {
    if (!me?.user) return needAccount('save jobs');
    if (!data.reportId) return;
    setBusy('save');
    try {
      await api.post('/api/me/saved-jobs', { reportId: data.reportId, monitor });
      toast.success(monitor ? "Saved. We'll recheck it and tell you if it changes." : 'Saved to your jobs.');
      onChange();
      qc.invalidateQueries({ queryKey: ['saved'] });
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleWatch = async () => {
    if (!me?.user) return needAccount('watch jobs');
    if (!ent?.monitoring) {
      toast('Watching jobs for changes is part of Pro.', { action: { label: 'See Pro', onClick: () => nav('/pricing') } });
      return;
    }
    if (!data.saved) return save(true);
    setBusy('watch');
    try {
      await api.patch(`/api/me/saved-jobs/${data.saved.id}`, { monitor: !data.saved.monitor });
      toast.success(data.saved.monitor ? 'Stopped watching.' : "Watching. We'll tell you if it closes, reopens, or changes.");
      onChange();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };

  const exportJson = async () => {
    if (!ent?.exports || !data.reportId) {
      toast('Exports are part of Pro.', { action: { label: 'See Pro', onClick: () => nav('/pricing') } });
      return;
    }
    try {
      await download(`/api/me/reports/${data.reportId}/export`, `jobsignal-${slug}.json`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <article className="anim-rise">
      {/* Header */}
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="label-mono">
            Report · {timeAgo(report.generatedAt) === 'just now' ? 'checked just now' : `checked ${fmtDate(report.generatedAt)}`} · from {SOURCE_NAME[job.sourceKind] ?? job.sourceKind}
          </p>
          <h1 className="mt-2 text-[34px] leading-[1.1] text-ink sm:text-[42px]">{job.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px] text-ink-2">
            {job.employer && (report.employerProfile.companySlug
              ? <Link to={`/companies/${report.employerProfile.companySlug}`} className="link font-serif text-[19px] italic text-ink">{job.employer}</Link>
              : <span className="font-serif text-[19px] italic text-ink">{job.employer}</span>)}
            {job.location && <span className="text-muted">· {job.location}</span>}
            {job.employmentType && <span className="text-muted">· {job.employmentType}</span>}
          </p>
          {job.compensationText && <p className="mt-1 font-mono text-[13px] text-ink-2">{job.compensationText}</p>}
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {job.applyUrl && (
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow" className={buttonClass('secondary', 'md')}>
              Open listing <ArrowUpRight className="size-4" />
            </a>
          )}
          {data.isOwner && (
            data.saved
              ? <Button variant="secondary" icon={<BookmarkCheck className="size-4 text-accent" />} onClick={() => nav('/saved')}>Saved</Button>
              : <Button variant="secondary" icon={<Bookmark className="size-4" />} loading={busy === 'save'} onClick={() => save(false)}>Save</Button>
          )}
          {data.isOwner && (
            <Tip content={ent?.monitoring ? 'Recheck this listing every 12 hours and alert me if it closes, comes back, or changes.' : 'Pro: get alerts when this listing closes, reopens, or changes.'}>
              <Button variant="secondary" icon={data.saved?.monitor ? <EyeOff className="size-4" /> : <Eye className="size-4" />} loading={busy === 'watch'} onClick={toggleWatch}>
                {data.saved?.monitor ? 'Watching' : 'Watch'}
              </Button>
            </Tip>
          )}
          <Button icon={<Share2 className="size-4" />} onClick={() => setShareOpen(true)}>Share</Button>
          <DM.Root>
            <DM.Trigger className={buttonClass('ghost', 'md', 'w-10 px-0!')} aria-label="More actions"><MoreHorizontal className="size-5" /></DM.Trigger>
            <DM.Portal>
              <DM.Content align="end" sideOffset={6} className="z-50 min-w-[210px] panel p-1 anim-rise">
                {[
                  { label: 'Print or save as PDF', I: Printer, on: () => (ent?.exports ? window.print() : toast('Print-ready PDF export is part of Pro.', { action: { label: 'See Pro', onClick: () => nav('/pricing') } })) },
                  { label: 'Download as JSON', I: FileDown, on: exportJson },
                  { label: 'Report a mistake', I: Flag, on: () => setFlagOpen(true) },
                ].map(({ label, I, on }) => (
                  <DM.Item key={label} onSelect={on} className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[14px] text-ink-2 outline-none data-highlighted:bg-bg-sunk data-highlighted:text-ink">
                    <I className="size-4" /> {label}
                  </DM.Item>
                ))}
              </DM.Content>
            </DM.Portal>
          </DM.Root>
        </div>
      </header>

      {report.inputKind === 'manual' && (
        <p className="mt-5 rounded-[8px] border border-caution/40 bg-caution-soft px-4 py-2.5 text-[14px] text-ink-2">
          <strong className="font-semibold text-caution">Based on text you pasted.</strong> We couldn't check it against a live listing, so the posting checks are limited to what the text says.
        </p>
      )}

      <div className="mt-7">
        <Verdicts report={report} animate={animate} />
      </div>
      {report.confidence.gaps.length > 0 && (
        <p className="mt-3 text-[13px] text-faint">
          Missing: {report.confidence.gaps.join(' · ')}
        </p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-10">
          <Findings findings={report.findings} />
          {report.locks.findings > 0 && (
            <ProLock what={`${plural(report.locks.findings, 'more finding')} with full detail and sources.`} />
          )}
          <EmployerPanel profile={report.employerProfile} lockedFinancials={report.locks.financials} lockedEvents={report.locks.events} />
          <HistoryPanel report={report} />
        </div>
        <aside className="space-y-9 lg:sticky lg:top-[78px] lg:self-start">
          <Questions questions={report.questions} />
          <div className="no-print">
            <Checklist storageKey={slug} savedId={data.saved?.id} />
          </div>
          <SourcesPanel sources={report.sources} generatedAt={report.generatedAt} scoringVersion={report.scoringVersion} />
        </aside>
      </div>

      <footer className="mt-14 border-t border-line pt-6">
        <p className="max-w-[72ch] text-[13.5px] leading-relaxed text-muted">
          This report summarizes public information as of the time it was checked. It isn't a judgement about the employer, a prediction, or a guarantee about any job. Patterns that show up in scams also show up in real listings sometimes, and the other way around. Use it as a starting point for your own questions.
        </p>
        <div className="no-print mt-6 flex flex-wrap items-center justify-between gap-4">
          <Feedback slug={slug} />
          <button onClick={() => setFlagOpen(true)} className={clsx('inline-flex items-center gap-1.5 text-[13.5px] text-muted hover:text-ink')}>
            <Flag className="size-3.5" /> Something wrong? Tell us
          </button>
        </div>
        {job.canonicalUrl && <p className="mt-4 hidden font-mono text-[11px] text-faint print:block">Listing: {hostOf(job.canonicalUrl)}</p>}
      </footer>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} report={report} slug={slug} reportId={me?.user ? data.reportId : undefined} isOwner={data.isOwner} isPublic={data.isPublic} onChange={onChange} />
      <FlagDialog open={flagOpen} onOpenChange={setFlagOpen} slug={slug} />
    </article>
  );
}
