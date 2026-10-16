import { useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CreditCard, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AppShell } from '../../components/layout/AppShell';
import { Button, ButtonLink } from '../../components/ui/button';
import { Dialog } from '../../components/ui/dialog';
import { Field, Input } from '../../components/ui/form';
import { Skeleton, Switch } from '../../components/ui/misc';
import { api, ApiError, download } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useConfig, useDocumentTitle, useMe, useRefreshMe } from '../../lib/hooks';
import type { Prefs } from '../../lib/types';

const TABS = [['profile', 'Profile'], ['notifications', 'Notifications'], ['billing', 'Billing'], ['privacy', 'Privacy & data']] as const;

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-5 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-[52ch]">
        <p className="text-[15px] font-medium text-ink">{title}</p>
        {desc && <p className="mt-0.5 text-[13.5px] text-muted">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function usePrefs() {
  const { data: me } = useMe();
  const refresh = useRefreshMe();
  const save = async (prefs: Partial<Prefs>, name?: string | null) => {
    try {
      await api.patch('/api/me/prefs', { prefs, ...(name !== undefined ? { name } : {}) });
      await refresh();
      toast.success('Saved.');
    } catch (e) {
      toast.error((e as ApiError).message);
    }
  };
  return { prefs: me?.user?.prefs, save };
}

function Profile() {
  const { data: me } = useMe();
  const { prefs, save } = usePrefs();
  const [name, setName] = useState(me?.user?.name ?? '');
  const dash = prefs?.dashboard ?? {};
  return (
    <div>
      <Row title="Email" desc="This is how you sign in. To change it, sign up with the new address and delete this account."><span className="font-mono text-[13.5px] text-ink-2">{me?.user?.email}</span></Row>
      <Row title="Name" desc="Optional. Only used to say hi.">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); save({}, name || null); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="w-[200px]" aria-label="Name" maxLength={80} />
          <Button type="submit" variant="secondary">Save</Button>
        </form>
      </Row>
      <p className="label-mono mt-8">Dashboard</p>
      <Row title="Show stats"><Switch checked={dash.showStats !== false} onChange={(v) => save({ dashboard: { ...dash, showStats: v } })} label="Show stats" /></Row>
      <Row title="Show recently checked"><Switch checked={dash.showRecent !== false} onChange={(v) => save({ dashboard: { ...dash, showRecent: v } })} label="Show recently checked" /></Row>
      <Row title="Show alerts"><Switch checked={dash.showAlerts !== false} onChange={(v) => save({ dashboard: { ...dash, showAlerts: v } })} label="Show alerts" /></Row>
      <p className="mt-6 text-[13px] text-faint">Member since {fmtDate(me?.user?.createdAt)}.</p>
    </div>
  );
}

function Notifications() {
  const { prefs, save } = usePrefs();
  const { data: me } = useMe();
  if (!prefs) return <Skeleton className="h-40" />;
  const pro = me?.plan === 'pro';
  return (
    <div>
      <Row title="Email me about changes" desc="When a watched job closes, reopens, or changes, or a watched company gets a new public record. Pro.">
        <Switch checked={prefs.emailAlerts} onChange={(v) => save({ emailAlerts: v })} label="Email alerts" disabled={!pro} />
      </Row>
      <Row title="Weekly digest" desc="A Monday email summarizing what changed. Skipped if you aren't watching anything. Pro.">
        <Switch checked={prefs.weeklyDigest} onChange={(v) => save({ weeklyDigest: v })} label="Weekly digest" disabled={!pro} />
      </Row>
      <Row title="Deadline reminders by email" desc="For reminders you set on saved jobs. They always appear in Alerts too.">
        <Switch checked={prefs.deadlineEmails} onChange={(v) => save({ deadlineEmails: v })} label="Deadline emails" />
      </Row>
    </div>
  );
}

