import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowUpRight, Columns3, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { Report } from '@shared/types';
import { AppShell } from '../../components/layout/AppShell';
import { Button, ButtonLink } from '../../components/ui/button';
import { Input } from '../../components/ui/form';
import { EmptyState, ErrorNote, Skeleton, Stamp } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { confidenceLabel, employerLabel, fmtDate, postingLabel } from '../../lib/format';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import type { HistoryItem } from '../../lib/types';

interface Row {
  reportId: string; slug: string; analyzedAt: string; jobStatus: string;
  job: Report['job']; posting: Report['posting']; employer: Report['employer']; confidence: Report['confidence'];
  warnings: string[]; payListed: boolean;
}

const CRITERIA = [
  { key: 'posting', label: 'Posting checks out' },
  { key: 'employer', label: 'Fewer employer warnings' },
  { key: 'confidence', label: 'More evidence' },
  { key: 'pay', label: 'Pay is listed' },
  { key: 'fresh', label: 'Recently posted' },
] as const;

type Weights = Record<(typeof CRITERIA)[number]['key'], number>;
const DEFAULT_WEIGHTS: Weights = { posting: 3, employer: 3, confidence: 1, pay: 1, fresh: 2 };

const P: Record<string, number> = { strong_signals: 1, some_caution: 0.6, limited_evidence: 0.4, unable_to_verify: 0.2, significant_inconsistencies: 0 };
const E: Record<string, number> = { no_significant_warnings: 1, insufficient_information: 0.5, some_warnings: 0.4, multiple_significant_warnings: 0.1 };
const C: Record<string, number> = { high: 1, moderate: 0.6, low: 0.3 };

