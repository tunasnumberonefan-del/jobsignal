import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Building2, Eye, Flag } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CompanyEvent, EmployerEvidence, FinancialPoint } from '@shared/types';
import { Coverage, Timeline } from '../components/report/EmployerPanel';
import { FlagDialog } from '../components/report/FlagDialog';
import { Button, ButtonLink } from '../components/ui/button';
import { EmptyState, ErrorNote, ProLock, Skeleton } from '../components/ui/misc';
import { api, ApiError } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useDocumentTitle, useMe } from '../lib/hooks';

interface CompanyResponse {
  company: { id: string; slug: string; name: string; domain: string | null; ticker: string | null; cik: string | null; created_at: string };
  events: CompanyEvent[];
  eventsLocked: number;
  jobsTracked: number;
  jobsOpen: number;
  financials: FinancialPoint[];
  financialsLocked: boolean;
  checked: EmployerEvidence['checked'] | null;
  latestPeriodicFiling: { form: string; date: string; url: string } | null;
  watching: boolean;
}

export default function CompanyPage() {
  const { slug = '' } = useParams();
  const { data: me } = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [flag, setFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['company', slug], queryFn: () => api.get<CompanyResponse>(`/api/companies/${slug}`) });
  useDocumentTitle(q.data ? `${q.data.company.name}: public records` : 'Company');

  const watch = async () => {
    if (!me?.user) return nav(`/sign-in?next=/companies/${slug}`);
    if (!me.entitlements.monitoring) {
      toast('Watching companies is part of Pro.', { action: { label: 'See Pro', onClick: () => nav('/pricing') } });
      return;
    }
    setBusy(true);
    try {
      if (q.data!.watching) await api.del(`/api/me/saved-companies/${q.data!.company.id}`);
      else await api.post('/api/me/saved-companies', { companyId: q.data!.company.id });
      toast.success(q.data!.watching ? 'Stopped watching.' : "Watching. We'll alert you about new layoff notices and filings.");
      qc.invalidateQueries({ queryKey: ['company', slug] });
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <main className="mx-auto max-w-[980px] px-4 py-12 sm:px-6"><Skeleton className="h-11 w-80" /><Skeleton className="mt-8 h-56 w-full" /></main>;
  if (q.error) {
    return (
      <main id="main" className="mx-auto max-w-[980px] px-4 py-12 sm:px-6">
        {q.error instanceof ApiError && q.error.status === 404
          ? <EmptyState icon={<Building2 className="size-6" />} title="No profile for this company yet" action={<ButtonLink to="/check">Check one of their jobs</ButtonLink>}>Company profiles are built from the jobs people check. Run one of their listings and the profile will appear.</EmptyState>
          : <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} />}
      </main>
    );
  }
  const d = q.data!;
  const profile: EmployerEvidence = {
    name: d.company.name,
    ticker: d.company.ticker ?? undefined,
    checked: d.checked ?? { warn: { states: [], ran: false }, sec: { ran: false, matched: false } },
    events: d.events,
    financials: d.financials,
    sources: [],
  };
  return (
    <main id="main" className="mx-auto max-w-[980px] px-4 py-10 sm:px-6 sm:py-14">
      <p className="label-mono">Company profile</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[40px] leading-tight text-ink">{d.company.name}</h1>
          <p className="mt-1 text-[14.5px] text-muted">
            {[d.company.domain, d.company.ticker && `Ticker ${d.company.ticker}`, `${d.jobsOpen} open role${d.jobsOpen === 1 ? '' : 's'} seen`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Eye className="size-4" />} onClick={watch} loading={busy}>{d.watching ? 'Watching' : 'Watch'}</Button>
          <Button variant="ghost" icon={<Flag className="size-4" />} onClick={() => setFlag(true)}>Report a mistake</Button>
        </div>
      </div>

      <div className="mt-8 panel px-5 py-6 sm:px-6">
        <Coverage profile={profile} />
        <div className="mt-6">
          <p className="label-mono mb-1">Public record timeline · last 2 years</p>
          <Timeline events={d.events} />
        </div>
        {d.events.length > 0 ? (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {d.events.map((e, i) => (
              <li key={i} className="grid gap-x-4 py-3 sm:grid-cols-[110px_1fr]">
                <span className="font-mono text-[12.5px] text-muted">{fmtDate(e.date)}</span>
                <div>
                  <p className="text-[15px] text-ink">{e.title}{e.magnitude ? <span className="text-muted"> · {e.magnitude.toLocaleString()} people</span> : null}</p>
                  {e.detail && <p className="text-[13.5px] text-muted">{e.detail}</p>}
                  {e.source.url && <a className="inline-flex items-center gap-0.5 font-mono text-[11.5px] text-faint hover:text-ink" href={e.source.url} target="_blank" rel="noopener noreferrer nofollow">{e.source.name} <ArrowUpRight className="size-3" /></a>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[14.5px] text-muted">
            No layoff notices or material SEC events found in the sources we check. That's not a guarantee. Our WARN data covers {profile.checked.warn.states.join(' and ') || 'only some states'}, and private companies don't file with the SEC.
          </p>
        )}
        {d.eventsLocked > 0 && <ProLock className="mt-4" what={`${d.eventsLocked} more records are in the full timeline.`} />}
        {d.latestPeriodicFiling && (
          <p className="mt-5 text-[13.5px] text-muted">Latest periodic filing: <a className="link text-ink" href={d.latestPeriodicFiling.url} target="_blank" rel="noopener noreferrer nofollow">{d.latestPeriodicFiling.form}, {fmtDate(d.latestPeriodicFiling.date)}</a></p>
        )}
        {d.financialsLocked && <ProLock className="mt-4" what="Revenue and income from SEC filings." />}
      </div>

      <p className="mt-8 max-w-[70ch] text-[13px] leading-relaxed text-faint">
        This page lists public records matched to this company by name, website, and job board. Matching is conservative, but mistakes happen. If something here belongs to a different company, please tell us and we'll correct it.
      </p>
      <FlagDialog open={flag} onOpenChange={setFlag} companySlug={slug} />
    </main>
  );
}
