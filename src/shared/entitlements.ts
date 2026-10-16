// Plan limits live here and nowhere else. Change a number, redeploy, done.
// The Worker is the only thing that enforces these. The browser just reads them for display.

export type PlanId = 'anonymous' | 'free' | 'pro';

export interface Entitlements {
  plan: PlanId;
  label: string;
  /** New analyses allowed per rolling window. */
  analyses: { limit: number; window: 'day' | 'month' };
  /** Saved jobs + saved reports kept in history. null = unlimited. */
  historyLimit: number | null;
  fullEvidence: boolean;          // every finding, raw source panel, financial detail
  postingHistory: boolean;        // version diffs + observation log
  monitoring: boolean;            // rechecks + alerts
  maxWatches: number;
  comparisons: boolean;
  maxCompareItems: number;
  exports: boolean;               // CSV / JSON / print-ready PDF
  weeklyDigest: boolean;
  savedFilters: boolean;
  /** How many findings non-pro users see in full. The rest show a title only. */
  findingsPreview: number | null;
}

export const PLANS: Record<PlanId, Entitlements> = {
  anonymous: {
    plan: 'anonymous',
    label: 'Visitor',
    analyses: { limit: 2, window: 'day' },
    historyLimit: 0,
    fullEvidence: false,
    postingHistory: false,
    monitoring: false,
    maxWatches: 0,
    comparisons: false,
    maxCompareItems: 0,
    exports: false,
    weeklyDigest: false,
    savedFilters: false,
    findingsPreview: 8,
  },
  free: {
    plan: 'free',
    label: 'Free',
    analyses: { limit: 3, window: 'day' },
    historyLimit: 25,
    fullEvidence: false,
    postingHistory: false,
    monitoring: false,
    maxWatches: 0,
    comparisons: false,
    maxCompareItems: 0,
    exports: false,
    weeklyDigest: false,
    savedFilters: false,
    findingsPreview: 8,
  },
  pro: {
    plan: 'pro',
    label: 'Pro',
    analyses: { limit: 300, window: 'month' },
    historyLimit: null,
    fullEvidence: true,
    postingHistory: true,
    monitoring: true,
    maxWatches: 75,
    comparisons: true,
    maxCompareItems: 6,
    exports: true,
    weeklyDigest: true,
    savedFilters: true,
    findingsPreview: null,
  },
};

export const PRICING = {
  pro: { monthlyUsd: 7.99 },
} as const;

/** Statuses where the person still gets Pro. past_due keeps access during the provider's retry window. */
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

export function planFor(sub: { plan: string; status: string; current_period_end: string | null } | null, now = new Date()): PlanId {
  if (!sub) return 'free';
  if (sub.plan !== 'pro') return 'free';
  if (!(ACTIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status)) return 'free';
  // Belt and braces: if the provider never told us about a renewal, don't hand out Pro forever.
  // Three days of grace covers webhook delays.
  if (sub.current_period_end) {
    const end = Date.parse(sub.current_period_end);
    if (Number.isFinite(end) && end + 3 * 86_400_000 < now.getTime()) return 'free';
  }
  return 'pro';
}
