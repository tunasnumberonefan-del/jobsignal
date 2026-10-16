import {
  CONFIDENCE_LABEL_TEXT, CONFIDENCE_TONE, EMPLOYER_LABEL_TEXT, EMPLOYER_TONE, POSTING_LABEL_TEXT, POSTING_TONE,
  type ConfidenceLabel, type EmployerLabel, type PostingLabel, type Tone,
} from '@shared/types';

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', opts);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (!Number.isFinite(s)) return '';
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
  if (d < 60) return `${Math.round(d / 7)} wk ago`;
  return fmtDate(iso);
}

export function postingLabel(l: string | null | undefined) {
  const k = (l ?? 'unable_to_verify') as PostingLabel;
  return { text: POSTING_LABEL_TEXT[k] ?? l ?? '', tone: (POSTING_TONE[k] ?? 'neutral') as Tone };
}

export function employerLabel(l: string | null | undefined) {
  const k = (l ?? 'insufficient_information') as EmployerLabel;
  return { text: EMPLOYER_LABEL_TEXT[k] ?? l ?? '', tone: (EMPLOYER_TONE[k] ?? 'neutral') as Tone };
}

export function confidenceLabel(l: string | null | undefined) {
  const k = (l ?? 'low') as ConfidenceLabel;
  return { text: CONFIDENCE_LABEL_TEXT[k] ?? l ?? '', tone: (CONFIDENCE_TONE[k] ?? 'neutral') as Tone };
}

export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-good',
  caution: 'text-caution',
  bad: 'text-bad',
  neutral: 'text-neutral',
};

export const TONE_BG: Record<Tone, string> = {
  good: 'bg-good-soft text-good',
  caution: 'bg-caution-soft text-caution',
  bad: 'bg-bad-soft text-bad',
  neutral: 'bg-neutral-soft text-neutral',
};

export const STATUS_TEXT: Record<string, string> = {
  interested: 'Interested',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  no_response: 'No response',
  withdrawn: 'Withdrew',
};

export function hostOf(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function plural(n: number, one: string, many = one + 's') {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
