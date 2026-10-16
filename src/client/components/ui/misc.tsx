import * as RT from '@radix-ui/react-tooltip';
import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Tone } from '@shared/types';
import { TONE_TEXT } from '../../lib/format';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function Stamp({ tone, children, className, animate }: { tone: Tone; children: ReactNode; className?: string; animate?: boolean }) {
  return <span className={clsx('stamp', TONE_TEXT[tone], animate && 'anim-stamp', className)}>{children}</span>;
}

/** Small round dot in a tone colour. For lists and tables. */
export function ToneDot({ tone, className }: { tone: Tone; className?: string }) {
  const bg = { good: 'bg-good', caution: 'bg-caution', bad: 'bg-bad', neutral: 'bg-neutral' }[tone];
  return <span aria-hidden className={clsx('inline-block size-2 rounded-full shrink-0', bg, className)} />;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[12px] text-muted', className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="font-mono text-[11px] rounded border border-line-strong bg-raised px-1.5 py-px text-muted">{children}</kbd>;
}

export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RT.Root delayDuration={250}>
      <RT.Trigger asChild>{children}</RT.Trigger>
      <RT.Portal>
        <RT.Content side={side} sideOffset={6} className="z-50 max-w-[280px] rounded-md bg-ink px-2.5 py-1.5 text-[12.5px] leading-snug text-bg shadow-lg anim-rise">
          {content}
          <RT.Arrow className="fill-ink" />
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[10px] border border-dashed border-line-strong px-6 py-10 sm:px-10">
      {icon && <div className="text-faint">{icon}</div>}
      <h3 className="text-[22px] text-ink">{title}</h3>
      {children && <div className="max-w-[46ch] text-muted">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorNote({ title = 'That didn’t work', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-[10px] border border-bad/40 bg-bad-soft px-5 py-4 text-ink">
      <p className="font-medium text-bad">{title}</p>
      <p className="mt-1 text-ink-2">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 text-[14px] link text-ink">
          Try again
        </button>
      )}
    </div>
  );
}

/** Shown where a Pro-only thing would be. Says what it is, not just "upgrade". */
export function ProLock({ what, className }: { what: string; className?: string }) {
  return (
    <div className={clsx('flex items-start gap-3 rounded-[8px] border border-line bg-bg-sunk/60 px-4 py-3 text-[14px]', className)}>
      <Lock className="mt-0.5 size-4 shrink-0 text-faint" />
      <p className="text-muted">
        {what} <Link to="/pricing" className="link text-ink">Pro, $7.99/mo</Link>
      </p>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors',
        checked ? 'bg-accent border-accent' : 'bg-bg-sunk border-line-strong',
        disabled && 'opacity-50',
      )}
    >
      <span className={clsx('inline-block size-[16px] rounded-full bg-raised shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('label-mono', className)}>{children}</p>;
}
