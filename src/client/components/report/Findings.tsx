import { clsx } from 'clsx';
import { ArrowUpRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Polarity, SourceRef } from '@shared/types';
import type { ViewFinding } from '../../lib/types';

const GROUPS: Array<{ key: string; title: string; note?: string; match: (p: Polarity) => boolean }> = [
  { key: 'risk', title: 'Worth knowing', match: (p) => p === 'warning' || p === 'caution' },
  { key: 'good', title: 'In its favor', match: (p) => p === 'positive' },
  { key: 'info', title: 'Notes', match: (p) => p === 'info' },
  { key: 'missing', title: "What we couldn't check", note: 'Gaps lower our confidence. They are not counted against the job or the company.', match: (p) => p === 'missing' },
];

const RULE: Record<Polarity, string> = {
  warning: 'border-l-bad',
  caution: 'border-l-caution',
  positive: 'border-l-good',
  info: 'border-l-line-strong',
  missing: 'border-l-line border-dashed',
};

const MARK: Record<Polarity, { glyph: string; cls: string; label: string }> = {
  warning: { glyph: '!', cls: 'text-bad', label: 'Warning' },
  caution: { glyph: '?', cls: 'text-caution', label: 'Caution' },
  positive: { glyph: '+', cls: 'text-good', label: 'Positive' },
  info: { glyph: '·', cls: 'text-muted', label: 'Note' },
  missing: { glyph: '–', cls: 'text-faint', label: 'Missing' },
};

export function SourceLinks({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return null;
  const seen = new Set<string>();
  const list = sources.filter((s) => {
    const k = s.name + (s.url ?? '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {list.slice(0, 4).map((s) => (
        <li key={s.name + s.url} className="font-mono text-[11.5px] text-faint">
          {s.url ? (
            <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-0.5 hover:text-ink">
              {s.name}
              <ArrowUpRight className="size-3" />
            </a>
          ) : (
            s.name
          )}
          {s.reliability === 'official' && <span className="ml-1.5 text-good">official</span>}
          {s.reliability === 'user_supplied' && <span className="ml-1.5 text-caution">you supplied</span>}
        </li>
      ))}
    </ul>
  );
}

export function FindingItem({ f }: { f: ViewFinding }) {
  const m = MARK[f.polarity];
  return (
    <li className={clsx('border-l-[3px] pl-4 py-1', RULE[f.polarity])}>
      <div className="flex items-baseline gap-2.5">
        <span className={clsx('w-3 shrink-0 text-center font-mono text-[15px] font-medium', m.cls)} aria-label={m.label}>{m.glyph}</span>
        <h4 className="font-sans text-[15.5px] font-semibold leading-snug text-ink">{f.title}</h4>
      </div>
      <div className="pl-[22px]">
        {f.locked ? (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] text-faint">
            <Lock className="size-3.5" /> Details and sources are in the full report. <Link to="/pricing" className="link text-muted">Pro</Link>
          </p>
        ) : (
          <>
            <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{f.detail}</p>
            <SourceLinks sources={f.sources} />
          </>
        )}
      </div>
    </li>
  );
}

export function Findings({ findings }: { findings: ViewFinding[] }) {
  return (
    <div className="space-y-9">
      {GROUPS.map((g) => {
        const items = findings.filter((f) => g.match(f.polarity));
        if (!items.length) return null;
        return (
          <section key={g.key} aria-labelledby={`fg-${g.key}`}>
            <div className="mb-3 flex items-baseline gap-3">
              <h3 id={`fg-${g.key}`} className="text-[22px] text-ink">{g.title}</h3>
              <span className="font-mono text-[12px] text-faint">{items.length}</span>
            </div>
            {g.note && <p className="-mt-1 mb-3 text-[13.5px] text-faint">{g.note}</p>}
            <ul className="space-y-4">
              {items.map((f) => <FindingItem key={f.ruleId + f.title} f={f} />)}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

