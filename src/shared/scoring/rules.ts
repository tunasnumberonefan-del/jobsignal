// Each rule looks at the evidence bundle and returns zero or more findings.
// Rules never fetch anything and never guess. If the data isn't there, they either
// stay quiet or emit a 'missing' finding so confidence goes down.

import type { EvidenceBundle, Finding, SourceRef } from '../types';
import { THRESHOLDS as T, WEIGHTS as W } from './config';
import { analyzeText, PAY_TRANSPARENCY_STATES, statesInLocation, type TextSignals } from './text';
import { baseDomain } from '../normalize';

export interface RuleContext {
  bundle: EvidenceBundle;
  text: TextSignals;
  nowMs: number;
}

export interface Rule {
  id: string;
  dimension: 'posting' | 'employer';
  /** One line for the methodology page. */
  describe: string;
  run(ctx: RuleContext): Finding[];
}

const DAY = 86_400_000;

export function daysBetween(fromIso: string, nowMs: number): number | null {
  const t = Date.parse(fromIso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((nowMs - t) / DAY);
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}

function f(
  ruleId: string,
  dimension: Finding['dimension'],
  polarity: Finding['polarity'],
  weight: number,
  title: string,
  detail: string,
  sources: SourceRef[] = [],
): Finding {
  return { ruleId, dimension, polarity, weight, title, detail, sources };
}

const ATS_HOSTS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'workday.com', 'smartrecruiters.com',
  'icims.com', 'jobvite.com', 'bamboohr.com', 'workable.com', 'taleo.net', 'successfactors.com',
  'breezy.hr', 'recruitee.com', 'jazzhr.com', 'applytojob.com', 'paylocity.com', 'adp.com',
  'ultipro.com', 'rippling.com', 'dayforcehcm.com', 'oraclecloud.com', 'teamtailor.com', 'personio.de',
];

function isAtsHost(host: string): boolean {
  const h = host.toLowerCase();
  return ATS_HOSTS.some((a) => h === a || h.endsWith('.' + a));
}

// ===================================================================== posting

