import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { api, ApiError } from '../../lib/api';
import { useConfig, useDocumentTitle, useMe } from '../../lib/hooks';

/**
 * Stand-in for Stripe Checkout when BILLING_MODE=dev. It says it's fake in three places
 * on purpose. The server refuses this flow in production.
 */
export default function DevCheckout() {
  useDocumentTitle('Simulated checkout');
  const { data: me } = useMe();
  const { data: cfg } = useConfig();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (cfg && cfg.billingMode !== 'dev') return <Navigate to="/pricing" replace />;
  if (me && !me.user) return <Navigate to="/sign-in?next=/pricing" replace />;
  const complete = async () => {
    setBusy(true);
    try {
      await api.post('/api/billing/dev/complete');
      await qc.invalidateQueries();
      toast.success('Simulated subscription is active. No payment was taken.');
      nav('/account/billing');
    } catch (e) {
      toast.error((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main id="main" className="mx-auto max-w-[480px] px-4 py-16">
      <div className="rounded-[12px] border-2 border-dashed border-caution/70 bg-surface p-6">
        <p className="font-mono text-[11px] uppercase tracking-wider text-caution">Simulated checkout · no real payment</p>
        <h1 className="mt-3 text-[30px] leading-tight text-ink">JobSignal Pro</h1>
        <p className="mt-1 font-mono text-[14px] text-ink-2">${cfg?.pricing.pro.monthlyUsd ?? 7.99} / month</p>
        <p className="mt-5 text-[14.5px] text-muted">
          You're running JobSignal in development mode, so this page stands in for Stripe Checkout. Clicking the button activates a simulated Pro subscription on your local database. Nothing is charged and no card is needed.
        </p>
        <div className="mt-6 flex gap-2">
          <Button onClick={complete} loading={busy}>Activate simulated Pro</Button>
          <Button variant="ghost" onClick={() => nav('/pricing?checkout=canceled')}>Cancel</Button>
        </div>
      </div>
    </main>
  );
}
