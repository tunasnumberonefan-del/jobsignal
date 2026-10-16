import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowUpRight, Bell, Bookmark, CalendarClock, Download, Eye, FileText, History as HistoryIcon, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/layout/AppShell';
import { CHECKLIST } from '../../components/report/Sidebar';
import { Button, ButtonLink } from '../../components/ui/button';
import { ConfirmDialog, Dialog } from '../../components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '../../components/ui/form';
import { EmptyState, ErrorNote, ProLock, Skeleton, Switch, Tip, ToneDot } from '../../components/ui/misc';
import { api, ApiError, download } from '../../lib/api';
import { diffLines } from '../../lib/diff';
import { employerLabel, fmtDate, postingLabel, STATUS_TEXT, timeAgo } from '../../lib/format';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import type { SavedJob } from '../../lib/types';

interface HistoryResp {
  observations: Array<{ observed_at: string; result: string; via: string }>;
  versions: Array<{ id: string; title: string; description_text: string; observed_at: string }>;
}

function VersionHistory({ savedId }: { savedId: string }) {
  const q = useQuery({ queryKey: ['saved-history', savedId], queryFn: () => api.get<HistoryResp>(`/api/me/saved-jobs/${savedId}/history`) });
  const [pair, setPair] = useState<[number, number] | null>(null);
  const versions = q.data?.versions ?? [];
  useEffect(() => {
    if (versions.length >= 2) setPair([versions.length - 2, versions.length - 1]);
  }, [versions.length]);
  const diff = useMemo(() => (pair && versions[pair[0]] && versions[pair[1]] ? diffLines(versions[pair[0]]!.description_text, versions[pair[1]]!.description_text) : null), [pair, versions]);
  if (q.isLoading) return <Skeleton className="h-24" />;
  if (q.error) return (q.error as ApiError).code === 'plan_required' ? <ProLock what="See every check we've made and exactly what changed in the text." /> : <ErrorNote message={(q.error as Error).message} />;
  return (
    <div className="space-y-5">
      <div>
        <p className="label-mono mb-2">Checks</p>
        <ul className="max-h-40 overflow-y-auto rounded-[8px] border border-line text-[13px]">
          {q.data!.observations.map((o, i) => (
            <li key={i} className="flex justify-between border-b border-line px-3 py-1.5 last:border-0">
              <span className="font-mono text-muted">{fmtDate(o.observed_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              <span className={o.result === 'found' ? 'text-good' : o.result === 'missing' ? 'text-bad' : 'text-muted'}>{o.result === 'found' ? 'live' : o.result} · {o.via.replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label-mono mb-2">Description versions ({versions.length})</p>
        {versions.length < 2 ? (
          <p className="text-[13.5px] text-muted">Only one version seen so far. If the employer edits the listing, the differences show up here.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Select className="h-8! w-auto text-[13px]!" value={pair?.[0]} onChange={(e) => setPair([Number(e.target.value), pair![1]])} aria-label="Older version">
                {versions.map((v, i) => <option key={v.id} value={i}>{fmtDate(v.observed_at)}</option>)}
              </Select>
              <span className="text-faint">→</span>
              <Select className="h-8! w-auto text-[13px]!" value={pair?.[1]} onChange={(e) => setPair([pair![0], Number(e.target.value)])} aria-label="Newer version">
                {versions.map((v, i) => <option key={v.id} value={i}>{fmtDate(v.observed_at)}</option>)}
              </Select>
            </div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[8px] border border-line bg-bg-sunk p-3 font-mono text-[12px] leading-relaxed">
              {diff?.filter((d, i, all) => d.kind !== 'same' || all[i - 1]?.kind !== 'same' || all[i + 1]?.kind !== 'same').map((d, i) => (
                <div key={i} className={clsx(d.kind === 'add' && 'bg-good-soft text-good', d.kind === 'del' && 'bg-bad-soft text-bad line-through decoration-bad/40', d.kind === 'same' && 'text-faint')}>
                  {d.kind === 'add' ? '+ ' : d.kind === 'del' ? '- ' : '  '}{d.text || ' '}
                </div>
              ))}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}

function JobDialog({ job, onClose, isPro }: { job: SavedJob; onClose: () => void; isPro: boolean }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'notes' | 'checklist' | 'history'>('notes');
  const [notes, setNotes] = useState(job.notes);
  const [deadline, setDeadline] = useState(job.deadline ?? '');
  const [remind, setRemind] = useState(job.remind_at ? job.remind_at.slice(0, 16) : '');
  const [checklist, setChecklist] = useState(job.checklist);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/me/saved-jobs/${job.id}`, {
        notes,
        deadline: deadline || null,
        remindAt: remind ? new Date(remind).toISOString() : null,
        checklist,
      });
      toast.success('Saved.');
      qc.invalidateQueries({ queryKey: ['saved'] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={job.title} description={`${job.company ?? 'Unknown employer'}${job.location ? ` · ${job.location}` : ''}`} wide
      footer={tab !== 'history' ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save changes</Button></> : undefined}>
      <div role="tablist" className="mb-5 flex gap-1 border-b border-line">
        {(['notes', 'checklist', 'history'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx('-mb-px border-b-2 px-3 py-2 text-[14px] capitalize', tab === t ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}>
            {t === 'history' ? 'Listing history' : t}
          </button>
        ))}
      </div>
      {tab === 'notes' && (
        <div className="space-y-4">
          <Field label="Private notes" htmlFor="sj-notes" hint="Only you can see these.">
            <Textarea id="sj-notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={10000} placeholder="Who you talked to, what they said, salary numbers…" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Application deadline" htmlFor="sj-deadline">
              <Input id="sj-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            <Field label="Remind me" htmlFor="sj-remind" hint="In-app, plus email if you allow it.">
              <Input id="sj-remind" type="datetime-local" value={remind} onChange={(e) => setRemind(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
      {tab === 'checklist' && (
        <div>
          {CHECKLIST.map(([k, label]) => (
            <Checkbox key={k} id={`sjc-${k}`} checked={!!checklist[k]} onChange={(v) => setChecklist({ ...checklist, [k]: v })}>{label}</Checkbox>
          ))}
        </div>
      )}
      {tab === 'history' && (isPro ? <VersionHistory savedId={job.id} /> : <ProLock what="See every check we've made and exactly what changed in the text." />)}
    </Dialog>
  );
}

const STATUS_ORDER = ['interested', 'applied', 'interviewing', 'offer', 'no_response', 'rejected', 'withdrawn'];

export default function SavedPage() {
  useDocumentTitle('Saved jobs');
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [open, setOpen] = useState<SavedJob | null>(null);
  const [del, setDel] = useState<SavedJob | null>(null);
  const q = useQuery({ queryKey: ['saved', status], queryFn: () => api.get<{ items: SavedJob[] }>(`/api/me/saved-jobs${status ? `?status=${status}` : ''}`) });
  const isPro = me?.plan === 'pro';

  // Deep link from alerts: /saved?job=<job id>
  const jobParam = params.get('job');
  useEffect(() => {
    if (jobParam && q.data) {
      const j = q.data.items.find((x) => x.job_id === jobParam);
      if (j) setOpen(j);
    }
  }, [jobParam, q.data]);

  const patch = async (id: string, body: Record<string, unknown>, msg?: string) => {
    try {
      await api.patch(`/api/me/saved-jobs/${id}`, body);
      if (msg) toast.success(msg);
      qc.invalidateQueries({ queryKey: ['saved'] });
    } catch (e) {
      toast.error((e as ApiError).message, (e as ApiError).code === 'plan_required' ? { action: { label: 'See Pro', onClick: () => (window.location.href = '/pricing') } } : undefined);
    }
  };
  const remove = async () => {
    if (!del) return;
    await api.del(`/api/me/saved-jobs/${del.id}`).catch((e: Error) => toast.error(e.message));
    qc.invalidateQueries({ queryKey: ['saved'] });
    setDel(null);
  };

  const exportCsv = async () => {
    try {
      await download('/api/me/export', 'jobsignal-saved-jobs.csv');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell title="Saved jobs" wide actions={
      <Tip content={isPro ? 'Download as a spreadsheet' : 'CSV export is part of Pro'}>
        <Button variant="secondary" size="sm" icon={<Download className="size-4" />} onClick={exportCsv} disabled={!isPro}>Export CSV</Button>
      </Tip>
    }>
      <div className="mb-5 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
        {['', ...STATUS_ORDER].map((s) => (
          <button key={s} role="tab" aria-selected={status === s} onClick={() => setParams(s ? { status: s } : {})}
            className={clsx('shrink-0 rounded-full border px-3 py-1 text-[13px]', status === s ? 'border-ink-2 bg-raised text-ink' : 'border-line text-muted hover:text-ink')}>
            {s ? STATUS_TEXT[s] : 'All'}
          </button>
        ))}
      </div>

      {q.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.error && <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {q.data?.items.length === 0 && (
        <EmptyState icon={<Bookmark className="size-6" />} title={status ? `Nothing marked "${STATUS_TEXT[status]}"` : 'No saved jobs yet'} action={!status && <ButtonLink to="/check">Check a job</ButtonLink>}>
          {status ? 'Change the status on a saved job and it will show up here.' : 'Hit "Save" on any report to keep track of it here, with notes, deadlines, and where you are in the process.'}
        </EmptyState>
      )}

      <ul className="space-y-3">
        {q.data?.items.map((j) => {
          const p = postingLabel(j.posting_label);
          const e = employerLabel(j.employer_label);
          const done = CHECKLIST.filter(([k]) => j.checklist[k]).length;
          const deadlineSoon = j.deadline && Date.parse(j.deadline) - Date.now() < 3 * 86_400_000 && Date.parse(j.deadline) > Date.now() - 86_400_000;
          return (
            <li key={j.id} className="panel px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {j.report_slug ? <Link to={`/r/${j.report_slug}`} className="truncate text-[17px] font-medium text-ink hover:underline">{j.title}</Link> : <span className="text-[17px] font-medium text-ink">{j.title}</span>}
                    {j.job_status === 'closed' && <span className="rounded-full bg-caution-soft px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-caution">listing closed</span>}
                  </div>
                  <p className="mt-0.5 text-[13.5px] text-muted">
                    {j.company_slug ? <Link to={`/companies/${j.company_slug}`} className="hover:text-ink">{j.company}</Link> : j.company ?? 'Unknown employer'}
                    {j.location && ` · ${j.location}`}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
                    <span className="flex items-center gap-1.5 text-ink-2"><ToneDot tone={p.tone} />{p.text}</span>
                    <span className="flex items-center gap-1.5 text-ink-2"><ToneDot tone={e.tone} />{e.text}</span>
                    <span className="text-faint">checklist {done}/{CHECKLIST.length}</span>
                    {j.deadline && <span className={clsx('flex items-center gap-1', deadlineSoon ? 'text-caution' : 'text-faint')}><CalendarClock className="size-3.5" /> due {fmtDate(j.deadline)}</span>}
                    {j.monitor === 1 && <span className="flex items-center gap-1 text-faint"><Eye className="size-3.5" /> checked {timeAgo(j.last_checked_at)}</span>}
                  </div>
                  {j.notes && <p className="mt-2 line-clamp-2 text-[13.5px] text-ink-2">{j.notes}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Select value={j.status} onChange={(ev) => patch(j.id, { status: ev.target.value }, `Marked as ${STATUS_TEXT[ev.target.value]?.toLowerCase()}.`)} className="h-9! w-[150px] text-[13.5px]!" aria-label="Application status">
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
                  </Select>
                  <Tip content={isPro ? 'Recheck every 12 hours and alert me about changes' : 'Monitoring is part of Pro'}>
                    <span className="flex items-center gap-2 rounded-[7px] border border-line px-2.5 py-1.5">
                      <Bell className="size-3.5 text-muted" />
                      <Switch checked={j.monitor === 1} onChange={(v) => patch(j.id, { monitor: v }, v ? "Watching. We'll alert you about changes." : 'Stopped watching.')} label="Watch for changes" disabled={!isPro && j.monitor !== 1} />
                    </span>
                  </Tip>
                  <Button variant="secondary" size="sm" icon={<FileText className="size-4" />} onClick={() => setOpen(j)}>Notes</Button>
                  {isPro && <Button variant="ghost" size="sm" className="w-8 px-0!" onClick={() => { setOpen(j); }} aria-label="Listing history"><HistoryIcon className="size-4" /></Button>}
                  {j.apply_url && <a href={j.apply_url} target="_blank" rel="noopener noreferrer nofollow" className="rounded p-1.5 text-faint hover:text-ink" aria-label="Open listing"><ArrowUpRight className="size-4" /></a>}
                  <button onClick={() => setDel(j)} className="rounded p-1.5 text-faint hover:text-bad" aria-label="Remove from saved"><Trash2 className="size-4" /></button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {open && <JobDialog job={open} isPro={isPro} onClose={() => { setOpen(null); if (jobParam) setParams({}); }} />}
      <ConfirmDialog open={!!del} onOpenChange={(o) => !o && setDel(null)} title="Remove this job?" description="Your notes and checklist for it will be deleted. The report stays in your history." confirmLabel="Remove" danger onConfirm={remove} />
    </AppShell>
  );
}