export const POSTING_RULES: Rule[] = [
  {
    id: 'source_check',
    dimension: 'posting',
    describe: 'Is the listing live on an official source (ATS API or the employer page), gone, or unreadable?',
    run({ bundle }) {
      const p = bundle.posting;
      const src = p.sources.filter((s) => s.reliability === 'official');
      if (bundle.inputKind === 'manual') {
        return [f('manual_only', 'posting', 'missing', 0,
          'You pasted this text, so we could not check it against the source',
          "Everything below is based on the text you gave us. We haven't confirmed it matches a live listing. If you have the link, run it again with the URL.")];
      }
      if (p.fetchOutcome === 'not_found' || p.fetchOutcome === 'gone') {
        return [f('not_live', 'posting', 'warning', W.not_live,
          'This listing is no longer published at this link',
          "The job board answered, but the posting isn't there anymore. It may have been filled, paused, or moved. That's normal for closed roles, but it does mean you probably can't apply through this link.", src)];
      }
      if (p.liveOnOfficialSource && (p.sourceKind === 'greenhouse' || p.sourceKind === 'lever' || p.sourceKind === 'ashby')) {
        const board = p.sourceKind[0]!.toUpperCase() + p.sourceKind.slice(1);
        return [f('official_live', 'posting', 'positive', W.official_live,
          `Live on ${p.employerName ? p.employerName + "'s" : 'the employer\'s'} ${board} job board`,
          `We pulled this straight from ${board}'s public job board API just now. The listing exists and is published on that board.`, src)];
      }
      if (p.sourceKind === 'jsonld') {
        const out = [f('structured_data', 'posting', 'positive', W.structured_data,
          'The page publishes structured job data',
          'The page includes schema.org JobPosting data (the format Google for Jobs reads). It tells us the job, employer, and dates the page itself claims.', p.sources)];
        if (p.employerDomain && p.canonicalUrl) {
          try {
            const pageHost = baseDomain(new URL(p.canonicalUrl).hostname);
            if (pageHost === baseDomain(p.employerDomain)) {
              out.push(f('structured_data_own_domain', 'posting', 'positive', W.structured_data_own_domain,
                "Hosted on the employer's own website",
                `The page lives on ${pageHost}, which matches the employer's website listed in the job data.`, p.sources));
            }
          } catch { /* ignore bad url */ }
        }
        return out;
      }
      if (p.fetchOutcome === 'blocked') {
        return [f('fetch_blocked', 'posting', 'missing', 0,
          "That site doesn't allow automated checks",
          "The site's robots.txt or access rules asked us not to read the page, so we didn't. Paste the description and we'll check the text.")];
      }
      if (p.fetchOutcome === 'unsupported') {
        return [f('fetch_unsupported', 'posting', 'missing', 0,
          "We can't read listings from this site yet",
          'We could reach the page but found no job data we can read reliably. The checks below are based only on what you pasted.')];
      }
      return [f('fetch_failed', 'posting', 'missing', 0,
        "We couldn't load the listing",
        "The site didn't respond normally when we checked. That's often temporary. It doesn't tell us anything about the job itself.")];
    },
  },
  {
    id: 'employer_identity',
    dimension: 'posting',
    describe: 'Can we tell who the employer is?',
    run({ bundle }) {
      const p = bundle.posting;
      if (p.employerName) {
        return [f('employer_identified', 'posting', 'positive', W.employer_identified,
          `Employer named: ${p.employerName}`,
          p.liveOnOfficialSource ? 'The job board identifies the company that owns it.' : 'The listing names the company it is hiring for.', p.sources)];
      }
      return [f('employer_missing', 'posting', 'caution', W.employer_missing,
        'No clear employer named',
        "We couldn't find the company's name in the listing. Real recruiters sometimes post for unnamed clients, but you should know who you're applying to before sharing personal details.")];
    },
  },
  {
    id: 'posting_age',
    dimension: 'posting',
    describe: 'How long has it been open, using only dates the source actually states.',
    run({ bundle, nowMs }) {
      const p = bundle.posting;
      const out: Finding[] = [];
      if (p.publishedAt) {
        const days = daysBetween(p.publishedAt, nowMs);
        if (days !== null && days >= 0) {
          if (days <= T.freshDays) {
            out.push(f('fresh_posting', 'posting', 'positive', W.fresh_posting,
              days <= 1 ? 'Posted in the last day' : `Posted ${days} days ago`,
              `The source says it was first published on ${fmtDate(p.publishedAt)}. Newer listings are more likely to still be in active review.`, p.sources));
          } else if (days <= T.oldDays) {
            out.push(f('posting_age', 'posting', 'info', 0,
              `Posted ${days} days ago`,
              `First published on ${fmtDate(p.publishedAt)}. A month or two is a normal hiring timeline.`, p.sources));
          } else if (days <= T.veryOldDays) {
            out.push(f('open_61_120_days', 'posting', 'caution', W.open_61_120_days,
              `Open for ${days} days`,
              `First published on ${fmtDate(p.publishedAt)}. Roles open this long are sometimes already filled, on hold, or kept up to collect resumes. Plenty are still real. Worth asking where they are in the process.`, p.sources));
          } else {
            out.push(f('open_over_120_days', 'posting', 'caution', W.open_over_120_days,
              `Open for ${days} days`,
              `First published on ${fmtDate(p.publishedAt)}, over four months ago. That's long for most roles. Some are genuinely hard to fill, others aren't being actively hired for. Ask before you put hours into the application.`, p.sources));
          }
        }
      } else if (p.sourceUpdatedAt) {
        out.push(f('only_updated_date', 'posting', 'missing', 0,
          'No original posting date available',
          `The source only shows a "last updated" date (${fmtDate(p.sourceUpdatedAt)}). That's when someone last edited it, not when it was first posted, so we don't use it to judge age.`, p.sources));
      } else if (bundle.inputKind === 'url') {
        out.push(f('no_dates', 'posting', 'missing', 0,
          'No posting date available',
          "The source doesn't say when this was posted. We'll start tracking it from today."));
      }
      if (p.validThrough) {
        const d = daysBetween(p.validThrough, nowMs);
        if (d !== null && d > 0) {
          out.push(f('past_valid_through', 'posting', 'warning', W.past_valid_through,
            'The listing says applications closed',
            `The page's own data says it was valid through ${fmtDate(p.validThrough)}, ${plural(d, 'day')} ago, but it's still up.`, p.sources));
        }
      }
      return out;
    },
  },
  {
    id: 'observed_history',
    dimension: 'posting',
    describe: 'What JobSignal has seen of this listing and look-alikes over time.',
    run({ bundle }) {
      const h = bundle.history;
      const out: Finding[] = [];
      if (!h) return out;
      if (h.observationCount <= 1) {
        out.push(f('first_observation', 'posting', 'missing', 0,
          'First time we have seen this listing',
          "We don't have history on it yet, so we can't tell you whether it's been reposted. Save it and we'll keep watching."));
      } else {
        out.push(f('observed_before', 'posting', 'info', 0,
          `We've checked it ${plural(h.observationCount, 'time')} since ${fmtDate(h.firstSeenAt)}`,
          `First seen by JobSignal on ${fmtDate(h.firstSeenAt)}, last confirmed ${fmtDate(h.lastSeenAt)}.`));
      }
      if (h.reopenedCount > 0) {
        out.push(f('reopened', 'posting', 'caution', W.reopened,
          `Taken down and put back up ${plural(h.reopenedCount, 'time')}`,
          'We saw this listing disappear and come back. That can be a re-opened search, or a role that never really closes.'));
      }
      const older = h.similarPostings.filter((s) => s.status === 'closed');
      if (older.length >= 2) {
        out.push(f('reposted', 'posting', 'caution', W.reposted,
          `Looks reposted: ${plural(older.length, 'earlier listing')} with the same title and location`,
          `We've seen ${older.length} earlier, now-closed listings from this employer with the same title and location, the first on ${fmtDate(older.map((o) => o.firstSeenAt).sort()[0]!)}. Reposting is common and often routine. It's still worth asking whether the last hire fell through or the role keeps turning over.`));
      } else if (h.similarPostings.length > 0) {
        out.push(f('similar_seen', 'posting', 'info', 0,
          `${plural(h.similarPostings.length, 'similar listing')} seen before`,
          'We have seen other listings from this employer with the same title and location. On its own that usually just means they hire for this role regularly.'));
      }
      if (h.descriptionChanges > 0) {
        out.push(f('description_changed', 'posting', 'info', 0,
          `Description edited ${plural(h.descriptionChanges, 'time')} since we first saw it`,
          'Edits are normal. Pro accounts can see exactly what changed.'));
      }
      return out;
    },
  },
  {
    id: 'board_duplicates',
    dimension: 'posting',
    describe: 'Same title and location listed several times on the same board.',
    run({ bundle }) {
      const n = bundle.posting.boardDuplicates ?? 0;
      if (n < 1) return [];
      return [f('board_duplicates', 'posting', 'info', 0,
        `${plural(n + 1, 'open listing')} with this exact title and location on the board`,
        'That can mean they are hiring several people for the same role, or that one role is posted more than once. Either way it is not a red flag by itself.', bundle.posting.sources)];
    },
  },
  {
    id: 'description_quality',
    dimension: 'posting',
    describe: 'Does the description say what the job is and what they want?',
    run({ text }) {
      const out: Finding[] = [];
      if (text.wordCount >= T.minSpecificWords && text.hasResponsibilities && text.hasQualifications) {
        out.push(f('specific_description', 'posting', 'positive', W.specific_description,
          'Clear description of the work and requirements',
          `About ${Math.round(text.wordCount / 10) * 10} words, with separate sections for what you'd do and what they're looking for.`));
      } else if (text.wordCount < T.vagueWords || (!text.hasResponsibilities && text.bulletCount < 3)) {
        out.push(f('vague_description', 'posting', 'caution', W.vague_description,
          'Thin on details',
          `The description is short (about ${text.wordCount} words) or doesn't really say what the day-to-day work is. Scam listings and placeholder listings both tend to be vague, but so are some small employers.`));
      }
      if (text.entryLevelLanguage && (text.maxYearsRequired ?? 0) >= 5) {
        out.push(f('contradictory_requirements', 'posting', 'caution', W.contradictory_requirements,
          'Entry-level wording, but asks for years of experience',
          `It's described as entry level or for new grads, but also mentions ${text.maxYearsRequired}+ years of experience. Could be a copy-paste mistake. Worth clarifying before you apply.`));
      }
      return out;
    },
  },
  {
    id: 'compensation',
    dimension: 'posting',
    describe: 'Is pay listed? Missing pay is only noted, except in states that require it.',
    run({ bundle, text }) {
      const p = bundle.posting;
      const pay = p.compensationText || text.payInText;
      if (pay) {
        return [f('pay_listed', 'posting', 'positive', W.pay_listed,
          'Pay range listed', `Listed as: ${pay.slice(0, 120)}`)];
      }
      const lawStates = statesInLocation(p.location).filter((s) => PAY_TRANSPARENCY_STATES[s]);
      if (lawStates.length && bundle.inputKind === 'url') {
        const names = lawStates.map((s) => PAY_TRANSPARENCY_STATES[s]).join(', ');
        return [f('pay_missing_transparency_state', 'posting', 'caution', W.pay_missing_transparency_state,
          'No pay range, in a state that generally requires one',
          `${names} has a pay-transparency law that covers many job postings. There are exceptions (small employers, some posting types), so this is a minor note, not a red flag.`)];
      }
      return [f('pay_missing', 'posting', 'info', 0,
        'No pay range listed',
        "Lots of legitimate employers still don't post pay. Ask for the range early so you don't waste a round of interviews.")];
    },
  },
  {
    id: 'risk_language',
    dimension: 'posting',
    describe: 'Requests that legitimate employers almost never make before an offer.',
    run({ text }) {
      const out: Finding[] = [];
      if (text.asksSensitiveInfo.length) {
        out.push(f('asks_sensitive_info', 'posting', 'warning', W.asks_sensitive_info,
          'Asks for sensitive personal details',
          `The text mentions ${text.asksSensitiveInfo.join(', ')}. Real employers collect this after a written offer, through official onboarding forms. Don't send it to apply.`));
      }
      if (text.offPlatformChat.length) {
        out.push(f('off_platform_chat', 'posting', 'warning', W.off_platform_chat,
          'Mentions interviews or contact over chat apps',
          `It mentions ${text.offPlatformChat.join(', ')}. Job scams very often move people to chat apps. A real company will usually use its own email domain and video calls.`));
      }
      if (text.asksForPayment.length) {
        out.push(f('asks_for_payment', 'posting', 'warning', W.asks_for_payment,
          'Mentions you paying for something',
          `It mentions ${text.asksForPayment.join(', ')}. You should never have to pay, deposit a check, or buy equipment to get a job.`));
      }
      if (text.freeEmailContacts.length) {
        out.push(f('free_email_contact', 'posting', 'caution', W.free_email_contact,
          'Contact address is a personal email account',
          `It lists ${text.freeEmailContacts.slice(0, 2).join(', ')}. Small businesses do this, but it's also common in impersonation scams. Check the company's real site for the same contact.`));
      }
      if (text.pipelineLanguage.length) {
        out.push(f('pipeline_language', 'posting', 'caution', W.pipeline_language,
          'Reads like a talent-pool listing',
          `It uses phrases like "${text.pipelineLanguage.join('", "')}". That usually means they're collecting candidates for later, not filling a specific opening right now.`));
      }
      if (text.fraudNotice) {
        const d = text.officialEmailDomains;
        out.push(f('fraud_notice', 'posting', 'info', 0,
          "Includes the employer's own scam warning",
          d.length
            ? `The listing says recruiters only contact people from ${d.map((x) => '@' + x).join(' or ')}. If someone reaches out about this job from any other address, it isn't them.`
            : 'The listing warns about recruitment scams and lists what they will never ask for. Hold anyone who contacts you about this job to that.'));
      }
      if (text.tooGoodToBeTrue.length) {
        out.push(f('too_good_to_be_true', 'posting', 'caution', W.too_good_to_be_true,
          'Big-earnings language',
          `It uses ${text.tooGoodToBeTrue.join(', ')}. Common in commission-only and MLM-style roles. Ask what the base pay is.`));
      }
      return out;
    },
  },
  {
    id: 'apply_destination',
    dimension: 'posting',
    describe: 'Does the apply link go somewhere that matches the employer?',
    run({ bundle }) {
      const p = bundle.posting;
      if (!p.applyUrl || !p.employerDomain) return [];
      try {
        const host = new URL(p.applyUrl).hostname;
        if (isAtsHost(host)) return [];
        if (baseDomain(host) === baseDomain(p.employerDomain)) return [];
        return [f('apply_domain_mismatch', 'posting', 'caution', W.apply_domain_mismatch,
          "Apply link goes to a different website than the employer's",
          `The apply button points to ${host}, not ${baseDomain(p.employerDomain)} or a known applicant tracking system. Could be a recruiting agency. Make sure you know who receives your application.`)];
      } catch {
        return [];
      }
    },
  },
];

