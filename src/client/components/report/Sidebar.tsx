import { useEffect, useState } from 'react';
import { ArrowUpRight, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { SourceRef } from '@shared/types';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { Checkbox } from '../ui/form';

export function Questions({ questions }: { questions: string[] }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(questions.map((q) => `- ${q}`).join('\n'));
      toast.success('Questions copied');
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };
  return (
    <section aria-labelledby="q-h">
      <div className="flex items-center justify-between">
        <h3 id="q-h" className="text-[20px] text-ink">Ask them</h3>
        <button onClick={copy} className="no-print inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <Copy className="size-3.5" /> Copy
        </button>
      </div>
      <ol className="mt-3 space-y-2.5">
        {questions.map((q, i) => (
          <li key={q} className="flex gap-3 text-[14.5px] leading-snug text-ink-2">
            <span className="font-hand text-[19px] leading-none text-accent">{i + 1}.</span>
            <span>{q}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export const CHECKLIST: Array<[string, string]> = [
  ['careers_page', "Found the same job on the company's own careers page"],
  ['recruiter_domain', "Recruiter emails come from the company's own domain"],
  ['no_money', "Haven't been asked for money, equipment purchases, or check deposits"],
  ['no_id', "Haven't been asked for my SSN, bank details, or ID before an offer"],
  ['pay_range', 'Know the pay range'],
  ['manager', "Know who I'd report to"],
  ['news', 'Looked at recent news about the company'],
];

/**
 * Pre-apply checklist. Saved to the account if the job is saved; otherwise kept in this
 * browser only, so nothing is sent anywhere without an account.
 */
export function Checklist({ storageKey, savedId, initial }: { storageKey: string; savedId?: string; initial?: Record<string, boolean> }) {
  const [state, setState] = useState<Record<string, boolean>>(() => {
    if (initial) return initial;
    try {
      return JSON.parse(localStorage.getItem(`js-check-${storageKey}`) ?? '{}') as Record<string, boolean>;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (initial) setState(initial);
  }, [initial]);
  const set = (k: string, v: boolean) => {
    const next = { ...state, [k]: v };
    setState(next);
    if (savedId) {
      api.patch(`/api/me/saved-jobs/${savedId}`, { checklist: next }).catch(() => toast.error("Couldn't save that tick. Try again."));
    } else {
      try {
        localStorage.setItem(`js-check-${storageKey}`, JSON.stringify(next));
      } catch { /* private mode: still works for this page view */ }
    }
  };
  const done = CHECKLIST.filter(([k]) => state[k]).length;
  return (
    <section aria-labelledby="cl-h">
      <div className="flex items-baseline justify-between">
        <h3 id="cl-h" className="text-[20px] text-ink">Before you send anything</h3>
        <span className="font-mono text-[12px] text-faint">{done}/{CHECKLIST.length}</span>
      </div>
      <div className="mt-2">
        {CHECKLIST.map(([k, label]) => (
          <Checkbox key={k} id={`cl-${k}`} checked={!!state[k]} onChange={(v) => set(k, v)}>{label}</Checkbox>
        ))}
      </div>
    </section>
  );
}

export function SourcesPanel({ sources, generatedAt, scoringVersion }: { sources: SourceRef[]; generatedAt: string; scoringVersion: string }) {
  return (
    <section aria-labelledby="src-h">
      <h3 id="src-h" className="text-[20px] text-ink">Where this came from</h3>
      <ul className="mt-3 space-y-2">
        {sources.map((s) => (
          <li key={s.name + (s.url ?? '')} className="text-[13.5px]">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1 text-ink-2 hover:text-ink">
                <span>{s.name}</span>
                <ArrowUpRight className="mt-0.5 size-3.5 shrink-0" />
              </a>
            ) : (
              <span className="text-ink-2">{s.name}</span>
            )}
            <span className="ml-2 font-mono text-[11px] text-faint">
              {s.reliability === 'official' ? 'official source' : s.reliability === 'user_supplied' ? 'from you' : s.reliability === 'reported' ? 'as published' : 'derived'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 font-mono text-[11px] leading-relaxed text-faint">
        Checked {fmtDate(generatedAt, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        <br />
        Rules version {scoringVersion} · <a className="link" href="/methodology">how scoring works</a>
      </p>
    </section>
  );
}
