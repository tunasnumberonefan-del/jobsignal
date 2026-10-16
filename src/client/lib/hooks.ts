import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from './api';
import type { AppConfig, Me } from './types';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/api/me'), staleTime: 30_000 });
}

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: () => api.get<AppConfig>('/api/config'), staleTime: 5 * 60_000 });
}

export function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['me'] });
}

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = title.includes('JobSignal') ? title : `${title} · JobSignal`;
  }, [title]);
}

export type Theme = 'light' | 'dark' | 'system';

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const t = localStorage.getItem('js-theme');
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch {
      return 'system';
    }
  });
  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      if (t === 'system') localStorage.removeItem('js-theme');
      else localStorage.setItem('js-theme', t);
    } catch { /* private mode */ }
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return [theme, setTheme];
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
