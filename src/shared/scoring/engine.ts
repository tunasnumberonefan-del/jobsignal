// Turns an evidence bundle into a report. Pure function: same input, same output.
// Three separate answers come out (posting, employer, confidence). We never fold them into one number.

import type {
  ConfidenceLabel, EmployerLabel, EvidenceBundle, Finding, PostingLabel, Report, SourceRef,
} from '../types';
import { SCORING_VERSION, SERIOUS_POSTING_RULES, THRESHOLDS as T } from './config';
import { buildContext, daysBetween, EMPLOYER_RULES, POSTING_RULES, type Rule } from './rules';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function runRules(rules: Rule[], bundle: EvidenceBundle): Finding[] {
  const ctx = buildContext(bundle);
  return rules.flatMap((r) => r.run(ctx));
}

export function postingVerdict(bundle: EvidenceBundle, findings: Finding[]): { label: PostingLabel; score: number; headline: string } {
  const score = clamp(50 + findings.reduce((s, x) => s + x.weight, 0));
  const ids = new Set(findings.map((x) => x.ruleId));
  const serious = findings.filter((x) => SERIOUS_POSTING_RULES.has(x.ruleId));
  const warnings = findings.filter((x) => x.polarity === 'warning');
  const cautionTotal = findings.filter((x) => x.weight < 0).reduce((s, x) => s + x.weight, 0);

  if (serious.length >= 1 && (serious.length >= 2 || warnings.length >= 2 || !bundle.posting.liveOnOfficialSource)) {
    return { label: 'significant_inconsistencies', score, headline: 'This listing has several patterns common in job scams. Be careful.' };
  }
  if (ids.has('not_live')) {
    return { label: 'unable_to_verify', score, headline: 'The listing is no longer published at this link.' };
  }
  if (ids.has('fetch_failed') || ids.has('fetch_blocked') || ids.has('fetch_unsupported')) {
    if (bundle.posting.descriptionText.trim().length < 40) {
      return { label: 'unable_to_verify', score, headline: "We couldn't read the listing. Paste the description to check it." };
    }
  }
  if (serious.length === 1) {
    return { label: 'some_caution', score, headline: 'Listed through an official source, but the text asks for things real employers rarely ask for up front.' };
  }
  const verified = bundle.posting.liveOnOfficialSource === true || ids.has('structured_data_own_domain');
  if (!verified) {
    if (cautionTotal <= -15) return { label: 'some_caution', score, headline: "We couldn't verify it at the source, and a few things in the text are worth a second look." };
    return { label: 'limited_evidence', score, headline: "We couldn't confirm it at the source, so there isn't much to go on." };
  }
  if (warnings.length >= 1 || cautionTotal <= -15) {
    return { label: 'some_caution', score, headline: 'The listing is real, but a few things are worth asking about.' };
  }
  if (score >= T.strongPostingScore) {
    return { label: 'strong_signals', score, headline: 'Live on the employer\'s own job board, with nothing unusual in the listing.' };
  }
  return { label: 'some_caution', score, headline: 'The listing checks out, with a couple of minor notes.' };
}

export function employerVerdict(bundle: EvidenceBundle, findings: Finding[]): { label: EmployerLabel; score: number; headline: string } {
  const score = clamp(50 + findings.reduce((s, x) => s + x.weight, 0));
  const warnings = findings.filter((x) => x.polarity === 'warning');
  const cautions = findings.filter((x) => x.polarity === 'caution');
  const e = bundle.employer;

  if (!e.name) return { label: 'insufficient_information', score, headline: "We don't know who the employer is, so we couldn't research them." };
  if (warnings.length >= 2 || findings.some((x) => x.ruleId === 'sec_bankruptcy')) {
    return { label: 'multiple_significant_warnings', score, headline: 'Public records show more than one significant warning sign.' };
  }
  if (warnings.length === 1 || cautions.length >= 1) {
    return { label: 'some_warnings', score, headline: 'Public records show something worth knowing before you apply.' };
  }
  // "Nothing bad found" only counts when we actually had decent public data to look at.
  const hasRealCoverage = e.checked.sec.matched || e.financials.length > 0;
  if (hasRealCoverage) {
    return { label: 'no_significant_warnings', score, headline: "We didn't find warning signs in the public records we checked." };
  }
  return { label: 'insufficient_information', score, headline: "There isn't much public information about this employer. That's common for private companies." };
}

