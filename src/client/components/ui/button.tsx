import { clsx } from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Spinner } from './misc';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:brightness-[1.06] active:brightness-95 shadow-[inset_0_-1px_0_rgba(0,0,0,0.18)]',
  secondary: 'bg-raised text-ink border border-line-strong hover:border-ink-2/50 hover:bg-surface',
  ghost: 'text-ink-2 hover:text-ink hover:bg-bg-sunk',
  danger: 'bg-bad text-white hover:brightness-110',
  link: 'text-ink link px-0! h-auto!',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[6px]',
  md: 'h-10 px-4 text-[14.5px] gap-2 rounded-[7px]',
  lg: 'h-12 px-5 text-[15.5px] gap-2 rounded-[8px]',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return clsx(
    'inline-flex items-center justify-center font-medium whitespace-nowrap select-none transition-[filter,background-color,border-color,color,transform] duration-150',
    'active:translate-y-px disabled:opacity-55 disabled:active:translate-y-0',
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'primary', size = 'md', className, icon, children, ...rest }: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}
