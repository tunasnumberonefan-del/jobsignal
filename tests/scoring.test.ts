import { describe, expect, it } from 'vitest';
import { buildReport } from '@shared/scoring/engine';
import { analyzeText, statesInLocation } from '@shared/scoring/text';
import type { CompanyEvent, EvidenceBundle, PostingEvidence } from '@shared/types';

const NOW = '2026-10-15T12:00:00.000Z';
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86_400_000).toISOString();

const GOOD_TEXT = `What you'll do
- Build and run the billing service in Go
- Own on-call for the ledger one week in six
- Work with product on new pricing features
Qualifications
- 5+ years building backend systems
- Postgres and queues experience
${'We care about careful engineering, clear writing, and steady delivery. '.repeat(30)}`;

function posting(p: Partial<PostingEvidence> = {}): PostingEvidence {
  return {
    sourceKind: 'greenhouse',
    inputUrl: 'https://boards.greenhouse.io/acme/jobs/1',
    canonicalUrl: 'https://boards.greenhouse.io/acme/jobs/1',
    liveOnOfficialSource: true,
    fetchOutcome: 'ok',
    employerName: 'Acme Robotics',
    title: 'Backend Engineer',
    location: 'Austin, TX',
    compensationText: '$150k – $180k',
    publishedAt: daysAgo(10),
    descriptionText: GOOD_TEXT,
    sources: [{ name: 'Greenhouse Job Board API', reliability: 'official' }],
    boardOpenRoles: 25,
    ...p,
  };
}

function bundle(over: { posting?: Partial<PostingEvidence>; events?: CompanyEvent[]; inputKind?: 'url' | 'manual'; sec?: { ran: boolean; matched: boolean; error?: string }; history?: EvidenceBundle['history']; financials?: EvidenceBundle['employer']['financials'] } = {}): EvidenceBundle {
  return {
    now: NOW,
    inputKind: over.inputKind ?? 'url',
    posting: posting(over.posting),
    history: over.history === undefined ? { firstSeenAt: daysAgo(20), lastSeenAt: NOW, observationCount: 4, reopenedCount: 0, similarPostings: [], descriptionChanges: 0 } : over.history,
    employer: {
      name: over.posting?.employerName === undefined ? 'Acme Robotics' : over.posting.employerName,
      checked: { warn: { states: ['TX', 'CA'], ran: true }, sec: over.sec ?? { ran: true, matched: true } },
      events: over.events ?? [],
      financials: over.financials ?? [],
      latestPeriodicFiling: { form: '10-Q', date: daysAgo(40), url: 'https://www.sec.gov/x' },
      sources: [],
    },
  };
}

const warn = (days: number, n: number, q: 'exact' | 'probable' = 'exact'): CompanyEvent => ({
  kind: 'warn_notice', date: daysAgo(days), title: 'WARN notice: Austin, TX', magnitude: n, matchQuality: q,
  source: { name: 'Texas Workforce Commission', reliability: 'official' },
});

