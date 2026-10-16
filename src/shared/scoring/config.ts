// Scoring weights. Bump SCORING_VERSION whenever a number or rule changes so old
// reports keep saying which rules produced them. History of changes is in docs/SCORING.md.

export const SCORING_VERSION = '2026.10.1';

export const WEIGHTS = {
  // posting
  official_live: 35,
  structured_data: 15,
  structured_data_own_domain: 10,
  not_live: -40,
  employer_identified: 5,
  employer_missing: -10,
  fresh_posting: 8,
  open_61_120_days: -8,
  open_over_120_days: -15,
  past_valid_through: -20,
  reopened: -8,
  reposted: -8,
  specific_description: 8,
  vague_description: -10,
  pay_listed: 5,
  pay_missing_transparency_state: -3,
  contradictory_requirements: -6,
  asks_sensitive_info: -30,
  off_platform_chat: -25,
  asks_for_payment: -35,
  free_email_contact: -10,
  pipeline_language: -10,
  too_good_to_be_true: -10,
  apply_domain_mismatch: -8,

  // employer
  warn_recent: -15,
  warn_recent_large: -20,
  warn_very_recent_extra: -5,
  sec_restructuring: -15,
  sec_bankruptcy: -40,
  going_concern: -35,
  sec_impairment: -5,
  revenue_down: -10,
  revenue_up: 8,
  hiring_actively: 5,
  filings_current: 5,
} as const;

export type WeightKey = keyof typeof WEIGHTS;

export const THRESHOLDS = {
  freshDays: 30,
  oldDays: 60,
  veryOldDays: 120,
  warnLookbackDays: 365,
  warnVeryRecentDays: 90,
  warnLargeEmployees: 100,
  secLookbackDays: 365,
  bankruptcyLookbackDays: 730,
  goingConcernLookbackDays: 545,
  revenueDropPct: -20,
  revenueGrowthPct: 10,
  hiringActiveRoles: 10,
  filingCurrentDays: 200,
  minSpecificWords: 250,
  vagueWords: 150,
  strongPostingScore: 70,
} as const;

/** Signals that, on their own, mean "be careful" no matter what else looks good. */
export const SERIOUS_POSTING_RULES = new Set(['asks_sensitive_info', 'off_platform_chat', 'asks_for_payment']);
