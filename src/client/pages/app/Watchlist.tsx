import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/layout/AppShell';
import { ButtonLink } from '../../components/ui/button';
import { EmptyState, ErrorNote, ProLock, Skeleton, Switch } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useDocumentTitle, useMe } from '../../lib/hooks';

interface Item { id: string; company_id: string; name: string; slug: string; ticker: string | null; monitor: number; events_12mo: number; last_event: string | null; open_jobs: number; created_at: string }

export default function WatchlistPage() {
  useDocumentTitle('Companies');
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['saved-companies'], queryFn: () => api.get<{ items: Item[] }>('/api/me/saved-companies') });
  const isPro = me?.plan === 'pro';

  const toggle = async (it: Item, v: boolean) => {
    try {
      await api.patch(`/api/me/saved-companies/${it.id}`, { monitor: v });
      qc.invalidateQueries({ queryKey: ['saved-companies'] });
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  };
  const remove = async (it: Item) => {
    await api.del(`/api/me/saved-companies/${it.id}`).catch((e: Error) => toast.error(e.message));
    toast.success(`Removed ${it.name}.`);
    qc.invalidateQueries({ queryKey: ['saved-companies'] });
  };

  return (
    <AppShell title="Companies you watch" wide>
      {!isPro && <ProLock className="mb-6" what="Watch companies and get an alert when a new layoff notice or SEC filing shows up." />}
      {q.isLoading && <Skeleton className="h-40" />}
      {q.error && <ErrorNote message={(q.error as Error).message} />}
      {q.data?.items.length === 0 && (
        <EmptyState icon={<Building2 className="size-6" />} title="Not watching any companies" action={<ButtonLink to="/history" variant="secondary">Find one in your history</ButtonLink>}>
          Open a company's profile from any report and hit "Watch". We'll check public records for them on a schedule.
        </EmptyState>
      )}
      {!!q.data?.items.length && (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
          <table className="w-full min-w-[620px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label-mono px-4 py-3 font-normal">Company</th>
                <th className="label-mono px-3 py-3 font-normal">Records, last 12 mo</th>
                <th className="label-mono px-3 py-3 font-normal">Latest record</th>
                <th className="label-mono px-3 py-3 font-normal">Open roles seen</th>
                <th className="label-mono px-3 py-3 font-normal">Alerts</th>
                <th className="px-3 py-3"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((it) => (
                <tr key={it.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3"><Link to={`/companies/${it.slug}`} className="font-medium text-ink hover:underline">{it.name}</Link>{it.ticker && <span className="ml-2 font-mono text-[11.5px] text-faint">{it.ticker}</span>}</td>
                  <td className={`px-3 py-3 font-mono ${it.events_12mo ? 'text-caution' : 'text-muted'}`}>{it.events_12mo}</td>
                  <td className="px-3 py-3 font-mono text-[12.5px] text-muted">{it.last_event ? fmtDate(it.last_event) : '—'}</td>
                  <td className="px-3 py-3 font-mono text-muted">{it.open_jobs}</td>
                  <td className="px-3 py-3"><Switch checked={it.monitor === 1} onChange={(v) => toggle(it, v)} label={`Alerts for ${it.name}`} disabled={!isPro} /></td>
                  <td className="px-3 py-3 text-right"><button onClick={() => remove(it)} className="rounded p-1.5 text-faint hover:text-bad" aria-label={`Stop watching ${it.name}`}><Trash2 className="size-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
