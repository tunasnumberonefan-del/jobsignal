import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, FileSearch } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppShell } from '../../components/layout/AppShell';
import { AnalyzeForm } from '../../components/report/AnalyzeForm';
import { ButtonLink } from '../../components/ui/button';
import { EmptyState, ErrorNote, Skeleton, ToneDot } from '../../components/ui/misc';
import { api } from '../../lib/api';
import { employerLabel, postingLabel, timeAgo } from '../../lib/format';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import type { Notification, Quota } from '../../lib/types';

interface Overview {
  stats: { analyzed: number; saved_jobs: number; watched_jobs: number; watched_companies: number; unread: number; in_progress: number; changed_this_week: number };
  recent: Array<{ slug: string; created_at: string; posting_label: string; employer_label: string; title: string; company: string | null; job_status: string }>;
  alerts: Notification[];
  quota: Quota;
}

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { data: me } = useMe();
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api.get<Overview>('/api/me/overview'), enabled: !!me?.user });
  const prefs = me?.user?.prefs.dashboard ?? {};
  const show = { stats: prefs.showStats !== false, alerts: prefs.showAlerts !== false, recent: prefs.showRecent !== false };
  const s = q.data?.stats;
  const isPro = me?.plan === 'pro';

  return (
    <AppShell title={me?.user?.name ? `Hi, ${me.user.name.split(' ')[0]}` : 'Overview'} wide>
      {params.get('welcome') && <p className="mb-6 rounded-[8px] border border-accent/40 bg-accent-soft px-4 py-3 text-[14.5px] text-ink">Welcome. Start by checking a job you're thinking about applying to.</p>}
      <div className="max-w-[760px]">
        <AnalyzeForm compact />
      </div>

      {q.isLoading && <div className="mt-10 grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>}
      {q.error && <div className="mt-8"><ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>}

      {s && show.stats && (
        <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
          {[
            ['Jobs checked', s.analyzed, '/history'],
            ['Applications in progress', s.in_progress, '/saved?status=applied'],
            [isPro ? 'Watching' : 'Saved jobs', isPro ? s.watched_jobs + s.watched_companies : s.saved_jobs, isPro ? '/saved' : '/saved'],
            ['Listings changed this week', s.changed_this_week, '/notifications'],
          ].map(([label, n, to]) => (
            <Link key={label as string} to={to as string} className="group bg-surface px-5 py-4 hover:bg-raised">
              <dt className="label-mono">{label}</dt>
              <dd className="mt-1 font-serif text-[34px] leading-none text-ink">{n as number}</dd>
            </Link>
          ))}
        </dl>
      )}
      {q.data && (
        <p className="mt-3 text-[13px] text-faint">
          {q.data.quota.remaining} of {q.data.quota.limit} checks left {q.data.quota.window === 'day' ? 'today' : 'this month'}.
          {!isPro && <> <Link to="/pricing" className="link text-muted">Pro</Link> adds monitoring and 300 checks a month.</>}
        </p>
      )}

      {q.data && (
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          {show.recent && (
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[24px] text-ink">Recently checked</h2>
                {q.data.recent.length > 0 && <Link to="/history" className="text-[13.5px] link text-muted">All</Link>}
              </div>
              {q.data.recent.length === 0 ? (
                <div className="mt-4"><EmptyState icon={<FileSearch className="size-6" />} title="Nothing checked yet">Paste a job link above. Your reports will show up here.</EmptyState></div>
              ) : (
                <ul className="mt-4 divide-y divide-line border-y border-line">
                  {q.data.recent.map((r) => {
                    const p = postingLabel(r.posting_label);
                    const e = employerLabel(r.employer_label);
                    return (
                      <li key={r.slug}>
                        <Link to={`/r/${r.slug}`} className="group flex items-center gap-4 py-3.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15.5px] text-ink group-hover:underline">{r.title}</p>
                            <p className="truncate text-[13px] text-muted">{r.company ?? 'Unknown employer'} · {timeAgo(r.created_at)}</p>
                          </div>
                          <div className="hidden shrink-0 flex-col items-end gap-1 text-[12px] sm:flex">
                            <span className="flex items-center gap-1.5 text-ink-2"><ToneDot tone={p.tone} />{p.text}</span>
                            <span className="flex items-center gap-1.5 text-muted"><ToneDot tone={e.tone} />{e.text}</span>
                          </div>
                          <ArrowRight className="size-4 shrink-0 text-faint" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          {show.alerts && (
            <section>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[24px] text-ink">Alerts</h2>
                <Link to="/notifications" className="text-[13.5px] link text-muted">All</Link>
              </div>
              {q.data.alerts.length === 0 ? (
                <div className="mt-4 rounded-[10px] border border-dashed border-line-strong px-5 py-6 text-[14.5px] text-muted">
                  <Bell className="mb-2 size-5 text-faint" />
                  {isPro ? 'No alerts yet. Watch a job or company and we\'ll tell you when something changes.' : 'Alerts come from watching jobs and companies, which is part of Pro.'}
                  {!isPro && <div className="mt-3"><ButtonLink to="/pricing" size="sm" variant="secondary">See Pro</ButtonLink></div>}
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {q.data.alerts.map((a) => (
                    <li key={a.id} className={`rounded-[8px] border px-4 py-3 ${a.read_at ? 'border-line' : 'border-accent/50 bg-accent-soft/40'}`}>
                      <Link to={a.link ?? '/notifications'} className="block">
                        <p className="text-[14.5px] font-medium text-ink">{a.title}</p>
                        <p className="mt-0.5 text-[13.5px] text-muted">{a.body}</p>
                        <p className="mt-1 font-mono text-[11px] text-faint">{timeAgo(a.created_at)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
