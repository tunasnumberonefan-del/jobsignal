// Types shared by the Worker and the browser. The report shape here is what
// gets stored in analyses.report_json, so change it carefully (add fields, don't rename).

export type SourceKind = 'greenhouse' | 'lever' | 'ashby' | 'jsonld' | 'manual';

export type Reliability = 'official' | 'reported' | 'derived' | 'user_supplied';

export interface SourceRef {
  name: string;          // "Greenhouse Job Board API", "Texas Workforce Commission"
  url?: string;
  reliability: Reliability;
  fetchedAt?: string;
}

/** What we know about the posting itself. Everything optional is optional on purpose. */
export interface PostingEvidence {
  sourceKind: SourceKind;
  inputUrl?: string;
  canonicalUrl?: string;
  applyUrl?: string;
  /** Did a request to an official source confirm the listing is live right now? */
  liveOnOfficialSource: boolean | null;
  /** HTTP-ish outcome of trying to read the URL. null for manual entry. */
  fetchOutcome: 'ok' | 'not_found' | 'gone' | 'blocked' | 'error' | 'unsupported' | null;
  employerName?: string;
  employerDomain?: string;
  title: string;
  location?: string;
  employmentType?: string;
  compensationText?: string;
  /** Publish / creation date stated by the source. */
  publishedAt?: string;
  /** Last-updated date stated by the source. Never treat this as a creation date. */
  sourceUpdatedAt?: string;
  validThrough?: string;
  descriptionText: string;
  /** How many other open roles the same job board lists right now, if we could see the board. */
  boardOpenRoles?: number;
  /** Open roles on the same board with the same normalized title + location (could be multiple seats). */
  boardDuplicates?: number;
  sources: SourceRef[];
}

/** What JobSignal itself has observed over time. Only real observations. */
export interface PostingHistory {
  firstSeenAt: string;          // first time *we* saw it
  lastSeenAt: string;
  observationCount: number;
  closedAt?: string;
  reopenedCount: number;
  /** Other jobs in our database with the same company + title + location fingerprint. */
  similarPostings: Array<{ key: string; firstSeenAt: string; lastSeenAt: string; status: string }>;
  descriptionChanges: number;
}

export type CompanyEventKind =
  | 'warn_notice'
  | 'sec_restructuring'
  | 'sec_bankruptcy'
  | 'sec_impairment'
  | 'sec_acquisition'
  | 'going_concern'
  | 'other';

export interface CompanyEvent {
  kind: CompanyEventKind;
  date: string;
  title: string;
  detail?: string;
  magnitude?: number;
  matchQuality: 'exact' | 'probable';
  source: SourceRef;
}

export interface FinancialPoint {
  label: string;           // "Revenue", "Net income", "Cash"
  unit: 'USD';
  fiscalYear: number;
  value: number;
  priorValue?: number;
  filed: string;
  form: string;
}

export interface EmployerEvidence {
  companyId?: string;
  companySlug?: string;
  name?: string;
  domain?: string;
  cik?: string;
  ticker?: string;
  /** Which lookups actually ran, so we can tell "nothing found" apart from "didn't check". */
  checked: {
    warn: { states: string[]; ran: boolean };
    sec: { ran: boolean; matched: boolean; error?: string };
  };
  events: CompanyEvent[];
  financials: FinancialPoint[];
  /** Most recent 10-K / 10-Q, if the company files with the SEC. */
  latestPeriodicFiling?: { form: string; date: string; url: string };
  sources: SourceRef[];
}

export interface EvidenceBundle {
  now: string;
  inputKind: 'url' | 'manual';
  posting: PostingEvidence;
  history: PostingHistory | null;
  employer: EmployerEvidence;
}

// ---------------------------------------------------------------- findings

export type Dimension = 'posting' | 'employer';
export type Polarity = 'positive' | 'caution' | 'warning' | 'info' | 'missing';

export interface Finding {
  ruleId: string;
  dimension: Dimension;
  polarity: Polarity;
  /** Signed contribution. Positive helps, negative hurts. 0 for info/missing. */
  weight: number;
  title: string;
  detail: string;
  sources: SourceRef[];
}

export type PostingLabel =
  | 'strong_signals'
  | 'some_caution'
  | 'limited_evidence'
  | 'significant_inconsistencies'
  | 'unable_to_verify';

export type EmployerLabel =
  | 'no_significant_warnings'
  | 'some_warnings'
  | 'multiple_significant_warnings'
  | 'insufficient_information';

export type ConfidenceLabel = 'high' | 'moderate' | 'low';

export interface Report {
  version: 1;
  scoringVersion: string;
  generatedAt: string;
  inputKind: 'url' | 'manual';
  job: {
    title: string;
    employer?: string;
    location?: string;
    employmentType?: string;
    compensationText?: string;
    applyUrl?: string;
    canonicalUrl?: string;
    sourceKind: SourceKind;
    publishedAt?: string;
    sourceUpdatedAt?: string;
    validThrough?: string;
  };
  posting: { label: PostingLabel; score: number; headline: string };
  employer: { label: EmployerLabel; score: number; headline: string };
  confidence: { label: ConfidenceLabel; score: number; headline: string; gaps: string[] };
  findings: Finding[];
  history: PostingHistory | null;
  employerProfile: EmployerEvidence;
  questions: string[];
  sources: SourceRef[];
}

export const POSTING_LABEL_TEXT: Record<PostingLabel, string> = {
  strong_signals: 'Strong verification signals',
  some_caution: 'Some caution signals',
  limited_evidence: 'Limited evidence',
  significant_inconsistencies: 'Significant inconsistencies',
  unable_to_verify: 'Unable to verify',
};

export const EMPLOYER_LABEL_TEXT: Record<EmployerLabel, string> = {
  no_significant_warnings: 'No significant warning signals found',
  some_warnings: 'Some warning signals',
  multiple_significant_warnings: 'Multiple significant warning signals',
  insufficient_information: 'Not enough public information',
};

export const CONFIDENCE_LABEL_TEXT: Record<ConfidenceLabel, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
};

export type Tone = 'good' | 'neutral' | 'caution' | 'bad';

export const POSTING_TONE: Record<PostingLabel, Tone> = {
  strong_signals: 'good',
  some_caution: 'caution',
  limited_evidence: 'neutral',
  significant_inconsistencies: 'bad',
  unable_to_verify: 'neutral',
};

export const EMPLOYER_TONE: Record<EmployerLabel, Tone> = {
  no_significant_warnings: 'good',
  some_warnings: 'caution',
  multiple_significant_warnings: 'bad',
  insufficient_information: 'neutral',
};

export const CONFIDENCE_TONE: Record<ConfidenceLabel, Tone> = {
  high: 'good',
  moderate: 'neutral',
  low: 'caution',
};
