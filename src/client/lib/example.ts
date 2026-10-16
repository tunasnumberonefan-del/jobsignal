// A made-up report for the landing page. The company does not exist. Every place that
// shows it labels it as an example, so nobody mistakes it for a claim about a real employer.

import type { ReportView } from './types';

export const EXAMPLE_REPORT: ReportView = {
  version: 1,
  scoringVersion: 'example',
  generatedAt: '2026-10-14T15:20:00.000Z',
  inputKind: 'url',
  job: {
    title: 'Operations Analyst',
    employer: 'Halden Freight Systems (fictional)',
    location: 'Austin, TX · Hybrid',
    compensationText: '$68k – $82k',
    sourceKind: 'greenhouse',
    publishedAt: '2026-05-02T00:00:00.000Z',
  },
  posting: { label: 'some_caution', score: 58, headline: 'The listing is real, but a few things are worth asking about.' },
  employer: { label: 'some_warnings', score: 30, headline: 'Public records show something worth knowing before you apply.' },
  confidence: { label: 'high', score: 75, headline: 'Most of what we look for was available and current.', gaps: [] },
  findings: [
    { ruleId: 'open_over_120_days', dimension: 'posting', polarity: 'caution', weight: -15, title: 'Open for 165 days', detail: 'First published May 2. Roles open this long are sometimes already filled or not being actively hired for. Worth asking before you put hours in.', sources: [] },
    { ruleId: 'reposted', dimension: 'posting', polarity: 'caution', weight: -8, title: 'Looks reposted: 2 earlier listings with the same title and location', detail: 'Reposting is often routine. Still worth asking whether the last hire fell through.', sources: [] },
    { ruleId: 'warn_recent', dimension: 'employer', polarity: 'warning', weight: -20, title: '1 WARN layoff notice in the last 12 months (140 people)', detail: 'Filed with the Texas Workforce Commission in August for a warehouse site in Round Rock. Official state record.', sources: [] },
    { ruleId: 'official_live', dimension: 'posting', polarity: 'positive', weight: 35, title: "Live on the employer's Greenhouse job board", detail: "Pulled straight from Greenhouse's public API just now.", sources: [] },
    { ruleId: 'pay_listed', dimension: 'posting', polarity: 'positive', weight: 5, title: 'Pay range listed', detail: '$68k – $82k', sources: [] },
  ],
  history: null,
  employerProfile: {
    name: 'Halden Freight Systems (fictional)',
    checked: { warn: { states: ['TX', 'CA'], ran: true }, sec: { ran: true, matched: false } },
    events: [],
    financials: [],
    sources: [],
  },
  questions: [
    'Is this role still being actively filled, and where are you in the process?',
    'Was the team I would join affected by the recent layoffs?',
    'What happened with the last person in this role?',
  ],
  sources: [],
  locks: { findings: 0, history: false, financials: false, events: 0 },
};