function fit(r: Row, w: Weights): number {
  const days = r.job.publishedAt ? (Date.now() - Date.parse(r.job.publishedAt)) / 86_400_000 : null;
  const fresh = days === null ? 0.5 : days < 30 ? 1 : days < 60 ? 0.65 : days < 120 ? 0.35 : 0.1;
  const parts: Record<keyof Weights, number> = {
    posting: P[r.posting.label] ?? 0.4,
    employer: E[r.employer.label] ?? 0.5,
    confidence: C[r.confidence.label] ?? 0.5,
    pay: r.payListed ? 1 : 0,
    fresh,
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  return Math.round((Object.entries(w).reduce((s, [k, v]) => s + parts[k as keyof Weights] * v, 0) / total) * 100);
}

export default function ComparePage() {
  useDocumentTitle('Compare jobs');
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string[]>(() => (params.get('reports') ?? '').split(',').filter(Boolean));
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [name, setName] = useState('');
  const [hideClosed, setHideClosed] = useState(false);
  const isPro = me?.plan === 'pro';
  const max = me?.entitlements.maxCompareItems ?? 6;

  const history = useQuery({ queryKey: ['history', 'compare-picker'], queryFn: () => api.get<{ items: HistoryItem[] }>('/api/me/reports?page=1'), enabled: isPro });
  const saved = useQuery({ queryKey: ['comparisons'], queryFn: () => api.get<{ items: Array<{ id: string; name: string; reportIds: string[]; weights: Weights; updatedAt: string }> }>('/api/me/comparisons'), enabled: isPro });
  const rows = useQuery({
    queryKey: ['compare', selected.join(',')],
    queryFn: () => api.get<{ items: Row[] }>(`/api/me/compare?reports=${selected.join(',')}`),
    enabled: isPro && selected.length >= 2,
  });

  useEffect(() => {
    setParams(selected.length ? { reports: selected.join(',') } : {}, { replace: true });
  }, [selected, setParams]);

  const ranked = useMemo(() => {
    const list = (rows.data?.items ?? []).filter((r) => !hideClosed || r.jobStatus !== 'closed');
    return list.map((r) => ({ ...r, fit: fit(r, weights) })).sort((a, b) => b.fit - a.fit);
  }, [rows.data, weights, hideClosed]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? (toast(`You can compare up to ${max} at once.`), s) : [...s, id]));

  const saveComparison = async () => {
    try {
      await api.post('/api/me/comparisons', { name: name || `Comparison ${fmtDate(new Date().toISOString())}`, reportIds: selected, weights });
      toast.success('Comparison saved.');
      setName('');
      qc.invalidateQueries({ queryKey: ['comparisons'] });
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  };

  if (me && !isPro) {
    return (
      <AppShell title="Compare jobs">
        <EmptyState icon={<Columns3 className="size-6" />} title="Line up your options side by side" action={<ButtonLink to="/pricing">See Pro</ButtonLink>}>
          Pick two to six jobs you've checked and see posting verification, employer records, pay, and freshness next to each other. You set what matters most to you. Part of Pro.
        </EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell title="Compare jobs" wide>
      <div className="grid gap-8 xl:grid-cols-[280px_1fr]">
        <aside className="space-y-8">
          <section>
            <p className="label-mono mb-2">Pick jobs ({selected.length}/{max})</p>
            {history.isLoading && <Skeleton className="h-48" />}
            {history.data?.items.length === 0 && <p className="text-[14px] text-muted">Check a couple of jobs first.</p>}
            <ul className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
              {history.data?.items.map((h) => (
                <li key={h.id}>
                  <label className={clsx('flex cursor-pointer items-start gap-2.5 rounded-[7px] border px-3 py-2', selected.includes(h.id) ? 'border-accent bg-accent-soft/50' : 'border-line hover:border-line-strong')}>
                    <input type="checkbox" className="mt-1 accent-[var(--accent)]" checked={selected.includes(h.id)} onChange={() => toggle(h.id)} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-ink">{h.title}</span>
                      <span className="block truncate text-[12px] text-muted">{h.company ?? 'Unknown'}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <p className="label-mono mb-3">What matters to you</p>
            <div className="space-y-3">
              {CRITERIA.map((c) => (
                <label key={c.key} className="block">
                  <span className="flex justify-between text-[13.5px] text-ink-2">{c.label}<span className="font-mono text-faint">{weights[c.key]}</span></span>
                  <input type="range" min={0} max={5} step={1} value={weights[c.key]} onChange={(e) => setWeights({ ...weights, [c.key]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--accent)]" aria-label={`Weight: ${c.label}`} />
                </label>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-[13.5px] text-ink-2">
              <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} className="accent-[var(--accent)]" /> Hide closed listings
            </label>
          </section>
          {!!saved.data?.items.length && (
            <section>
              <p className="label-mono mb-2">Saved comparisons</p>
              <ul className="space-y-1">
                {saved.data.items.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <button className="flex-1 truncate text-left text-[14px] text-ink-2 hover:text-ink" onClick={() => { setSelected(s.reportIds); setWeights({ ...DEFAULT_WEIGHTS, ...s.weights }); }}>{s.name}</button>
                    <button aria-label={`Delete ${s.name}`} className="rounded p-1 text-faint hover:text-bad" onClick={async () => { await api.del(`/api/me/comparisons/${s.id}`); qc.invalidateQueries({ queryKey: ['comparisons'] }); }}><Trash2 className="size-3.5" /></button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <section className="min-w-0">
          {selected.length < 2 && <EmptyState icon={<Columns3 className="size-6" />} title="Pick at least two jobs">Choose from the list. The table fills in as you go.</EmptyState>}
          {rows.isLoading && selected.length >= 2 && <Skeleton className="h-72" />}
          {rows.error && <ErrorNote message={(rows.error as Error).message} />}
          {ranked.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
                <table className="w-full min-w-[680px] text-[13.5px]">
                  <tbody>
                    <tr className="border-b border-line">
                      <th className="label-mono w-[150px] px-4 py-3 text-left align-top font-normal">Job</th>
                      {ranked.map((r) => (
                        <td key={r.reportId} className="px-3 py-3 align-top">
                          <Link to={`/r/${r.slug}`} className="font-medium text-ink hover:underline">{r.job.title}</Link>
                          <span className="block text-muted">{r.job.employer ?? 'Unknown'}</span>
                        </td>
                      ))}
                    </tr>
                    {[
                      ['Your fit', (r: (typeof ranked)[number]) => <span className="font-serif text-[26px] leading-none text-ink">{r.fit}<span className="text-[14px] text-faint">/100</span></span>],
                      ['Location', (r: Row) => r.job.location ?? '—'],
                      ['Pay', (r: Row) => r.job.compensationText ?? <span className="text-faint">Not listed</span>],
                      ['Posting', (r: Row) => { const l = postingLabel(r.posting.label); return <Stamp tone={l.tone} className="text-[10px]!">{l.text}</Stamp>; }],
                      ['Employer', (r: Row) => { const l = employerLabel(r.employer.label); return <Stamp tone={l.tone} className="text-[10px]!">{l.text}</Stamp>; }],
                      ['Evidence', (r: Row) => confidenceLabel(r.confidence.label).text],
                      ['Posted', (r: Row) => (r.job.publishedAt ? fmtDate(r.job.publishedAt) : <span className="text-faint">Unknown</span>)],
                      ['Listing', (r: Row) => <span className={r.jobStatus === 'closed' ? 'text-caution' : 'text-good'}>{r.jobStatus === 'closed' ? 'Closed' : 'Open'} <span className="text-faint">as of {fmtDate(r.analyzedAt)}</span></span>],
                      ['Watch out for', (r: Row) => (r.warnings.length ? <ul className="list-disc space-y-1 pl-4 text-ink-2">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <span className="text-faint">Nothing flagged</span>)],
                      ['Apply', (r: Row) => (r.job.applyUrl ? <a className="inline-flex items-center gap-0.5 link text-ink" href={r.job.applyUrl} target="_blank" rel="noopener noreferrer nofollow">Open <ArrowUpRight className="size-3.5" /></a> : '—')],
                    ].map(([label, render]) => (
                      <tr key={label as string} className="border-b border-line last:border-0">
                        <th className="label-mono px-4 py-3 text-left align-top font-normal">{label as string}</th>
                        {ranked.map((r) => <td key={r.reportId} className="px-3 py-3 align-top text-ink-2">{(render as (r: (typeof ranked)[number]) => React.ReactNode)(r)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[12.5px] text-faint">"Your fit" only reflects the weights you set on the left. It isn't a prediction of which job is more secure.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this comparison" className="max-w-[280px]" aria-label="Comparison name" />
                <Button variant="secondary" icon={<Save className="size-4" />} onClick={saveComparison}>Save</Button>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
