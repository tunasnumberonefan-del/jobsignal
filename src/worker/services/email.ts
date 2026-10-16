// Email delivery. Production uses Resend's HTTP API (free tier: 3,000 emails/month).
// In development, EMAIL_MODE=console prints emails to the Worker log instead of sending.

import type { Env } from '../env';
import { log } from '../lib/log';
import { escapeHtml } from '../lib/html';

export interface Email {
  to: string;
  subject: string;
  text: string;
  /** Optional link rendered as a button in the HTML version. */
  action?: { label: string; url: string };
}

export function emailConfigured(env: Env): boolean {
  return env.EMAIL_MODE === 'resend' && !!env.RESEND_API_KEY;
}

function renderHtml(e: Email): string {
  const paras = e.text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
  const button = e.action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(e.action.url)}" style="background:#1f6f54;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(e.action.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f2ec;padding:28px 12px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1a">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2ded3;border-radius:8px;padding:28px">
<p style="margin:0 0 20px;font:600 15px/1 Arial,sans-serif;letter-spacing:.02em">JobSignal</p>
<div style="font:15px/1.55 Arial,sans-serif">${paras}${button}</div>
<p style="margin:26px 0 0;font:12px/1.5 Arial,sans-serif;color:#77736a">You're getting this because of your JobSignal account. You can change email settings any time in Account &rarr; Notifications.</p>
</div></body></html>`;
}

export async function sendEmail(env: Env, e: Email): Promise<{ sent: boolean; reason?: string }> {
  if (env.EMAIL_MODE === 'console' || !env.RESEND_API_KEY) {
    // Dev only. Includes the link so you can click through locally.
    log('info', 'email_console', { to: e.to.replace(/(.).*(@.*)/, '$1***$2'), subject: e.subject, text: e.text, action: e.action?.url });
    return { sent: false, reason: 'console_mode' };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [e.to],
      subject: e.subject,
      text: e.action ? `${e.text}\n\n${e.action.label}: ${e.action.url}` : e.text,
      html: renderHtml(e),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    log('error', 'email_send_failed', { status: res.status, body: (await res.text()).slice(0, 300) });
    return { sent: false, reason: `resend_${res.status}` };
  }
  return { sent: true };
}
