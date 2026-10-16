import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/button';
import { EmptyState, ErrorNote, Skeleton } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { fmtDate, timeAgo } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { Notification } from '../../lib/types';

const KIND: Record<string, string> = { job_change: 'Listing', company_event: 'Company', deadline: 'Reminder', billing: 'Billing' };

export default function NotificationsPage() {
  useDocumentTitle('Alerts');
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) => api.get<{ items: Notification[]; hasMore: boolean }>(`/api/me/notifications${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => (last.hasMore ? last.items.at(-1)?.created_at : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = items.filter((n) => !n.read_at);

  const markAll = async () => {
    await api.post('/api/me/notifications/read', { all: true });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['me'] });
  };

  // Viewing the page marks what's on screen as read after a moment.
  useEffect(() => {
    if (!unread.length) return;
    const t = setTimeout(async () => {
      await api.post('/api/me/notifications/read', { ids: unread.map((n) => n.id).slice(0, 100) });
      qc.invalidateQueries({ queryKey: ['me'] });
    }, 2500);
    return () => clearTimeout(t);
  }, [unread.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppShell title="Alerts" actions={unread.length > 0 && <Button variant="secondary" size="sm" icon={<CheckCheck className="size-4" />} onClick={markAll}>Mark all read</Button>}>
      {q.isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>}
      {q.error && <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      {!q.isLoading && items.length === 0 && (
        <EmptyState icon={<Bell className="size-6" />} title="Nothing yet">
          Alerts show up when a job you watch closes, reopens, or changes, when a company you watch gets a new public record, and for reminders you set.
        </EmptyState>
      )}
      <ul className="space-y-2.5">
        {items.map((n) => (
          <li key={n.id} className={clsx('rounded-[9px] border px-4 py-3.5', n.read_at ? 'border-line bg-surface' : 'border-accent/50 bg-accent-soft/40')}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10.5px] uppercase tracking-wider text-faint">{KIND[n.kind] ?? n.kind}</p>
                <p className="mt-0.5 text-[15px] font-medium text-ink">{n.link ? <Link to={n.link} className="hover:underline">{n.title}</Link> : n.title}</p>
                <p className="mt-0.5 text-[14px] text-ink-2">{n.body}</p>
              </div>
              <time dateTime={n.created_at} title={fmtDate(n.created_at)} className="shrink-0 font-mono text-[11.5px] text-faint">{timeAgo(n.created_at)}</time>
            </div>
          </li>
        ))}
      </ul>
      {q.hasNextPage && <div className="mt-4"><Button variant="secondary" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load older</Button></div>}
    </AppShell>
  );
}
