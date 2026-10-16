import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ArrowRight, ClipboardPaste, Link2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useConfig, useMe } from '../../lib/hooks';
import type { AnalyzeResponse } from '../../lib/types';
import { Button } from '../ui/button';
import { Field, Input, Textarea } from '../ui/form';
import { Kbd } from '../ui/misc';
import { Tick } from '../ui/marks';

const STEPS = [
  'Reading the listing',
  'Checking it against the job board',
  'Looking for repeats we have seen before',
  'Searching layoff notices and SEC filings',
  'Writing up what we found',
];

/** The steps advance on a timer while the request runs. They describe the real pipeline,
 *  but we don't pretend to know which step the server is on. */
export function AnalysisProgress() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 1300);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="panel px-6 py-6">
      <p className="label-mono">Working on it</p>
      <ol className="mt-4 space-y-2.5">
        {STEPS.map((s, k) => (
          <li key={s} className={clsx('flex items-center gap-3 text-[15px] transition-colors', k < i ? 'text-muted' : k === i ? 'text-ink' : 'text-faint')}>
            <span className="grid size-5 place-items-center">
              {k < i ? <Tick className="size-4.5 text-good" /> : k === i ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : <span className="size-1.5 rounded-full bg-line-strong" />}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[12.5px] text-faint">Usually 3 to 10 seconds. Government and SEC servers set the pace.</p>
    </div>
  );
}

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; theme?: string }) => string; reset: (id?: string) => void };
  }
}

function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const render = () => {
      if (ref.current && window.turnstile && !ref.current.dataset.rendered) {
        ref.current.dataset.rendered = '1';
        window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken, theme: 'auto' });
      }
    };
    if (window.turnstile) return render();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [siteKey, onToken]);
  return <div ref={ref} className="mt-3" />;
}

export function AnalyzeForm({ autoFocus, compact, initialUrl }: { autoFocus?: boolean; compact?: boolean; initialUrl?: string }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: cfg } = useConfig();
  const [url, setUrl] = useState(initialUrl ?? '');
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [token, setToken] = useState<string>();
  const textRef = useRef<HTMLTextAreaElement>(null);

  const needsTurnstile = !me?.user && !!cfg?.turnstileSiteKey;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!url.trim() && !text.trim()) {
      setError(new ApiError(400, 'bad_request', 'Paste a job link, or switch to pasting the description.'));
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<AnalyzeResponse>('/api/analyze', {
        url: url.trim() || undefined,
        text: manual && text.trim() ? text : undefined,
        title: manual ? title || undefined : undefined,
        company: company || undefined,
        location: manual ? location || undefined : undefined,
        turnstileToken: token,
      });
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.setQueryData(['report', res.slug], { slug: res.slug, reportId: res.reportId, isOwner: true, isPublic: false, createdAt: res.report.generatedAt, claimable: false, saved: null, report: res.report });
      nav(`/r/${res.slug}`, { state: { fresh: true } });
    } catch (err) {
      const ae = err instanceof ApiError ? err : new ApiError(0, 'error', 'Something went wrong.');
      setError(ae);
      if (ae.extra.needsManual) {
        setManual(true);
        setTimeout(() => textRef.current?.focus(), 50);
      }
      if (needsTurnstile) window.turnstile?.reset();
    } finally {
      setBusy(false);
    }
  };

  if (busy) return <AnalysisProgress />;

  return (
    <form onSubmit={submit} noValidate className={clsx(!compact && 'panel p-4 sm:p-5')}>
      <label htmlFor="job-url" className="sr-only">Job posting link</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-faint" />
          <Input
            id="job-url"
            type="url"
            inputMode="url"
            autoFocus={autoFocus}
            placeholder="Paste a job link, e.g. boards.greenhouse.io/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-12 pl-10 text-[15.5px]"
            aria-invalid={!!error && !manual}
            aria-describedby={error ? 'analyze-error' : 'analyze-hint'}
          />
        </div>
        <Button type="submit" size="lg" className="sm:w-auto" icon={<ArrowRight className="size-4.5" />}>
          Check it
        </Button>
      </div>

      {!manual ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <p id="analyze-hint" className="text-faint">
            Works best with Greenhouse, Lever, and Ashby links. <span className="hidden sm:inline">Press <Kbd>Enter</Kbd> to run.</span>
          </p>
          <button type="button" onClick={() => { setManual(true); setTimeout(() => textRef.current?.focus(), 30); }} className="inline-flex items-center gap-1.5 text-ink-2 hover:text-ink">
            <ClipboardPaste className="size-3.5" /> Paste the description instead
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <Field label="Job description" htmlFor="job-text" hint="Copy everything from the listing page. Longer is better.">
            <Textarea ref={textRef} id="job-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full job description here" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Job title" htmlFor="job-title"><Input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Company" htmlFor="job-company" hint="Needed for layoff and SEC checks"><Input id="job-company" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
            <Field label="Location" htmlFor="job-location"><Input id="job-location" value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
          </div>
          <div className="flex items-center justify-between">
            <button type="button" className="text-[13px] text-muted hover:text-ink" onClick={() => setManual(false)}>Use a link instead</button>
            <Button type="submit">Check this text</Button>
          </div>
        </div>
      )}

      {needsTurnstile && <Turnstile siteKey={cfg!.turnstileSiteKey!} onToken={setToken} />}

      {error && (
        <div id="analyze-error" role="alert" className="mt-4 rounded-[8px] border border-bad/35 bg-bad-soft px-4 py-3 text-[14px] text-ink">
          <p>{error.message}</p>
          {error.code === 'quota_exceeded' && (
            <p className="mt-1.5">
              {me?.user
                ? <><Link to="/pricing" className="link font-medium">Pro</Link> gives you 300 a month, plus monitoring.</>
                : <><Link to="/sign-in?next=/check" className="link font-medium">Create a free account</Link> for 3 a day, saved history, and sharing.</>}
            </p>
          )}
        </div>
      )}
      {me && !error && !compact && (
        <p className="mt-3 text-[12.5px] text-faint">
          {me.quota.remaining} of {me.quota.limit} checks left {me.quota.window === 'day' ? 'today' : 'this month'}.
        </p>
      )}
    </form>
  );
}