describe('posting verification', () => {
  it('a live, clear, recent listing on an official ATS gets strong signals', () => {
    const r = buildReport(bundle());
    expect(r.posting.label).toBe('strong_signals');
    expect(r.findings.map((f) => f.ruleId)).toContain('official_live');
    expect(r.confidence.label).toBe('high');
  });

  it('a legitimate job with no salary is not harshly penalized', () => {
    const r = buildReport(bundle({ posting: { compensationText: undefined, descriptionText: GOOD_TEXT, location: 'Austin, TX' } }));
    expect(r.posting.label).toBe('strong_signals');
    const pay = r.findings.find((f) => f.ruleId.startsWith('pay_'));
    expect(pay?.ruleId).toBe('pay_missing');
    expect(pay?.weight).toBe(0);
  });

  it('missing pay in a pay-transparency state is only a small note', () => {
    const r = buildReport(bundle({ posting: { compensationText: undefined, location: 'San Francisco, CA' } }));
    const f = r.findings.find((x) => x.ruleId === 'pay_missing_transparency_state')!;
    expect(f.weight).toBeGreaterThanOrEqual(-3);
    expect(r.posting.label).toBe('strong_signals');
  });

  it('a dead URL is reported as no longer published, not as fake', () => {
    const r = buildReport(bundle({ posting: { fetchOutcome: 'not_found', liveOnOfficialSource: false, descriptionText: '', title: 'Backend Engineer' } }));
    expect(r.posting.label).toBe('unable_to_verify');
    expect(r.posting.headline).toMatch(/no longer published/);
    expect(r.posting.headline).not.toMatch(/scam|fake|fraud/i);
  });

  it('manually entered text is never presented as verified', () => {
    const r = buildReport(bundle({ inputKind: 'manual', posting: { sourceKind: 'manual', liveOnOfficialSource: null, fetchOutcome: null, sources: [{ name: 'Text you pasted', reliability: 'user_supplied' }] } }));
    expect(r.posting.label).toBe('limited_evidence');
    expect(r.findings.some((f) => f.ruleId === 'official_live')).toBe(false);
    expect(r.findings.some((f) => f.ruleId === 'manual_only')).toBe(true);
    expect(r.confidence.gaps.join(' ')).toMatch(/pasted/);
  });

  it('a new posting with no history lowers confidence but not the posting label', () => {
    const withHistory = buildReport(bundle());
    const fresh = buildReport(bundle({ history: { firstSeenAt: NOW, lastSeenAt: NOW, observationCount: 1, reopenedCount: 0, similarPostings: [], descriptionChanges: 0 } }));
    expect(fresh.posting.label).toBe(withHistory.posting.label);
    expect(fresh.confidence.score).toBeLessThan(withHistory.confidence.score);
    expect(fresh.findings.find((f) => f.ruleId === 'first_observation')?.polarity).toBe('missing');
  });

  it('never treats an updated date as a posting date', () => {
    const r = buildReport(bundle({ posting: { publishedAt: undefined, sourceUpdatedAt: daysAgo(2) } }));
    expect(r.findings.some((f) => f.ruleId === 'fresh_posting')).toBe(false);
    expect(r.findings.find((f) => f.ruleId === 'only_updated_date')?.polarity).toBe('missing');
  });

  it('long-open listings get a caution, with neutral wording', () => {
    const r = buildReport(bundle({ posting: { publishedAt: daysAgo(170) } }));
    const f = r.findings.find((x) => x.ruleId === 'open_over_120_days')!;
    expect(f.polarity).toBe('caution');
    expect(f.detail).not.toMatch(/ghost|fake|scam/i);
    expect(r.questions.some((q) => /being actively filled/.test(q))).toBe(true);
  });

  it('flags reposted jobs only when there are earlier closed copies', () => {
    const history = { firstSeenAt: daysAgo(5), lastSeenAt: NOW, observationCount: 2, reopenedCount: 0, descriptionChanges: 0, similarPostings: [
      { key: 'greenhouse:acme:1', firstSeenAt: daysAgo(200), lastSeenAt: daysAgo(150), status: 'closed' },
      { key: 'greenhouse:acme:2', firstSeenAt: daysAgo(120), lastSeenAt: daysAgo(60), status: 'closed' },
    ] };
    const r = buildReport(bundle({ history }));
    expect(r.findings.find((f) => f.ruleId === 'reposted')?.polarity).toBe('caution');
    const one = buildReport(bundle({ history: { ...history, similarPostings: [history.similarPostings[0]!] } }));
    expect(one.findings.some((f) => f.ruleId === 'reposted')).toBe(false);
  });

  it('scam patterns produce significant inconsistencies', () => {
    const text = `${GOOD_TEXT}\nAfter the interview on Telegram, we will send you a check to purchase your own equipment from our vendor. Please send your bank account details and Social Security number with your application.`;
    const r = buildReport(bundle({ posting: { descriptionText: text } }));
    expect(r.posting.label).toBe('significant_inconsistencies');
    expect(r.findings.filter((f) => f.polarity === 'warning').length).toBeGreaterThanOrEqual(2);
  });

  it('does not mistake an anti-fraud notice for a scam request', () => {
    const text = `${GOOD_TEXT}\nOur recruiters will never ask for your Social Security number, bank account details, or payment. We'll also never ask you to pay a fee, send money, or purchase work-related equipment. Recruiters only email from @acme.com addresses.`;
    const r = buildReport(bundle({ posting: { descriptionText: text } }));
    expect(r.findings.some((f) => f.ruleId === 'asks_sensitive_info' || f.ruleId === 'asks_for_payment')).toBe(false);
    const notice = r.findings.find((f) => f.ruleId === 'fraud_notice');
    expect(notice?.detail).toContain('@acme.com');
    expect(r.posting.label).toBe('strong_signals');
  });

  it('"broadest talent pool" inclusion language is not pipeline language', () => {
    const t = analyzeText('We are committed to working with the broadest talent pool possible.');
    expect(t.pipelineLanguage).toEqual([]);
    expect(analyzeText('Join our talent community to hear about future roles.').pipelineLanguage.length).toBe(1);
  });
});

