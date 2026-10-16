import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe2, History as HistoryIcon, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/layout/AppShell';
import { Button, ButtonLink } from '../../components/ui/button';
import { ConfirmDialog } from '../../components/ui/dialog';
import { Input, Select } from '../../components/ui/form';
import { EmptyState, ErrorNote, ProLock, Skeleton, Tip, ToneDot } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { confidenceLabel, employerLabel, fmtDate, postingLabel } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { HistoryItem } from '../../lib/types';

interface Page { items: HistoryItem[]; page: number; hasMore: boolean; total: number; hiddenByPlan: number }

const FILTERS: Array<[string, string]> = [
  ['', 'All results'],
  ['strong_signals', 'Strong verification'],
  ['some_caution', 'Some caution'],
  ['significant_inconsistencies', 'Significant inconsistencies'],
  ['some_warnings', 'Employer: some warnings'],
  ['multiple_significant_warnings', 'Employer: multiple warnings'],
];

export default function HistoryPage() {
  useDocumentTitle('History');
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [del, setDel] = useState<HistoryItem | null>(null);
  const page = Number(params.get('page') ?? 1) || 1;
  const label = params.get('label') ?? '';
  const q = params.get('q') ?? '';

  // Debounce typing into the URL so back/forward and reloads keep the filter.
  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== q) setParams((p) => { const n = new URLSearchParams(p); if (search) n.set('q', search); else n.delete('q'); n.delete('page'); return n; });
    }, 300);
    return () => clearTimeout(t);
  }, [search, q, setParams]);

  const query = useQuery({
    queryKey: ['history', page, label, q],
    queryFn: () => api.get<Page>(`/api/me/reports?page=${page}&label=${label}&q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
  });

  const remove = async () => {
    if (!del) return;
    try {
      await api.del(`/api/me/reports/${del.id}`);
      toast.success('Report deleted.');
      qc.invalidateQueries({ queryKey: ['history'] });
    } catch (e) {
      toast.error((e as Error).message);
    }
    setDel(null);
  };

  const setPage = (n: number) => setParams((p) => { const x = new URLSearchParams(p); x.set('page', String(n)); return x; });

  return (
    <AppShell title="History" wide>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by job title or company" className="pl-9" aria-label="Search reports" />
        </div>
        <Select value={label} onChange={(e) => setParams((p) => { const n = new URLSearchParams(p); if (e.target.value) n.set('label', e.target.value); else n.delete('label'); n.delete('page'); return n; })} className="sm:w-[260px]" aria-label="Filter by result">
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </div>

      <div className="mt-6">
        {query.isLoading && <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
        {query.error && <ErrorNote message={(query.error as Error).message} onRetry={() => query.refetch()} />}
        {query.data && query.data.items.length === 0 && (
          q || label
            ? <EmptyState title="Nothing matches that">Try a different search or clear the filter.</EmptyState>
            : <EmptyState icon={<HistoryIcon className="size-6" />} title="No reports yet" action={<ButtonLink to="/check">Check a job</ButtonLink>}>Every job you check ends up here, so you can come back to it.</EmptyState>
        )}
        {query.data && query.data.items.length > 0 && (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="label-mono px-4 py-3 font-normal">Job</th>
                  <th className="label-mono px-3 py-3 font-normal">Posting</th>
                  <th className="label-mono px-3 py-3 font-normal">Employer</th>
                  <th className="label-mono px-3 py-3 font-normal">Confidence</th>
                  <th className="label-mono px-3 py-3 font-normal">Checked</th>
                  <th className="px-3 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((r) => {
                  const p = postingLabel(r.posting_label);
                  const e = employerLabel(r.employer_label);
                  const c = confidenceLabel(r.confidence_label);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-raised/60">
                      <td className="max-w-[300px] px-4 py-3">
                        <Link to={`/r/${r.slug}`} className="block truncate font-medium text-ink hover:underline">{r.title}</Link>
                        <span className="block truncate text-[12.5px] text-muted">
                          {r.company ?? 'Unknown employer'}{r.location ? ` · ${r.location}` : ''}
                          {r.job_status === 'closed' && <span className="ml-1.5 text-caution">· closed</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3"><span className="flex items-center gap-1.5 text-ink-2"><ToneDot tone={p.tone} />{p.text}</span></td>
                      <td className="px-3 py-3"><span className="flex items-center gap-1.5 text-ink-2"><ToneDot tone={e.tone} />{e.text}</span></td>
                      <td className="px-3 py-3 text-muted">{c.text}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px] text-muted">
                        {fmtDate(r.created_at)}
                        {r.is_public === 1 && <Tip content="Shared publicly"><Globe2 className="ml-1.5 inline size-3.5 text-good" /></Tip>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button onClick={() => setDel(r)} className="rounded p-1.5 text-faint hover:bg-bg-sunk hover:text-bad" aria-label={`Delete report for ${r.title}`}><Trash2 className="size-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {query.data && (page > 1 || query.data.hasMore) && (
          <div className="mt-4 flex items-center justify-between">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
            <span className="font-mono text-[12px] text-faint">page {page}</span>
            <Button variant="secondary" size="sm" disabled={!query.data.hasMore} onClick={() => setPage(page + 1)}>Older</Button>
          </div>
        )}
        {query.data && query.data.hiddenByPlan > 0 && (
          <ProLock className="mt-4" what={`${query.data.hiddenByPlan} older reports aren't listed on the free plan (their links still work).`} />
        )}
      </div>
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title="Delete this report?"
        description="It disappears from your history and any shared link stops working. The job itself stays in your saved list if you saved it."
        confirmLabel="Delete"
        danger
        onConfirm={remove}
      />
    </AppShell>
  );
}
