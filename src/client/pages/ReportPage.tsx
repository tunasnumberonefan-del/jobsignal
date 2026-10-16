import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ReportView } from '../components/report/ReportView';
import { ButtonLink } from '../components/ui/button';
import { EmptyState, ErrorNote, Skeleton } from '../components/ui/misc';
import { api, ApiError } from '../lib/api';
import { useDocumentTitle, useMe } from '../lib/hooks';
import type { ReportResponse } from '../lib/types';

export function ReportPage() {
  const { slug = '' } = useParams();
  const loc = useLocation();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ['report', slug],
    queryFn: () => api.get<ReportResponse>(`/api/reports/${slug}`),
    // A freshly run report is already in the cache. Refetch once quietly to pick up
    // owner-only fields (saved state) without a loading flash.
    staleTime: 10_000,
  });
  useDocumentTitle(q.data ? `${q.data.report.job.title}${q.data.report.job.employer ? ` at ${q.data.report.job.employer}` : ''}` : 'Report');
  const fresh = !!(loc.state as { fresh?: boolean } | null)?.fresh;

  return (
    <main id="main" className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="no-print mb-6 flex items-center justify-between">
        <Link to={me?.user ? '/history' : '/check'} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> {me?.user ? 'All reports' : 'Check another job'}
        </Link>
      </div>
      {q.isLoading && (
        <div aria-busy>
          <Skeleton className="h-4 w-60" />
          <Skeleton className="mt-4 h-11 w-[70%]" />
          <Skeleton className="mt-3 h-5 w-64" />
          <Skeleton className="mt-8 h-40 w-full" />
          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      )}
      {q.error && (
        q.error instanceof ApiError && q.error.status === 404 ? (
          <EmptyState title="We can't show this report" action={<ButtonLink to="/check">Check a job</ButtonLink>}>
            It may be private, deleted, or the link might be cut off. If someone sent it to you, ask them to turn on sharing.
          </EmptyState>
        ) : (
          <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} />
        )
      )}
      {q.data && (
        <>
          {!q.data.isOwner && (
            <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-line bg-surface px-4 py-3 text-[14px]">
              <span className="text-ink-2">Someone shared this JobSignal report with you.</span>
              <Link to="/check" className="link font-medium text-ink">Check a job of your own</Link>
            </div>
          )}
          <ReportView data={q.data} animate={fresh} onChange={() => qc.invalidateQueries({ queryKey: ['report', slug] })} />
          {q.data.isOwner && !me?.user && (
            <div className="no-print mt-10 panel flex flex-col items-start gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-serif text-[22px] text-ink">Keep this report</p>
                <p className="text-[14.5px] text-muted">Reports from visitors are deleted after 30 days. A free account keeps them, and lets you share and save jobs.</p>
              </div>
              <ButtonLink to={`/sign-in?next=/r/${slug}`}>Create free account</ButtonLink>
            </div>
          )}
        </>
      )}
    </main>
  );
}
