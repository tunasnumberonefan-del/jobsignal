// Decides how much of a stored report a given viewer gets to see. Stored reports are
// always complete; trimming happens on the way out, on the server, based on the
// viewer's plan. The browser never decides this.

import type { Entitlements } from '@shared/entitlements';
import type { Finding, Report } from '@shared/types';

export interface ViewFinding extends Omit<Finding, 'detail'> {
  detail: string | null;
  locked?: boolean;
}

export interface ReportView extends Omit<Report, 'findings'> {
  findings: ViewFinding[];
  locks: { findings: number; history: boolean; financials: boolean; events: number };
}

const ALWAYS_SHOW = new Set(['fraud_notice', 'manual_only', 'not_live', 'warn_none_found', 'first_observation']);

export function viewReport(report: Report, ent: Entitlements): ReportView {
  // Warnings, cautions, and safety notes are always shown in full on every plan.
  // The preview limit only trims the long tail of positive/neutral detail.
  const preview = ent.findingsPreview;
  let shown = 0;
  const findings: ViewFinding[] = report.findings.map((f) => {
    if (ALWAYS_SHOW.has(f.ruleId) || f.polarity === 'warning' || f.polarity === 'caution') return f;
    shown++;
    return preview === null || shown <= preview ? f : { ...f, detail: null, sources: [], locked: true };
  });
  const lockedFindings = findings.filter((f) => f.locked).length;

  const profile = { ...report.employerProfile };
  let lockedEvents = 0;
  if (!ent.fullEvidence) {
    lockedEvents = Math.max(0, profile.events.length - 5);
    profile.events = profile.events.slice(0, 5);
  }
  const history = report.history && !ent.postingHistory
    ? { ...report.history, similarPostings: report.history.similarPostings.slice(0, 3) }
    : report.history;

  return {
    ...report,
    employerProfile: ent.fullEvidence ? profile : { ...profile, financials: [] },
    history,
    findings,
    locks: {
      findings: lockedFindings,
      history: !ent.postingHistory,
      financials: !ent.fullEvidence && report.employerProfile.financials.length > 0,
      events: lockedEvents,
    },
  };
}
