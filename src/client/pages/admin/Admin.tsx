import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/layout/AppShell';
import { Button } from '../../components/ui/button';
import { Input, Select, Textarea } from '../../components/ui/form';
import { ErrorNote, Skeleton, Switch } from '../../components/ui/misc';
import { api, ApiError } from '../../lib/api';
import { fmtDate, postingLabel, timeAgo } from '../../lib/format';
import { useDocumentTitle, useMe } from '../../lib/hooks';

const SECTIONS = [
  ['overview', 'Overview'], ['users', 'Users'], ['billing', 'Billing'], ['sources', 'Sources & jobs'],
  ['flags', 'Flagged'], ['companies', 'Data fixes'], ['settings', 'Flags & notices'], ['feedback', 'Feedback'], ['audit', 'Audit log'],
] as const;

type AnyRow = Record<string, string | number | null>;

function useAdmin<T>(key: string, path: string) {
  return useQuery({ queryKey: ['admin', key, path], queryFn: () => api.get<T>(path) });
}

function Table({ rows, cols, empty = 'Nothing here.' }: { rows: AnyRow[]; cols: Array<[string, string, ((r: AnyRow) => React.ReactNode)?]>; empty?: string }) {
  if (!rows.length) return <p className="text-[14px] text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line bg-surface">
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-line text-left">{cols.map(([k, l]) => <th key={k} className="label-mono whitespace-nowrap px-3 py-2.5 font-normal">{l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line last:border-0 align-top">
              {cols.map(([k, , render]) => <td key={k} className="px-3 py-2 text-ink-2">{render ? render(r) : (r[k] ?? '—')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Hand-rolled bar chart: 30 days of reports. Labeled, no library. */
function BarChart({ data }: { data: Array<{ day: string; n: number }> }) {
  const days: Array<{ day: string; n: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ day: d, n: data.find((x) => x.day === d)?.n ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.n));
  return (
    <figure>
      <div className="flex h-[140px] items-end gap-[3px] border-b border-line-strong" role="img" aria-label={`Reports per day, last 30 days. Peak ${max}.`}>
        {days.map((d) => (
          <div key={d.day} className="group relative flex-1">
            <div className="rounded-t-[2px] bg-accent/80 transition-colors group-hover:bg-accent" style={{ height: `${(d.n / max) * 130 + (d.n ? 2 : 0)}px` }} />
            <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-bg group-hover:block">{d.day.slice(5)}: {d.n}</span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1.5 flex justify-between font-mono text-[10.5px] text-faint"><span>{days[0]!.day.slice(5)}</span><span>reports per day · peak {max}</span><span>today</span></figcaption>
    </figure>
  );
}

function Overview() {
  const q = useAdmin<{ counts: Record<string, number>; reportsPerDay: Array<{ day: string; n: number }>; postingLabels7d: Array<{ posting_label: string; n: number }>; mrrUsd: number }>('overview', '/api/admin/overview');
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorNote message={(q.error as Error).message} />;
  const c = q.data!.counts;
  const tiles: Array<[string, number | string]> = [
    ['Users', c.users!], ['New this week', c.users_7d!], ['Pro active', c.pro_active!], ['Est. MRR', `$${q.data!.mrrUsd}`],
    ['Analyses', c.analyses!], ['Analyses 24h', c.analyses_24h!], ['Jobs tracked', c.jobs!], ['Companies', c.companies!],
    ['WARN notices', c.warn_notices!], ['Watched jobs', c.watched_jobs!], ['Open flags', c.open_flags!], ['Helpful (7d)', c.helpful_pct == null ? '—' : `${c.helpful_pct}%`],
  ];
  const labels = q.data!.postingLabels7d;
  const total = labels.reduce((s, l) => s + l.n, 0) || 1;
  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
        {tiles.map(([k, v]) => <div key={k} className="bg-surface px-4 py-3"><dt className="label-mono">{k}</dt><dd className="mt-1 font-serif text-[26px] text-ink">{v}</dd></div>)}
      </dl>
      <BarChart data={q.data!.reportsPerDay} />
      <div>
        <p className="label-mono mb-3">Posting results, last 7 days</p>
        {labels.length === 0 ? <p className="text-[14px] text-muted">No analyses yet.</p> : (
          <ul className="space-y-2">
            {labels.map((l) => {
              const p = postingLabel(l.posting_label);
              return (
                <li key={l.posting_label} className="grid grid-cols-[200px_1fr_40px] items-center gap-3 text-[13px]">
                  <span className="text-ink-2">{p.text}</span>
                  <span className="h-2.5 rounded-full bg-bg-sunk"><span className={clsx('block h-full rounded-full', { good: 'bg-good', caution: 'bg-caution', bad: 'bg-bad', neutral: 'bg-neutral' }[p.tone])} style={{ width: `${(l.n / total) * 100}%` }} /></span>
                  <span className="text-right font-mono text-muted">{l.n}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Users() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const r = useAdmin<{ items: AnyRow[] }>('users', `/api/admin/users?q=${encodeURIComponent(search)}`);
  const suspend = async (id: string, suspended: boolean) => {
    try {
      await api.patch(`/api/admin/users/${id}`, { suspended });
      toast.success(suspended ? 'Suspended and signed out.' : 'Unsuspended.');
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => { e.preventDefault(); setSearch(q); }} className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email" className="max-w-[320px]" /><Button type="submit" variant="secondary">Search</Button></form>
      {r.data && <Table rows={r.data.items} cols={[
        ['email', 'Email'], ['role', 'Role'], ['plan', 'Plan', (x) => (x.plan ? `${x.plan} (${x.sub_status}${x.provider === 'dev' ? ', sim' : ''})` : 'free')],
        ['reports', 'Reports'], ['created_at', 'Joined', (x) => fmtDate(x.created_at as string)], ['last_login_at', 'Last in', (x) => timeAgo(x.last_login_at as string)],
        ['id', '', (x) => <button className="text-[12.5px] link" onClick={() => suspend(x.id as string, !x.suspended_at)}>{x.suspended_at ? 'Unsuspend' : 'Suspend'}</button>],
      ]} />}
    </div>
  );
}

function BillingAdmin() {
  const r = useAdmin<{ items: AnyRow[]; paymentEvents: AnyRow[] }>('subs', '/api/admin/subscriptions');
  if (!r.data) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-8">
      <Table rows={r.data.items} empty="No subscriptions yet." cols={[['email', 'User'], ['status', 'Status'], ['provider', 'Provider'], ['current_period_end', 'Period end', (x) => fmtDate(x.current_period_end as string)], ['cancel_at_period_end', 'Canceling', (x) => (x.cancel_at_period_end ? 'yes' : '')], ['updated_at', 'Updated', (x) => timeAgo(x.updated_at as string)]]} />
      <div>
        <p className="label-mono mb-2">Webhook events</p>
        <Table rows={r.data.paymentEvents} empty="No webhook events received." cols={[['type', 'Type'], ['received_at', 'Received', (x) => timeAgo(x.received_at as string)], ['processed_at', 'Processed', (x) => (x.processed_at ? 'yes' : <span className="text-caution">no</span>)], ['error', 'Error']]} />
      </div>
    </div>
  );
}

const TASKS: Array<[string, string]> = [
  ['warn_ingest', 'Pull WARN notices now'], ['job_recheck', 'Recheck watched jobs'], ['company_watch', 'Check watched companies'],
  ['deadline_reminders', 'Send due reminders'], ['weekly_digest', 'Send weekly digest'], ['prune', 'Prune old data'],
];

function Sources() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const r = useAdmin<{ summary: AnyRow[]; failures: AnyRow[]; jobRuns: AnyRow[] }>('providers', '/api/admin/providers');
  const run = async (t: string) => {
    setBusy(t);
    try {
      const res = await api.post<{ ok: boolean; result: unknown }>(`/api/admin/tasks/${t}`);
      toast.success(`Done: ${JSON.stringify(res.result).slice(0, 120)}`);
      qc.invalidateQueries({ queryKey: ['admin'] });
    } catch (e) { toast.error((e as ApiError).message); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">{TASKS.map(([k, l]) => <Button key={k} size="sm" variant="secondary" icon={<Play className="size-3.5" />} loading={busy === k} onClick={() => run(k)}>{l}</Button>)}</div>
      <div><p className="label-mono mb-2">Provider health, last 24h</p>{r.data && <Table rows={r.data.summary} empty="No outbound requests in the last day." cols={[['provider', 'Provider'], ['total', 'Requests'], ['ok', 'OK', (x) => { const pct = Math.round(((x.ok as number) / (x.total as number)) * 100); return <span className={pct < 90 ? 'text-bad' : 'text-good'}>{pct}%</span>; }], ['avg_ms', 'Avg ms'], ['last_at', 'Last', (x) => timeAgo(x.last_at as string)]]} />}</div>
      <div><p className="label-mono mb-2">Background jobs</p>{r.data && <Table rows={r.data.jobRuns} empty="No runs yet. The cron runs every 6 hours in production." cols={[['name', 'Task'], ['started_at', 'Started', (x) => timeAgo(x.started_at as string)], ['ok', 'Result', (x) => (x.ok === 1 ? <span className="text-good">ok</span> : x.ok === 0 ? <span className="text-bad">failed</span> : 'running')], ['summary', 'Summary', (x) => <span className="font-mono text-[11.5px]">{(x.summary ?? x.error ?? '') as string}</span>]]} />}</div>
      <div><p className="label-mono mb-2">Recent failures</p>{r.data && <Table rows={r.data.failures} empty="No failures logged." cols={[['provider', 'Provider'], ['operation', 'Op'], ['status_code', 'HTTP'], ['error', 'Error'], ['created_at', 'When', (x) => timeAgo(x.created_at as string)]]} />}</div>
    </div>
  );
}

function Flags() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('open');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const r = useAdmin<{ items: AnyRow[] }>('flags', `/api/admin/flags?status=${status}`);
  const resolve = async (id: string, s: string) => {
    await api.patch(`/api/admin/flags/${id}`, { status: s, note: notes[id] });
    toast.success(`Marked ${s}.`);
    qc.invalidateQueries({ queryKey: ['admin', 'flags'] });
  };
  return (
    <div className="space-y-4">
      <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-[180px]"><option value="open">Open</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></Select>
      {r.data?.items.length === 0 && <p className="text-[14px] text-muted">No {status} flags.</p>}
      <ul className="space-y-3">
        {r.data?.items.map((f) => (
          <li key={f.id as string} className="panel px-4 py-4">
            <p className="font-mono text-[11px] uppercase text-faint">{(f.reason as string).replace(/_/g, ' ')} · {timeAgo(f.created_at as string)}</p>
            <p className="mt-1 whitespace-pre-wrap text-[14px] text-ink">{f.detail}</p>
            <p className="mt-2 text-[13px] text-muted">
              {f.report_slug && <Link className="link mr-3" to={`/r/${f.report_slug}`}>report</Link>}
              {f.company_slug && <Link className="link mr-3" to={`/companies/${f.company_slug}`}>{f.company_name}</Link>}
              {f.contact_email && <span>contact: {f.contact_email}</span>}
            </p>
            {status === 'open' && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Textarea rows={1} placeholder="Resolution note (optional)" value={notes[f.id as string] ?? ''} onChange={(e) => setNotes({ ...notes, [f.id as string]: e.target.value })} className="flex-1" />
                <Button size="sm" onClick={() => resolve(f.id as string, 'resolved')}>Resolve</Button>
                <Button size="sm" variant="secondary" onClick={() => resolve(f.id as string, 'dismissed')}>Dismiss</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Companies() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<AnyRow | null>(null);
  const list = useAdmin<{ items: AnyRow[] }>('companies', `/api/admin/companies?q=${encodeURIComponent(search)}`);
  const events = useQuery({ queryKey: ['admin', 'events', sel?.id], queryFn: () => api.get<{ items: AnyRow[] }>(`/api/admin/companies/${sel!.id}/events`), enabled: !!sel });
  const hide = async (id: string, hidden: boolean) => {
    await api.patch(`/api/admin/events/${id}`, { hidden, reason: 'admin correction' });
    qc.invalidateQueries({ queryKey: ['admin', 'events'] });
  };
  const clearCik = async () => {
    await api.patch(`/api/admin/companies/${sel!.id}`, { clearCik: true });
    toast.success('SEC match removed. It will not be re-matched for 7 days.');
    qc.invalidateQueries({ queryKey: ['admin'] });
  };
  return (
    <div className="space-y-5">
      <p className="text-[14px] text-muted">Hide public records that were matched to the wrong company, or remove a bad SEC match. Everything here is reversible and logged.</p>
      <form onSubmit={(e) => { e.preventDefault(); setSearch(q); }} className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name" className="max-w-[320px]" /><Button type="submit" variant="secondary">Search</Button></form>
      {list.data && <Table rows={list.data.items} cols={[['name', 'Company', (x) => <button className="link text-ink" onClick={() => setSel(x)}>{x.name}</button>], ['domain', 'Domain'], ['ticker', 'Ticker'], ['events', 'Events'], ['aliases', 'Aliases']]} />}
      {sel && (
        <div className="panel px-4 py-4">
          <div className="flex items-center justify-between"><p className="font-serif text-[20px]">{sel.name}</p>{sel.cik && <Button size="sm" variant="secondary" onClick={clearCik}>Remove SEC match</Button>}</div>
          {events.data && <div className="mt-3"><Table rows={events.data.items} empty="No events." cols={[['event_date', 'Date'], ['kind', 'Kind'], ['title', 'Title'], ['match_quality', 'Match'], ['hidden_at', '', (x) => <button className="text-[12.5px] link" onClick={() => hide(x.id as string, !x.hidden_at)}>{x.hidden_at ? 'Unhide' : 'Hide'}</button>]]} /></div>}
        </div>
      )}
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const flags = useAdmin<{ items: AnyRow[] }>('ff', '/api/admin/feature-flags');
  const ann = useAdmin<{ items: AnyRow[] }>('ann', '/api/admin/announcements');
  const [msg, setMsg] = useState('');
  const [level, setLevel] = useState('info');
  const toggle = async (key: string, enabled: boolean) => {
    await api.patch(`/api/admin/feature-flags/${key}`, { enabled });
    qc.invalidateQueries({ queryKey: ['admin', 'ff'] });
    qc.invalidateQueries({ queryKey: ['config'] });
  };
  const post = async () => {
    try {
      await api.post('/api/admin/announcements', { message: msg, level });
      setMsg('');
      qc.invalidateQueries({ queryKey: ['admin', 'ann'] });
      qc.invalidateQueries({ queryKey: ['config'] });
    } catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-10">
      <div>
        <p className="label-mono mb-2">Feature flags</p>
        <ul className="divide-y divide-line rounded-[10px] border border-line bg-surface">
          {flags.data?.items.map((f) => (
            <li key={f.key as string} className="flex items-center justify-between gap-4 px-4 py-3">
              <div><p className="font-mono text-[13px] text-ink">{f.key}</p><p className="text-[13px] text-muted">{f.description}</p></div>
              <Switch checked={f.enabled === 1} onChange={(v) => toggle(f.key as string, v)} label={f.key as string} />
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="label-mono mb-2">Site notice</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. SEC lookups are slow today. Reports may be missing filings." maxLength={300} />
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="sm:w-[130px]"><option value="info">Info</option><option value="warning">Warning</option></Select>
          <Button onClick={post} disabled={msg.trim().length < 3}>Post</Button>
        </div>
        {ann.data && <div className="mt-3"><Table rows={ann.data.items} empty="No notices." cols={[['message', 'Message'], ['level', 'Level'], ['created_at', 'Posted', (x) => timeAgo(x.created_at as string)], ['active', 'Active', (x) => <Switch checked={x.active === 1} label="Active" onChange={async (v) => { await api.patch(`/api/admin/announcements/${x.id}`, { active: v }); qc.invalidateQueries({ queryKey: ['admin', 'ann'] }); qc.invalidateQueries({ queryKey: ['config'] }); }} />]]} /></div>}
      </div>
    </div>
  );
}

function FeedbackAdmin() {
  const r = useAdmin<{ items: AnyRow[] }>('fb', '/api/admin/feedback');
  return r.data ? <Table rows={r.data.items} empty="No feedback yet." cols={[['helpful', 'Useful?', (x) => (x.helpful === 1 ? 'yes' : x.helpful === 0 ? 'no' : '—')], ['comment', 'Comment'], ['slug', 'Report', (x) => (x.slug ? <Link className="link" to={`/r/${x.slug}`}>open</Link> : '—')], ['created_at', 'When', (x) => timeAgo(x.created_at as string)]]} /> : <Skeleton className="h-40" />;
}

function Audit() {
  const r = useAdmin<{ items: AnyRow[] }>('audit', '/api/admin/audit');
  return r.data ? <Table rows={r.data.items} empty="No admin actions yet." cols={[['created_at', 'When', (x) => fmtDate(x.created_at as string, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })], ['admin_email', 'Admin'], ['action', 'Action'], ['target', 'Target'], ['detail', 'Detail', (x) => <span className="font-mono text-[11.5px]">{x.detail}</span>]]} /> : <Skeleton className="h-40" />;
}

export default function AdminPage() {
  useDocumentTitle('Admin');
  const { section = 'overview' } = useParams();
  const { data: me } = useMe();
  if (me?.user && me.user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return (
    <AppShell title="Admin" wide>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {SECTIONS.map(([k, l]) => <Link key={k} role="tab" aria-selected={section === k} to={`/admin/${k}`} className={clsx('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13.5px]', section === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}>{l}</Link>)}
      </div>
      {section === 'overview' && <Overview />}
      {section === 'users' && <Users />}
      {section === 'billing' && <BillingAdmin />}
      {section === 'sources' && <Sources />}
      {section === 'flags' && <Flags />}
      {section === 'companies' && <Companies />}
      {section === 'settings' && <Settings />}
      {section === 'feedback' && <FeedbackAdmin />}
      {section === 'audit' && <Audit />}
    </AppShell>
  );
}
