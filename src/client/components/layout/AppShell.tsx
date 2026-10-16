import { clsx } from 'clsx';
import { Bell, Bookmark, Building2, Columns3, History, LayoutDashboard, Settings, Shield } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../../lib/hooks';
import { Skeleton } from '../ui/misc';

const ITEMS = [
  { to: '/dashboard', label: 'Overview', I: LayoutDashboard },
  { to: '/history', label: 'History', I: History },
  { to: '/saved', label: 'Saved jobs', I: Bookmark },
  { to: '/watchlist', label: 'Companies', I: Building2 },
  { to: '/compare', label: 'Compare', I: Columns3 },
  { to: '/notifications', label: 'Alerts', I: Bell },
  { to: '/account', label: 'Account', I: Settings },
];

/** Layout for signed-in pages. Redirects to sign-in if there's no session. */
export function AppShell({ children, title, actions, wide }: { children: ReactNode; title: string; actions?: ReactNode; wide?: boolean }) {
  const { data: me, isLoading } = useMe();
  const loc = useLocation();
  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }
  if (!me?.user) return <Navigate to={`/sign-in?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  const items = me.user.role === 'admin' ? [...ITEMS, { to: '/admin', label: 'Admin', I: Shield }] : ITEMS;
  const unread = me.unreadNotifications ?? 0;
  return (
    <div className="mx-auto grid max-w-[1180px] gap-8 px-4 pb-10 pt-6 sm:px-6 lg:grid-cols-[200px_1fr] lg:pt-10">
      <nav aria-label="Account" className="no-print -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2 lg:mx-0 lg:flex-col lg:border-0 lg:px-0 lg:pb-0">
        {items.map(({ to, label, I }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) => clsx(
              'flex shrink-0 items-center gap-2.5 rounded-[7px] px-3 py-2 text-[14px] transition-colors',
              isActive ? 'bg-surface text-ink border border-line' : 'text-muted hover:text-ink border border-transparent',
            )}
          >
            <I className="size-4" />
            {label}
            {to === '/notifications' && unread > 0 && <span className="ml-auto rounded-full bg-bad px-1.5 font-mono text-[10px] leading-[16px] text-white">{unread}</span>}
          </NavLink>
        ))}
        <div className="mt-6 hidden rounded-[8px] border border-line px-3 py-3 text-[12.5px] text-muted lg:block">
          <span className="label-mono block">{me.entitlements.label} plan</span>
          <span className="mt-1 block">
            {me.quota.remaining} of {me.quota.limit} checks left {me.quota.window === 'day' ? 'today' : 'this month'}
          </span>
          {me.plan !== 'pro' && <NavLink to="/pricing" className="mt-1.5 inline-block link text-ink">See Pro</NavLink>}
        </div>
      </nav>
      <main id="main" className={clsx('min-w-0', wide ? '' : 'max-w-[880px]')}>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[34px] leading-tight text-ink">{title}</h1>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
