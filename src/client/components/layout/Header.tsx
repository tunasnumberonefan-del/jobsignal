import * as DM from '@radix-ui/react-dropdown-menu';
import * as D from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Bell, LogOut, Menu, Monitor, Moon, Settings, Shield, Sun, User, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useConfig, useMe, useTheme, type Theme } from '../../lib/hooks';
import { buttonClass, ButtonLink } from '../ui/button';
import { Logo } from '../ui/marks';

const NAV = [
  { to: '/check', label: 'Check a job' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/guides', label: 'Guides' },
];

function ThemeMenu() {
  const [theme, setTheme] = useTheme();
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  const opts: Array<[Theme, string, typeof Sun]> = [['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'Match system', Monitor]];
  return (
    <DM.Root>
      <DM.Trigger className={buttonClass('ghost', 'sm', 'w-8 px-0!')} aria-label="Theme">
        <Icon className="size-4" />
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={6} className="z-50 min-w-[170px] panel p-1 anim-rise">
          {opts.map(([v, label, I]) => (
            <DM.Item key={v} onSelect={() => setTheme(v)} className={clsx('flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[14px] outline-none data-highlighted:bg-bg-sunk', theme === v ? 'text-ink' : 'text-muted')}>
              <I className="size-4" /> {label}
              {theme === v && <span className="ml-auto text-accent">•</span>}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function AccountMenu({ email, admin }: { email: string; admin: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const logout = async () => {
    await api.post('/api/auth/logout');
    await qc.invalidateQueries();
    toast('Signed out. See you next time.');
    nav('/');
  };
  return (
    <DM.Root>
      <DM.Trigger className={buttonClass('ghost', 'sm', 'w-8 px-0!')} aria-label="Account menu">
        <span className="grid size-7 place-items-center rounded-full border border-line-strong font-mono text-[12px] uppercase text-ink-2">{email[0]}</span>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={6} className="z-50 min-w-[220px] panel p-1 anim-rise">
          <div className="truncate px-2.5 py-2 text-[13px] text-muted">{email}</div>
          <DM.Separator className="my-1 h-px bg-line" />
          {[
            { to: '/dashboard', label: 'Dashboard', I: User },
            { to: '/account', label: 'Account & billing', I: Settings },
            ...(admin ? [{ to: '/admin', label: 'Admin', I: Shield }] : []),
          ].map(({ to, label, I }) => (
            <DM.Item key={to} asChild>
              <Link to={to} className="flex items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[14px] text-ink-2 outline-none data-highlighted:bg-bg-sunk data-highlighted:text-ink">
                <I className="size-4" /> {label}
              </Link>
            </DM.Item>
          ))}
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item onSelect={logout} className="flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2.5 py-1.5 text-[14px] text-ink-2 outline-none data-highlighted:bg-bg-sunk">
            <LogOut className="size-4" /> Sign out
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function Header() {
  const { data: me } = useMe();
  const { data: cfg } = useConfig();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const user = me?.user;
  const unread = me?.unreadNotifications ?? 0;

  return (
    <>
      {cfg?.announcements?.[0] && (
        <div className={clsx('no-print px-4 py-2 text-center text-[13.5px]', cfg.announcements[0].level === 'warning' ? 'bg-caution-soft text-caution' : 'bg-accent-soft text-ink-2')} role="status">
          {cfg.announcements[0].message}
        </div>
      )}
      {cfg?.environment !== 'production' && cfg?.billingMode === 'dev' && (
        <div className="no-print border-b border-line bg-bg-sunk px-4 py-1 text-center font-mono text-[11px] text-faint">
          development build · payments are simulated · emails print to the server log
        </div>
      )}
      <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-[6px]">
        <div className="mx-auto flex h-[58px] max-w-[1180px] items-center gap-6 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-ink" aria-label="JobSignal home">
            <Logo className="size-7" />
            <span className="font-serif text-[21px] tracking-[-0.01em]">JobSignal</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx('rounded-[6px] px-3 py-1.5 text-[14px] transition-colors', isActive ? 'text-ink' : 'text-muted hover:text-ink')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeMenu />
            {user ? (
              <>
                <Link to="/notifications" className={buttonClass('ghost', 'sm', 'relative w-8 px-0!')} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
                  <Bell className="size-4" />
                  {unread > 0 && <span className="absolute right-1 top-1 grid min-w-[15px] place-items-center rounded-full bg-bad px-1 font-mono text-[9.5px] leading-[15px] text-white">{unread > 9 ? '9+' : unread}</span>}
                </Link>
                <span className="hidden sm:block"><ButtonLink to="/dashboard" variant="secondary" size="sm">Dashboard</ButtonLink></span>
                <AccountMenu email={user.email} admin={user.role === 'admin'} />
              </>
            ) : (
              <>
                <Link to="/sign-in" className="hidden px-2 text-[14px] text-muted hover:text-ink sm:block">Sign in</Link>
                <span className="hidden sm:block"><ButtonLink to="/check" size="sm">Check a job</ButtonLink></span>
              </>
            )}
            <D.Root open={open} onOpenChange={setOpen}>
              <D.Trigger className={buttonClass('ghost', 'sm', 'w-8 px-0! md:hidden')} aria-label="Open menu">
                <Menu className="size-5" />
              </D.Trigger>
              <D.Portal>
                <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
                <D.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(320px,86vw)] flex-col border-l border-line bg-surface p-5 anim-rise">
                  <div className="flex items-center justify-between">
                    <D.Title className="font-serif text-[20px]">Menu</D.Title>
                    <D.Close className="rounded p-1.5 text-muted hover:text-ink" aria-label="Close menu"><X className="size-5" /></D.Close>
                  </div>
                  <D.Description className="sr-only">Site navigation</D.Description>
                  <nav className="mt-6 flex flex-col" aria-label="Mobile">
                    {[...NAV, ...(user ? [{ to: '/dashboard', label: 'Dashboard' }, { to: '/account', label: 'Account' }] : [{ to: '/sign-in', label: 'Sign in' }])].map((n) => (
                      <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx('border-b border-line py-3 text-[17px]', isActive ? 'text-ink' : 'text-ink-2')}>
                        {n.label}
                      </NavLink>
                    ))}
                  </nav>
                </D.Content>
              </D.Portal>
            </D.Root>
          </div>
        </div>
      </header>
    </>
  );
}
