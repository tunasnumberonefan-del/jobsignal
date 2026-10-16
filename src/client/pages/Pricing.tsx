import { clsx } from 'clsx';
import { Check, Minus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, ButtonLink } from '../components/ui/button';
import { api, ApiError } from '../lib/api';
import { useConfig, useDocumentTitle, useMe } from '../lib/hooks';

const ROWS: Array<[string, string | boolean, string | boolean]> = [
  ['Job checks', '3 a day', '300 a month'],
  ['Posting verification and scam-pattern checks', true, true],
  ['Layoff notices and SEC filings', true, true],
  ['Source links for every finding', true, true],
  ['Share reports', true, true],
  ['Saved jobs and history', 'Up to 25', 'Unlimited'],
  ['Every finding in full, with financial figures', false, true],
  ['Watch jobs: alerts when they close, reopen, or change', false, true],
  ['Watch companies: alerts on new layoff notices and filings', false, true],
  ['Posting change history (see exactly what was edited)', false, true],
  ['Compare jobs side by side', false, true],
  ['Weekly email digest', false, true],
  ['Export to CSV, JSON, and PDF', false, true],
];

function Cell({ v }: { v: string | boolean }) {
  if (v === true) return <Check className="mx-auto size-4.5 text-good" aria-label="Included" />;
  if (v === false) return <Minus className="mx-auto size-4 text-faint" aria-label="Not included" />;
  return <span className="text-[14px] text-ink">{v}</span>;
}

export function PricingTable() {
  const { data: me } = useMe();
  const { data: cfg } = useConfig();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const price = cfg?.pricing.pro.monthlyUsd ?? 7.99;

  const upgrade = async () => {
    if (!me?.user) return nav('/sign-in?next=/pricing');
    setBusy(true);
    try {
      const r = await api.post<{ url: string; simulated: boolean }>('/api/billing/checkout');
      if (r.simulated) nav(r.url);
      else window.location.href = r.url;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Checkout failed.');
    } finally {
      setBusy(false);
    }
  };

  const isPro = me?.plan === 'pro';
  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
      <div className="grid grid-cols-[1fr_100px_100px] sm:grid-cols-[1fr_180px_180px]">
        <div className="border-b border-line px-4 py-6 sm:px-6" />
        <div className="border-b border-l border-line px-3 py-6 text-center">
          <p className="font-serif text-[22px] text-ink">Free</p>
          <p className="mt-1 font-mono text-[13px] text-muted">$0</p>
        </div>
        <div className="relative border-b border-l border-line bg-accent-soft/50 px-3 py-6 text-center">
          <p className="font-serif text-[22px] text-ink">Pro</p>
          <p className="mt-1 font-mono text-[13px] text-ink-2">${price}/mo</p>
        </div>
        {ROWS.map(([label, free, pro], i) => (
          <div key={label} className="contents">
            <div className={clsx('px-4 py-3 text-[14px] text-ink-2 sm:px-6', i && 'border-t border-line')}>{label}</div>
            <div className={clsx('grid place-items-center border-l border-line px-2 py-3 text-center', i && 'border-t')}><Cell v={free} /></div>
            <div className={clsx('grid place-items-center border-l border-line bg-accent-soft/50 px-2 py-3 text-center', i && 'border-t')}><Cell v={pro} /></div>
          </div>
        ))}
        <div className="border-t border-line px-4 py-5 sm:px-6">
          <p className="text-[12.5px] text-faint">Cancel any time from your account. You keep Pro until the end of the period you paid for.</p>
        </div>
        <div className="grid place-items-center border-l border-t border-line px-2 py-5">
          {me?.user ? <span className="text-[13px] text-muted">{isPro ? '' : 'Your plan'}</span> : <ButtonLink to="/check" variant="secondary" size="sm">Start</ButtonLink>}
        </div>
        <div className="grid place-items-center border-l border-t border-line bg-accent-soft/50 px-2 py-5">
          {isPro ? <span className="text-[13px] font-medium text-good">Your plan</span> : cfg?.billingMode === 'off' ? <span className="text-[13px] text-muted">Coming soon</span> : <Button size="sm" onClick={upgrade} loading={busy}>Get Pro</Button>}
        </div>
      </div>
    </div>
  );
}

export function Pricing() {
  useDocumentTitle('Pricing');
  const [params] = useSearchParams();
  return (
    <main id="main" className="mx-auto max-w-[980px] px-4 py-14 sm:px-6 sm:py-20">
      {params.get('checkout') === 'canceled' && (
        <p className="mb-8 rounded-[8px] border border-line bg-surface px-4 py-3 text-[14px] text-ink-2">Checkout canceled. Nothing was charged.</p>
      )}
      <p className="label-mono">Pricing</p>
      <h1 className="mt-3 text-[44px] leading-tight text-ink">Free does the important part.</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] text-ink-2">
        Every check, on every plan, includes the scam-pattern checks, layoff records, and sources. Pro adds the things that cost us real time and requests to run: rechecking jobs for you, alerts, history, and comparisons.
      </p>
      <div className="mt-12"><PricingTable /></div>
      <div className="mt-14 grid gap-8 text-[15px] sm:grid-cols-2">
        <div>
          <h2 className="text-[22px] text-ink">Why charge at all?</h2>
          <p className="mt-2 text-muted">Monitoring means checking job boards and government data on a schedule, for you, every day. Pro pays for that. There are no ads and we don't sell data, so this is the only way the lights stay on.</p>
        </div>
        <div>
          <h2 className="text-[22px] text-ink">Student or between jobs and broke?</h2>
          <p className="mt-2 text-muted">The free plan is meant to be genuinely useful on its own, not a teaser. Three checks a day is enough for most careful job searches.</p>
        </div>
      </div>
    </main>
  );
}
