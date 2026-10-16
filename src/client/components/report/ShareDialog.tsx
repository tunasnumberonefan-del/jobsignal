import { Copy, Download, Globe2, Lock } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { confidenceLabel, employerLabel, postingLabel } from '../../lib/format';
import type { ReportView } from '../../lib/types';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Switch } from '../ui/misc';

const TONE_HEX: Record<string, [string, string]> = {
  good: ['#1f7350', '#e1efe6'],
  caution: ['#94640c', '#f6ecd4'],
  bad: ['#ad3f29', '#f6e1da'],
  neutral: ['#5d666b', '#e7e9e7'],
};

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws a 1200x630 share card on paper, with stamps. No server-side image service needed. */
export async function drawShareCard(report: ReportView, url: string): Promise<Blob> {
  await document.fonts.ready;
  const c = document.createElement('canvas');
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f4f2eb';
  ctx.fillRect(0, 0, 1200, 630);
  // faint ruled lines, like a notepad
  ctx.strokeStyle = 'rgba(60,50,30,0.06)';
  ctx.lineWidth = 1;
  for (let y = 120; y < 600; y += 34) {
    ctx.beginPath();
    ctx.moveTo(60, y);
    ctx.lineTo(1140, y);
    ctx.stroke();
  }
  ctx.fillStyle = '#6b685e';
  ctx.font = '500 20px "IBM Plex Mono", monospace';
  ctx.fillText('JOBSIGNAL REPORT', 64, 78);
  ctx.textAlign = 'right';
  ctx.fillText(new Date(report.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase(), 1136, 78);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#1c1c19';
  ctx.font = '400 58px Newsreader, Georgia, serif';
  const titleLines = wrap(ctx, report.job.title, 1060).slice(0, 2);
  titleLines.forEach((l, i) => ctx.fillText(l, 62, 170 + i * 66));
  let y = 170 + titleLines.length * 66;
  if (report.job.employer) {
    ctx.fillStyle = '#47453e';
    ctx.font = 'italic 400 34px Newsreader, Georgia, serif';
    ctx.fillText(report.job.employer + (report.job.location ? ` · ${report.job.location.slice(0, 40)}` : ''), 64, y + 2);
    y += 40;
  }

  const stamps = [
    ['POSTING', postingLabel(report.posting.label)],
    ['EMPLOYER', employerLabel(report.employer.label)],
    ['EVIDENCE', { ...confidenceLabel(report.confidence.label), text: `${confidenceLabel(report.confidence.label).text} confidence` }],
  ] as const;
  const top = Math.max(y + 40, 360);
  stamps.forEach(([head, s], i) => {
    const x = 64 + i * 360;
    ctx.fillStyle = '#8f8b7f';
    ctx.font = '500 16px "IBM Plex Mono", monospace';
    ctx.fillText(head, x, top);
    const [fg, bg] = TONE_HEX[s.tone] ?? TONE_HEX.neutral!;
    ctx.save();
    ctx.translate(x, top + 22);
    ctx.rotate((-1.4 * Math.PI) / 180);
    ctx.font = '500 19px "IBM Plex Mono", monospace';
    const label = s.text.toUpperCase();
    const lines = wrap(ctx, label, 300);
    const h = 18 + lines.length * 26;
    const w = Math.min(330, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 28);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = fg;
    lines.forEach((l, j) => ctx.fillText(l, 14, 32 + j * 26));
    ctx.restore();
  });

  ctx.fillStyle = '#1d6b50';
  ctx.font = '500 26px Caveat, cursive';
  ctx.fillText('know before you apply', 64, 584);
  ctx.fillStyle = '#6b685e';
  ctx.font = '400 18px "IBM Plex Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(url.replace(/^https?:\/\//, ''), 1136, 584);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas'))), 'image/png'));
}

export function ShareDialog({ open, onOpenChange, report, slug, reportId, isOwner, isPublic, onChange }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  report: ReportView;
  slug: string;
  reportId?: string;
  isOwner: boolean;
  isPublic: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const url = `${window.location.origin}/r/${slug}`;
  const togglePublic = async (v: boolean) => {
    if (!reportId) return;
    setBusy(true);
    try {
      await api.patch(`/api/me/reports/${reportId}`, { isPublic: v });
      onChange();
      toast.success(v ? 'Anyone with the link can see this report now.' : 'This report is private again.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error("Couldn't copy the link.");
    }
  };
  const downloadCard = async () => {
    try {
      const blob = await drawShareCard(report, url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jobsignal-${slug}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      toast.error("Couldn't draw the image in this browser.");
    }
  };
  const text = encodeURIComponent(`Checked this job listing before applying: ${report.job.title}${report.job.employer ? ` at ${report.job.employer}` : ''}`);
  const canShareLink = isPublic;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Share this report" description="Shared reports show the job and the evidence. They never show who ran the check.">
      {isOwner && (
        <div className="flex items-center justify-between gap-4 rounded-[8px] border border-line px-4 py-3">
          <div className="flex items-center gap-3">
            {isPublic ? <Globe2 className="size-4.5 text-good" /> : <Lock className="size-4.5 text-muted" />}
            <div>
              <p className="text-[14.5px] text-ink">{isPublic ? 'Anyone with the link' : 'Only you'}</p>
              <p className="text-[12.5px] text-muted">{reportId ? 'You can change this any time.' : 'Sign in to make a report shareable.'}</p>
            </div>
          </div>
          <Switch checked={isPublic} onChange={togglePublic} disabled={busy || !reportId} label="Make report public" />
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-[7px] border border-line bg-bg-sunk px-3 font-mono text-[12.5px] text-ink-2" aria-label="Report link" />
        <Button variant="secondary" onClick={copy} icon={<Copy className="size-4" />} disabled={!canShareLink}>Copy</Button>
      </div>
      {!canShareLink && <p className="mt-2 text-[12.5px] text-caution">Turn on sharing first, or the link will only work for you.</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={downloadCard} icon={<Download className="size-4" />}>Download image</Button>
        <a className="inline-flex h-8 items-center rounded-[6px] border border-line-strong px-3 text-[13px] text-ink-2 hover:text-ink aria-disabled:pointer-events-none aria-disabled:opacity-50" aria-disabled={!canShareLink} href={`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">Post on X</a>
        <a className="inline-flex h-8 items-center rounded-[6px] border border-line-strong px-3 text-[13px] text-ink-2 hover:text-ink aria-disabled:pointer-events-none aria-disabled:opacity-50" aria-disabled={!canShareLink} href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">LinkedIn</a>
      </div>
    </Dialog>
  );
}