// ===================================================================== employer

export const EMPLOYER_RULES: Rule[] = [
  {
    id: 'warn_notices',
    dimension: 'employer',
    describe: 'State WARN Act layoff notices matched to this employer.',
    run({ bundle, nowMs }) {
      const out: Finding[] = [];
      const warn = bundle.employer.events.filter((e) => e.kind === 'warn_notice');
      const recent = warn.filter((e) => (daysBetween(e.date, nowMs) ?? 9999) <= T.warnLookbackDays);
      const older = warn.filter((e) => (daysBetween(e.date, nowMs) ?? 9999) > T.warnLookbackDays);
      if (recent.length) {
        const total = recent.reduce((s, e) => s + (e.magnitude ?? 0), 0);
        const veryRecent = recent.some((e) => (daysBetween(e.date, nowMs) ?? 9999) <= T.warnVeryRecentDays);
        const allProbable = recent.every((e) => e.matchQuality === 'probable');
        let weight: number = total >= T.warnLargeEmployees ? W.warn_recent_large : W.warn_recent;
        if (veryRecent) weight += W.warn_very_recent_extra;
        if (allProbable) weight = Math.round(weight / 2);
        const states = [...new Set(recent.map((e) => e.source.name))];
        out.push(f('warn_recent', 'employer', allProbable ? 'caution' : 'warning', weight,
          `${plural(recent.length, 'WARN layoff notice')} in the last 12 months${total ? ` (${total.toLocaleString('en-US')} people)` : ''}`,
          `Filed with ${states.join(' and ')}. WARN notices are legally required before larger layoffs or site closures, so they come from official state records. They cover specific sites, not necessarily the team you'd join.${allProbable ? ' The employer name on the notice is close to, but not exactly, this company, so treat the match as likely rather than certain.' : ''}`,
          recent.map((e) => e.source)));
      }
      if (older.length) {
        out.push(f('warn_older', 'employer', 'info', 0,
          `${plural(older.length, 'older WARN notice')} (over a year ago)`,
          'Older layoff notices give context but say less about the company right now.', older.slice(0, 3).map((e) => e.source)));
      }
      const c = bundle.employer.checked.warn;
      if (c.ran && warn.length === 0) {
        out.push(f('warn_none_found', 'employer', 'info', 0,
          `No WARN notices found in the states we check (${c.states.join(', ')})`,
          "We only have WARN data for some states so far, and small layoffs don't require a notice. This is not proof there haven't been layoffs."));
      }
      return out;
    },
  },
  {
    id: 'sec_events',
    dimension: 'employer',
    describe: 'Material events disclosed in SEC 8-K filings and auditor going-concern language.',
    run({ bundle, nowMs }) {
      const out: Finding[] = [];
      const within = (d: string, days: number) => (daysBetween(d, nowMs) ?? 9999) <= days;
      const ev = bundle.employer.events;
      const bankrupt = ev.filter((e) => e.kind === 'sec_bankruptcy' && within(e.date, T.bankruptcyLookbackDays));
      if (bankrupt.length) {
        out.push(f('sec_bankruptcy', 'employer', 'warning', W.sec_bankruptcy,
          'Disclosed a bankruptcy or receivership',
          `The company filed an 8-K under Item 1.03 on ${fmtDate(bankrupt[0]!.date)}. Companies keep hiring during restructurings, but jobs are less predictable.`, bankrupt.map((e) => e.source)));
      }
      const gc = ev.filter((e) => e.kind === 'going_concern' && within(e.date, T.goingConcernLookbackDays));
      if (gc.length) {
        out.push(f('going_concern', 'employer', 'warning', W.going_concern,
          'Recent filing mentions "substantial doubt" about continuing as a going concern',
          `A ${gc[0]!.title} filed ${fmtDate(gc[0]!.date)} contains going-concern language. That means the company or its auditor flagged a real risk of running out of money within a year. Read the filing for context. Sometimes the doubt is later resolved.`, gc.map((e) => e.source)));
      }
      const restr = ev.filter((e) => e.kind === 'sec_restructuring' && within(e.date, T.secLookbackDays));
      if (restr.length) {
        out.push(f('sec_restructuring', 'employer', 'warning', W.sec_restructuring,
          `Disclosed ${restr.length === 1 ? 'a restructuring' : `${restr.length} restructurings`} in the last year`,
          `8-K filings under Item 2.05 ("costs associated with exit or disposal activities") are how public companies report layoffs, closures, or wind-downs. Most recent: ${fmtDate(restr[0]!.date)}.`, restr.map((e) => e.source)));
      }
      const imp = ev.filter((e) => e.kind === 'sec_impairment' && within(e.date, T.secLookbackDays));
      if (imp.length) {
        out.push(f('sec_impairment', 'employer', 'caution', W.sec_impairment,
          'Reported a material write-down',
          `An 8-K under Item 2.06 on ${fmtDate(imp[0]!.date)} reported a material impairment. That means some asset was worth less than they thought. It's context, not a verdict.`, imp.map((e) => e.source)));
      }
      const acq = ev.filter((e) => e.kind === 'sec_acquisition' && within(e.date, T.secLookbackDays));
      if (acq.length) {
        out.push(f('sec_acquisition', 'employer', 'info', 0,
          'Completed an acquisition or sale of assets in the last year',
          `Reported under 8-K Item 2.01 on ${fmtDate(acq[0]!.date)}. Mergers can mean growth or reorganizing. Worth asking how it affects the team.`, acq.map((e) => e.source)));
      }
      return out;
    },
  },
  {
    id: 'financial_trend',
    dimension: 'employer',
    describe: 'Year-over-year revenue change from XBRL data in annual SEC filings.',
    run({ bundle }) {
      const out: Finding[] = [];
      const rev = bundle.employer.financials.find((x) => x.label === 'Revenue');
      if (rev && rev.priorValue && rev.priorValue > 0) {
        const pct = Math.round(((rev.value - rev.priorValue) / rev.priorValue) * 100);
        const src = [{ name: 'SEC EDGAR XBRL', url: bundle.employer.cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${bundle.employer.cik}&type=10-K` : undefined, reliability: 'official' as const }];
        if (pct <= T.revenueDropPct) {
          out.push(f('revenue_down', 'employer', 'caution', W.revenue_down,
            `Revenue fell ${Math.abs(pct)}% in ${rev.fiscalYear}`,
            'From the annual report filed with the SEC. A big drop often leads to cost cutting, though one year is not a trend.', src));
        } else if (pct >= T.revenueGrowthPct) {
          out.push(f('revenue_up', 'employer', 'positive', W.revenue_up,
            `Revenue grew ${pct}% in ${rev.fiscalYear}`,
            'From the annual report filed with the SEC. Growth tends to support hiring, though it is no guarantee.', src));
        } else {
          out.push(f('revenue_flat', 'employer', 'info', 0,
            `Revenue changed ${pct > 0 ? '+' : ''}${pct}% in ${rev.fiscalYear}`,
            'Roughly flat year over year, per the annual report filed with the SEC.', src));
        }
      }
      const ni = bundle.employer.financials.find((x) => x.label === 'Net income');
      if (ni && ni.value < 0) {
        out.push(f('net_loss', 'employer', 'info', 0,
          `Reported a net loss in ${ni.fiscalYear}`,
          "Plenty of growing companies lose money on purpose. It matters more when paired with falling revenue or a going-concern note."));
      }
      return out;
    },
  },
  {
    id: 'activity',
    dimension: 'employer',
    describe: 'Is the company currently hiring, and does it file reports on schedule?',
    run({ bundle, nowMs }) {
      const out: Finding[] = [];
      const n = bundle.posting.boardOpenRoles;
      if (n !== undefined) {
        if (n >= T.hiringActiveRoles) {
          out.push(f('hiring_actively', 'employer', 'positive', W.hiring_actively,
            `Hiring actively: ${n} open roles on their job board`,
            'Counted from their public job board right now. Broad hiring is a decent sign the company is not in a freeze.', bundle.posting.sources));
        } else if (n > 0) {
          out.push(f('hiring_some', 'employer', 'info', 0,
            `${plural(n, 'open role')} on their job board`,
            'Counted from their public job board right now.', bundle.posting.sources));
        }
      }
      const lf = bundle.employer.latestPeriodicFiling;
      if (lf) {
        const d = daysBetween(lf.date, nowMs) ?? 9999;
        if (d <= T.filingCurrentDays) {
          out.push(f('filings_current', 'employer', 'positive', W.filings_current,
            'Files financial reports with the SEC on schedule',
            `Latest ${lf.form} filed ${fmtDate(lf.date)}. Public companies have to disclose major risks and events, so there's more to go on.`,
            [{ name: 'SEC EDGAR', url: lf.url, reliability: 'official' }]));
        }
      }
      return out;
    },
  },
  {
    id: 'coverage',
    dimension: 'employer',
    describe: 'Flags where we simply do not have public data.',
    run({ bundle }) {
      const e = bundle.employer;
      if (!e.name) {
        return [f('employer_unknown', 'employer', 'missing', 0,
          "Can't research the employer",
          "Without a company name we can't look up public records. Add the company name and run it again.")];
      }
      if (e.checked.sec.ran && !e.checked.sec.matched) {
        return [f('not_sec_filer', 'employer', 'missing', 0,
          'No SEC filings found (likely a private company)',
          "Private companies don't publish financials, so there's less to check. That's not a bad sign, just less information.")];
      }
      if (e.checked.sec.error) {
        return [f('sec_unavailable', 'employer', 'missing', 0,
          "Couldn't reach SEC EDGAR",
          'The SEC lookup failed this time, so financial filings are missing from this report. Try again later.')];
      }
      return [];
    },
  },
];

export function buildContext(bundle: EvidenceBundle): RuleContext {
  return { bundle, text: analyzeText(bundle.posting.descriptionText), nowMs: Date.parse(bundle.now) };
}
