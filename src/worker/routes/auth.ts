import { z } from 'zod';
import { getCookie } from 'hono/cookie';
import { body, createApp } from '../app';
import { analysisQuota } from '../services/usage';
import { readPrefs } from '../services/notifications';
import {
  clearSessionCookie, destroySession, requestLoginLink, SESSION_COOKIE, sessionCookie, verifyLoginToken,
} from '../services/auth';

export const authRoutes = createApp();

authRoutes.post('/api/auth/request', async (c) => {
  const b = await body(c, z.object({ email: z.string().max(254), next: z.string().max(300).optional() }));
  const r = await requestLoginLink(c.env, b.email, c.get('ipHash'), b.next);
  return c.json({ ok: true, ...r });
});

authRoutes.post('/api/auth/verify', async (c) => {
  const b = await body(c, z.object({ token: z.string().min(10).max(200) }));
  const { user, sessionToken, isNew } = await verifyLoginToken(c.env, b.token, c.req.header('user-agent') ?? null);
  c.header('set-cookie', sessionCookie(c.env, sessionToken), { append: true });
  // Bring over anything they ran before signing in.
  await c.env.DB.prepare('UPDATE reports SET user_id = ?, anon_id = NULL WHERE anon_id = ? AND user_id IS NULL').bind(user.id, c.get('anonId')).run();
  return c.json({ ok: true, isNew });
});

authRoutes.post('/api/auth/logout', async (c) => {
  await destroySession(c.env, getCookie(c, SESSION_COOKIE));
  c.header('set-cookie', clearSessionCookie(c.env), { append: true });
  return c.json({ ok: true });
});

authRoutes.get('/api/me', async (c) => {
  const user = c.get('user');
  const ent = c.get('ent');
  const subjectKey = user ? `user:${user.id}` : `anon:${c.get('ipHash')}`;
  const quota = await analysisQuota(c.env, subjectKey, ent);
  if (!user) return c.json({ user: null, plan: c.get('plan'), entitlements: ent, quota });
  const sub = c.get('sub');
  const unread = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').bind(user.id).first<{ n: number }>();
  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.created_at, prefs: readPrefs(user.prefs_json) },
    plan: c.get('plan'),
    entitlements: ent,
    quota,
    subscription: sub ? {
      status: sub.status, provider: sub.provider, currentPeriodEnd: sub.current_period_end, cancelAtPeriodEnd: sub.cancel_at_period_end === 1,
    } : null,
    unreadNotifications: unread?.n ?? 0,
  });
});