describe('employer stability', () => {
  it('no events with real SEC coverage -> no significant warnings (never "safe")', () => {
    const r = buildReport(bundle());
    expect(r.employer.label).toBe('no_significant_warnings');
    expect(r.employer.headline).not.toMatch(/safe|secure|guarantee/i);
  });

  it('a company with no public financial information is "insufficient", not penalized', () => {
    const r = buildReport(bundle({ sec: { ran: true, matched: false } }));
    expect(r.employer.label).toBe('insufficient_information');
    expect(r.employer.score).toBeGreaterThanOrEqual(50);
  });

  it('a recent large WARN notice is a warning', () => {
    const r = buildReport(bundle({ events: [warn(40, 200)] }));
    expect(r.employer.label).toBe('some_warnings');
    const f = r.findings.find((x) => x.ruleId === 'warn_recent')!;
    expect(f.weight).toBe(-25);
    expect(f.sources[0]?.reliability).toBe('official');
  });

  it('probable (not exact) name matches are softened and labeled', () => {
    const r = buildReport(bundle({ events: [warn(200, 50, 'probable')] }));
    const f = r.findings.find((x) => x.ruleId === 'warn_recent')!;
    expect(f.polarity).toBe('caution');
    expect(f.detail).toMatch(/not exactly/);
  });

  it('bankruptcy plus layoffs is multiple significant warnings', () => {
    const r = buildReport(bundle({ events: [warn(30, 300), { kind: 'sec_bankruptcy', date: daysAgo(20), title: 'x', matchQuality: 'exact', source: { name: 'SEC', reliability: 'official' } }] }));
    expect(r.employer.label).toBe('multiple_significant_warnings');
  });

  it('old WARN notices are context only', () => {
    const r = buildReport(bundle({ events: [warn(500, 300)] }));
    expect(r.findings.find((x) => x.ruleId === 'warn_older')?.weight).toBe(0);
    expect(r.employer.label).toBe('no_significant_warnings');
  });

  it('a large revenue drop is a caution, with context', () => {
    const r = buildReport(bundle({ financials: [{ label: 'Revenue', unit: 'USD', fiscalYear: 2025, value: 70, priorValue: 100, filed: '2026-02-01', form: '10-K' }] }));
    expect(r.findings.find((x) => x.ruleId === 'revenue_down')?.polarity).toBe('caution');
  });

  it('a failed SEC lookup lowers confidence instead of implying anything', () => {
    const r = buildReport(bundle({ sec: { ran: false, matched: false, error: 'HTTP 503' } }));
    expect(r.findings.some((f) => f.ruleId === 'sec_unavailable')).toBe(true);
    expect(r.confidence.gaps).toContain('SEC filings not checked');
  });
});

describe('determinism and versioning', () => {
  it('same evidence -> identical report', () => {
    expect(JSON.stringify(buildReport(bundle({ events: [warn(10, 120)] })))).toBe(JSON.stringify(buildReport(bundle({ events: [warn(10, 120)] }))));
  });
  it('records the rules version', () => {
    expect(buildReport(bundle()).scoringVersion).toMatch(/^\d{4}\.\d+\.\d+$/);
  });
  it('keeps the three dimensions separate', () => {
    const r = buildReport(bundle({ events: [warn(10, 500), { kind: 'going_concern', date: daysAgo(30), title: '10-K', matchQuality: 'exact', source: { name: 'SEC', reliability: 'official' } }] }));
    expect(r.posting.label).toBe('strong_signals');
    expect(r.employer.label).toBe('multiple_significant_warnings');
  });
});

describe('location parsing', () => {
  it('finds states and avoids DC/Washington confusion', () => {
    expect(statesInLocation('Austin, TX')).toEqual(['TX']);
    expect(statesInLocation('Washington, DC')).toEqual(['DC']);
    expect(statesInLocation('Remote')).toEqual([]);
    expect(statesInLocation('New York City / San Francisco').sort()).toEqual(['CA', 'NY']);
  });
});
