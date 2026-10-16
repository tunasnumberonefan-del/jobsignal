import { clsx } from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const FIELD = 'w-full rounded-[7px] border border-line-strong bg-raised text-ink placeholder:text-faint transition-[border-color,box-shadow] focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-60 aria-[invalid=true]:border-bad';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(FIELD, 'h-10 px-3 text-[15px]', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx(FIELD, 'px-3 py-2.5 text-[15px] leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx(FIELD, 'h-10 pl-3 pr-8 text-[14.5px] appearance-none bg-no-repeat bg-[right_10px_center] bg-[length:12px]', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4.5l4 3.5 4-3.5' fill='none' stroke='%23888' stroke-width='1.5'/%3E%3C/svg%3E\")" }}
      {...rest}>
      {children}
    </select>
  );
});

export function Field({ label, hint, error, children, htmlFor, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13.5px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-bad" role="alert">{error}</p> : hint ? <p className="text-[13px] text-faint">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id: string }) {
  return (
    <label htmlFor={id} className="group flex cursor-pointer items-start gap-3 py-1.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={clsx(
          'mt-[3px] grid size-[17px] shrink-0 place-items-center rounded-[4px] border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)]',
          checked ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-raised group-hover:border-ink-2/60',
        )}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3" fill="none">
            <path d="M2.2 6.4 4.8 9 9.8 3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className={clsx('text-[14.5px] leading-snug', checked ? 'text-muted line-through decoration-faint' : 'text-ink-2')}>{children}</span>
    </label>
  );
}