function Billing() {
  const { data: me } = useMe();
  const { data: cfg } = useConfig();
  const refresh = useRefreshMe();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['billing'], queryFn: () => api.get<{ mode: string; plan: string; subscription: null | { status: string; provider: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } }>('/api/billing/status') });

  useEffect(() => {
    if (params.get('checkout') === 'success') {
      toast.success("Thanks! Your payment went through. Pro will switch on as soon as Stripe confirms it, usually within a few seconds.");
      const t = setTimeout(() => { refresh(); qc.invalidateQueries({ queryKey: ['billing'] }); }, 3000);
      return () => clearTimeout(t);
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(null);
      refresh();
      qc.invalidateQueries({ queryKey: ['billing'] });
    }
  };
  const sub = status.data?.subscription;
  const pro = me?.plan === 'pro';
  const dev = cfg?.billingMode === 'dev';

  return (
    <div>
      <div className="panel flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label-mono">Current plan</p>
          <p className="mt-1 font-serif text-[28px] text-ink">{pro ? 'Pro' : 'Free'}</p>
          {sub && (
            <p className="mt-1 text-[14px] text-muted">
              {sub.status === 'past_due' ? <span className="text-caution">Your last payment failed. We'll keep retrying, and you keep Pro meanwhile.</span>
                : sub.cancelAtPeriodEnd ? `Cancels on ${fmtDate(sub.currentPeriodEnd)}. You keep Pro until then.`
                  : sub.status === 'canceled' ? 'Canceled.'
                    : sub.currentPeriodEnd ? `Renews ${fmtDate(sub.currentPeriodEnd)}.` : ''}
              {sub.provider === 'dev' && <span className="ml-2 font-mono text-[11px] text-caution">simulated</span>}
            </p>
          )}
        </div>
        {pro ? (
          <Button variant="secondary" icon={<CreditCard className="size-4" />} loading={busy === 'portal'} onClick={() => run('portal', async () => {
            const r = await api.post<{ url: string }>('/api/billing/portal');
            if (r.url.startsWith('http')) window.location.href = r.url; else toast('Use the simulator controls below.');
          })}>{sub?.provider === 'dev' ? 'Manage (simulated)' : 'Manage billing'}</Button>
        ) : (
          <Button loading={busy === 'checkout'} onClick={() => run('checkout', async () => {
            const r = await api.post<{ url: string; simulated: boolean }>('/api/billing/checkout');
            if (r.simulated) nav(r.url); else window.location.href = r.url;
          })}>Upgrade to Pro, ${cfg?.pricing.pro.monthlyUsd ?? 7.99}/mo</Button>
        )}
      </div>
      {!pro && <p className="mt-3 text-[13.5px] text-muted"><Link to="/pricing" className="link">Compare plans</Link></p>}
      {pro && sub?.provider === 'stripe' && <p className="mt-3 text-[13.5px] text-muted">Card changes, invoices, and cancellation are handled on Stripe's secure billing page.</p>}

      {dev && sub && (
        <div className="mt-8 rounded-[10px] border border-dashed border-caution/60 px-5 py-5">
          <p className="font-mono text-[11px] uppercase tracking-wider text-caution">Billing simulator · development only</p>
          <p className="mt-1 text-[13.5px] text-muted">These buttons change the simulated subscription so you can test what each state looks like. No money moves.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {([
              ['cancel_at_period_end', 'Cancel at period end'],
              ['resume', 'Resume'],
              ['payment_failed', 'Simulate failed payment'],
              ['expire', 'Simulate expired period'],
              ['cancel_now', 'Cancel immediately'],
            ] as const).map(([a, label]) => (
              <Button key={a} size="sm" variant="secondary" loading={busy === a} onClick={() => run(a, () => api.post('/api/billing/dev/action', { action: a }))}>{label}</Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Privacy() {
  const { data: me } = useMe();
  const { prefs, save } = usePrefs();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const del = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.del('/api/me', { confirmEmail: confirm });
      await qc.invalidateQueries();
      toast('Your account and data have been deleted.');
      nav('/');
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Row title="Share new reports by default" desc="When on, reports you run get a public link straight away. You can still make any one private.">
        <Switch checked={!!prefs?.defaultPublicReports} onChange={(v) => save({ defaultPublicReports: v })} label="Public by default" />
      </Row>
      <Row title="Download your data" desc="Everything we hold about you, as a JSON file: account, reports, saved jobs and notes, alerts.">
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => download('/api/me/data', 'jobsignal-my-data.json').catch((e: Error) => toast.error(e.message))}>Download</Button>
      </Row>
      <Row title="Delete account" desc="Removes your account, history, saved jobs, notes, and alerts for good. Shared report links stop working.">
        <Button variant="danger" onClick={() => setOpen(true)}>Delete account</Button>
      </Row>
      <Dialog open={open} onOpenChange={setOpen} title="Delete your account?" description="This can't be undone. If you have Pro through Stripe, cancel it first so you aren't charged again."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Keep my account</Button><Button variant="danger" onClick={del} loading={busy} disabled={confirm.trim().toLowerCase() !== me?.user?.email}>Delete everything</Button></>}>
        <Field label={`Type ${me?.user?.email} to confirm`} htmlFor="del-confirm" error={err}>
          <Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
      </Dialog>
    </div>
  );
}

export default function AccountPage() {
  const { tab = 'profile' } = useParams();
  useDocumentTitle('Account');
  const active = TABS.find(([k]) => k === tab)?.[0] ?? 'profile';
  return (
    <AppShell title="Account">
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([k, label]) => (
          <Link key={k} to={`/account/${k}`} role="tab" aria-selected={active === k} className={clsx('-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[14px]', active === k ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink')}>{label}</Link>
        ))}
      </div>
      {active === 'profile' && <Profile />}
      {active === 'notifications' && <Notifications />}
      {active === 'billing' && <Billing />}
      {active === 'privacy' && <Privacy />}
      <p className="mt-10 text-[13px] text-faint">Need help? <ButtonLink to="/report-a-problem" variant="link" size="sm">Get in touch</ButtonLink></p>
    </AppShell>
  );
}
