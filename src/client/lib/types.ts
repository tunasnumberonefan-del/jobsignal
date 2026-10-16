// Shapes the API returns. Report types come from @shared so client and server agree.
import type { Entitlements, PlanId } from '@shared/entitlements';
import type { Finding, Report } from '@shared/types';

export interface ViewFinding extends Omit<Finding, 'detail'> {
  detail: string | null;
  locked?: boolean;
}

export interface ReportView extends Omit<Report, 'findings'> {
  findings: ViewFinding[];
  locks: { findings: number; history: boolean; financials: boolean; events: number };
}

export interface Quota {
  used: number;
  limit: number;
  window: 'day' | 'month';
  remaining: number;
  resetsAt: string | null;
}

export interface Prefs {
  emailAlerts: boolean;
  weeklyDigest: boolean;
  deadlineEmails: boolean;
  defaultPublicReports: boolean;
  dashboard?: { showStats?: boolean; showAlerts?: boolean; showRecent?: boolean };
}

export interface Me {
  user: null | { id: string; email: string; name: string | null; role: 'user' | 'admin'; createdAt: string; prefs: Prefs };
  plan: PlanId;
  entitlements: Entitlements;
  quota: Quota;
  subscription?: null | { status: string; provider: 'stripe' | 'dev'; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };
  unreadNotifications?: number;
}

export interface AppConfig {
  plans: Record<PlanId, Entitlements>;
  pricing: { pro: { monthlyUsd: number } };
  billingMode: 'stripe' | 'dev' | 'off';
  environment: string;
  supportedSources: Array<{ name: string; example: string; official: boolean }>;
  warnStates: Array<{ state: string; agency: string; url: string }>;
  announcements: Array<{ id: string; message: string; level: 'info' | 'warning' }>;
  flags: Record<string, boolean>;
  turnstileSiteKey: string | null;
}

export interface ReportResponse {
  slug: string;
  reportId?: string;
  isOwner: boolean;
  isPublic: boolean;
  createdAt: string;
  claimable: boolean;
  saved: null | { id: string; status: string; monitor: number };
  report: ReportView;
}

export interface AnalyzeResponse {
  slug: string;
  reportId: string;
  reused: boolean;
  quota: Quota;
  report: ReportView;
}

export interface HistoryItem {
  id: string;
  slug: string;
  is_public: number;
  created_at: string;
  posting_label: string;
  employer_label: string;
  confidence_label: string;
  job_id: string;
  title: string;
  location: string | null;
  job_status: string;
  company: string | null;
  company_slug: string | null;
}

export interface SavedJob {
  id: string;
  job_id: string;
  report_id: string | null;
  report_slug: string | null;
  status: string;
  notes: string;
  deadline: string | null;
  remind_at: string | null;
  reminder_sent_at: string | null;
  checklist: Record<string, boolean>;
  monitor: number;
  created_at: string;
  updated_at: string;
  title: string;
  location: string | null;
  job_status: string;
  apply_url: string | null;
  source_url: string | null;
  last_checked_at: string;
  compensation_text: string | null;
  published_at: string | null;
  company: string | null;
  company_slug: string | null;
  posting_label: string | null;
  employer_label: string | null;
  confidence_label: string | null;
}

export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