export function confidence(bundle: EvidenceBundle, findings: Finding[]): { label: ConfidenceLabel; score: number; headline: string; gaps: string[] } {
  const p = bundle.posting;
  const e = bundle.employer;
  let pts = 0;
  const gaps: string[] = [];

  if (p.liveOnOfficialSource) pts += 25;
  else if (p.sourceKind === 'jsonld') pts += 15;
  else gaps.push(bundle.inputKind === 'manual' ? 'Posting text was pasted in, not checked against the source' : 'Could not confirm the listing at its source');

  if (p.publishedAt) pts += 10;
  else gaps.push('No original posting date');

  if (p.employerName) pts += 10;
  else gaps.push('Employer not identified');

  if (bundle.history && bundle.history.observationCount > 1) pts += 10;
  else gaps.push('No history yet: first time JobSignal has seen it');

  if (e.checked.sec.matched) pts += 20;
  else if (e.checked.sec.ran) pts += 5;
  else gaps.push('SEC filings not checked');

  if (e.checked.warn.ran) pts += 10;
  else gaps.push('WARN notices not checked');

  if (p.descriptionText.split(/\s+/).length >= 150) pts += 10;
  else gaps.push('Short description');

  // Stale evidence is worth less. Everything here is fetched live, except company events, which can lag.
  const newestEvent = e.events.map((x) => x.date).sort().at(-1);
  if (!newestEvent || (daysBetween(newestEvent, Date.parse(bundle.now)) ?? 0) < 400) pts += 5;

  const score = clamp(pts);
  const label: ConfidenceLabel = score >= 70 ? 'high' : score >= 40 ? 'moderate' : 'low';
  const headline =
    label === 'high' ? 'Most of what we look for was available and current.'
      : label === 'moderate' ? 'We found a fair amount, but there are gaps.'
        : "A lot of what we'd normally check wasn't available. Treat this report as partial.";
  void findings;
  return { label, score, headline, gaps };
}

export function suggestedQuestions(findings: Finding[]): string[] {
  const ids = new Set(findings.map((f) => f.ruleId));
  const q: string[] = [];
  if (ids.has('open_61_120_days') || ids.has('open_over_120_days') || ids.has('reposted') || ids.has('reopened'))
    q.push('Is this role still being actively filled, and where are you in the process?');
  if (ids.has('pipeline_language')) q.push('Is there a specific opening right now, or is this for future roles?');
  if (ids.has('pay_missing') || ids.has('pay_missing_transparency_state')) q.push("What's the pay range for this role?");
  if (ids.has('warn_recent') || ids.has('sec_restructuring')) q.push('Was the team I would join affected by the recent layoffs or restructuring?');
  if (ids.has('going_concern') || ids.has('revenue_down') || ids.has('sec_bankruptcy')) q.push("How is the company funded over the next year, and how secure is this team's budget?");
  if (ids.has('reposted')) q.push('What happened with the last person in this role?');
  if (ids.has('employer_missing') || ids.has('apply_domain_mismatch')) q.push('Who is the actual employer, and will I be on their payroll or an agency\'s?');
  if (ids.has('asks_sensitive_info') || ids.has('asks_for_payment') || ids.has('off_platform_chat'))
    q.push('Can we continue this through your company email and a video call? (Never send ID, bank details, or money before a written offer.)');
  if (ids.has('contradictory_requirements')) q.push('Is this entry level, or do you need someone with several years of experience?');
  q.push('Who would I report to, and can I talk with someone on the team?');
  q.push('What does the interview process look like, and how long does it usually take?');
  return q.slice(0, 6);
}

function dedupeSources(list: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = `${s.name}|${s.url ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const ORDER: Record<Finding['polarity'], number> = { warning: 0, caution: 1, positive: 2, info: 3, missing: 4 };

export function buildReport(bundle: EvidenceBundle): Report {
  const postingFindings = runRules(POSTING_RULES, bundle);
  const employerFindings = runRules(EMPLOYER_RULES, bundle);
  const findings = [...postingFindings, ...employerFindings].sort(
    (a, b) => ORDER[a.polarity] - ORDER[b.polarity] || Math.abs(b.weight) - Math.abs(a.weight),
  );
  const p = bundle.posting;
  return {
    version: 1,
    scoringVersion: SCORING_VERSION,
    generatedAt: bundle.now,
    inputKind: bundle.inputKind,
    job: {
      title: p.title,
      employer: p.employerName ?? bundle.employer.name,
      location: p.location,
      employmentType: p.employmentType,
      compensationText: p.compensationText,
      applyUrl: p.applyUrl,
      canonicalUrl: p.canonicalUrl,
      sourceKind: p.sourceKind,
      publishedAt: p.publishedAt,
      sourceUpdatedAt: p.sourceUpdatedAt,
      validThrough: p.validThrough,
    },
    posting: postingVerdict(bundle, postingFindings),
    employer: employerVerdict(bundle, employerFindings),
    confidence: confidence(bundle, findings),
    findings,
    history: bundle.history,
    employerProfile: bundle.employer,
    questions: suggestedQuestions(findings),
    sources: dedupeSources([...p.sources, ...bundle.employer.sources, ...findings.flatMap((x) => x.sources)]),
  };
}
