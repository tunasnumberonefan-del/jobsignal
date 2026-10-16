import { useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Field, Input } from '../components/ui/form';
import { ErrorNote, Spinner } from '../components/ui/misc';
import { api, ApiError } from '../lib/api';
import { useDocumentTitle, useMe } from '../lib/hooks';

export function SignIn() {
  useDocumentTitle('Sign in');
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  const { data: me } = useMe();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.user) nav(next, { replace: true });
  }, [me?.user, next, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<{ ok: true; devLink?: string }>('/api/auth/request', { email, next });
      setSent(true);
      setDevLink(r.devLink);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main id="main" className="mx-auto max-w-[440px] px-4 py-16 sm:py-24">
      {!sent ? (
        <>
          <h1 className="text-[38px] leading-tight text-ink">Sign in or sign up</h1>
          <p className="mt-3 text-[15.5px] text-muted">
            Same thing, one step. We'll email you a link. No password to remember, nothing to reset.
          </p>
          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Email" htmlFor="email" error={error}>
              <Input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email.includes('@')}>Email me a sign-in link</Button>
          </form>
          <p className="mt-6 text-[12.5px] leading-relaxed text-faint">
            By continuing you agree to the <Link to="/terms" className="link">terms</Link> and <Link to="/privacy" className="link">privacy policy</Link>. We only use your email for sign-in and the alerts you turn on.
          </p>
        </>
      ) : (
        <div className="anim-rise">
          <MailCheck className="size-8 text-accent" />
          <h1 className="mt-4 text-[34px] leading-tight text-ink">Check your inbox</h1>
          <p className="mt-3 text-[15.5px] text-ink-2">
            We sent a sign-in link to <strong className="text-ink">{email}</strong>. It works once and expires in 20 minutes.
          </p>
          <p className="mt-3 text-[14px] text-muted">Nothing after a couple of minutes? Check spam, or <button className="link text-ink" onClick={() => setSent(false)}>try again</button>.</p>
          {devLink && (
            <div className="mt-8 rounded-[8px] border border-dashed border-caution/60 bg-caution-soft px-4 py-3 text-[13.5px]">
              <p className="font-mono text-[11px] uppercase tracking-wider text-caution">Development only</p>
              <p className="mt-1 text-ink-2">Email isn't configured, so here's the link directly:</p>
              <a href={devLink} className="mt-1 block break-all font-mono text-[12px] link text-ink">{devLink}</a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export function AuthVerify() {
  useDocumentTitle('Signing in');
  const nav = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const token = hash.get('token');
    const next = hash.get('next') ?? '/dashboard';
    // Clear the token from the address bar right away.
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setError('This sign-in link is incomplete. Request a new one.');
      return;
    }
    api.post<{ ok: true; isNew: boolean }>('/api/auth/verify', { token })
      .then(async (r) => {
        await qc.invalidateQueries();
        toast.success(r.isNew ? "You're in. Welcome to JobSignal." : 'Signed in.');
        nav(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard', { replace: true });
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Sign-in failed.'));
  }, [nav, qc]);
  return (
    <main id="main" className="mx-auto max-w-[440px] px-4 py-24">
      {error ? (
        <>
          <ErrorNote title="Couldn't sign you in" message={error} />
          <Link to="/sign-in" className="mt-4 inline-block link text-ink">Get a new link</Link>
        </>
      ) : (
        <p className="flex items-center gap-3 text-ink-2"><Spinner className="size-5" /> Signing you in…</p>
      )}
    </main>
  );
}
