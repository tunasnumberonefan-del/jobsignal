import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { isDistinctiveName, matchCompanyName, normalizeCompanyName, postingFingerprint, textSimilarity } from '@shared/normalize';
import { parseRobots, UrlRejected, validatePublicUrl } from '../src/worker/lib/http';
import { htmlToText, extractJsonLd } from '../src/worker/lib/html';
import { parseJobUrl } from '../src/worker/providers';
import { parseCaliforniaWarn } from '../src/worker/providers/warn';
import { excelDate } from '../src/worker/providers/warn/xlsx';
import { verifyStripeSignature } from '../src/worker/services/billing';
import { hmacSha256Hex } from '../src/worker/lib/util';
import { planFor } from '@shared/entitlements';

describe('company name normalization', () => {
  it.each([
    ['Acme, Inc.', 'acme'],
    ['ACME INC', 'acme'],
    ['The Acme Company', 'acme'],
    ['JPMorgan Chase & Co.', 'jpmorgan chase'],
    ['Republic National Distributing Company LLC Grand Prairie', 'republic national distributing grand prairie'],
    ['KUEHNE + NAGEL (KN) 2026', 'kuehne nagel'],
    ['Spirit Airlines (May)', 'spirit airlines'],
    ['Spirit Airlines May', 'spirit airlines'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeCompanyName(raw)).toBe(expected);
  });

  it('matches name variants exactly', () => {
    expect(matchCompanyName('Acme Robotics, Inc.', 'ACME ROBOTICS INC')).toBe('exact');
  });

  it('does not merge similarly named companies', () => {
    expect(matchCompanyName('Acme Foods', 'Acme Robotics')).toBe('none');
    expect(matchCompanyName('Acme', 'Acme Foods Distribution')).toBe('probable');
    expect(matchCompanyName('Global Services', 'Global Services Austin')).toBe('none'); // too generic
    expect(matchCompanyName('Apex', 'Apex Systems Staffing Solutions Group Dallas Texas')).toBe('none'); // tail too long
  });

  it('refuses to match on generic or tiny names', () => {
    expect(isDistinctiveName('health services')).toBe(false);
    expect(isDistinctiveName('abc')).toBe(false);
    expect(isDistinctiveName('stripe')).toBe(true);
  });

  it('fingerprints ignore case, punctuation, and "United States"', () => {
    expect(postingFingerprint('Acme Inc', 'Sr. Engineer (Backend)', 'Austin, TX, United States'))
      .toBe(postingFingerprint('ACME', 'senior engineer', 'austin tx'));
  });

  it('text similarity spots near-duplicates', () => {
    const a = 'We are hiring a backend engineer to build payment systems in Go with Postgres and Kafka every day';
    expect(textSimilarity(a, a)).toBe(1);
    expect(textSimilarity(a, a + ' extra words here')).toBeGreaterThan(0.7);
    expect(textSimilarity(a, 'Completely unrelated text about cooking pasta and baking bread at home tonight')).toBeLessThan(0.1);
  });
});

describe('URL validation (SSRF protection)', () => {
  const bad = [
    'http://localhost/admin', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://169.254.169.254/latest/meta-data/', 'http://192.168.1.1',
    'http://[::1]/', 'file:///etc/passwd', 'ftp://example.com/x', 'http://user:pass@example.com/', 'http://example.com:8080/',
    'http://intranet/', 'http://printer.local/', 'javascript:alert(1)', 'not a url', 'http://8.8.8.8/',
  ];
  it.each(bad)('rejects %s', (u) => {
    expect(() => validatePublicUrl(u)).toThrow(UrlRejected);
  });
  it('accepts normal https job links and strips fragments', () => {
    expect(validatePublicUrl('https://boards.greenhouse.io/acme/jobs/1#apply').toString()).toBe('https://boards.greenhouse.io/acme/jobs/1');
  });
});

describe('job URL parsing', () => {
  const p = (u: string) => parseJobUrl(new URL(u));
  it('greenhouse board + job', () => expect(p('https://boards.greenhouse.io/airbnb/jobs/8184174')).toMatchObject({ kind: 'greenhouse', board: 'airbnb', jobId: '8184174' }));
  it('greenhouse new domain', () => expect(p('https://job-boards.greenhouse.io/acme/jobs/55')).toMatchObject({ kind: 'greenhouse', board: 'acme', jobId: '55' }));
  it('greenhouse embed', () => expect(p('https://boards.greenhouse.io/embed/job_app?for=acme&token=77')).toMatchObject({ kind: 'greenhouse', board: 'acme', jobId: '77' }));
  it('greenhouse via custom domain gh_jid (guessed, to be confirmed)', () => expect(p('https://careers.airbnb.com/positions/1?gh_jid=8184174')).toMatchObject({ kind: 'greenhouse', board: 'airbnb', boardGuessed: true }));
  it('lever', () => expect(p('https://jobs.lever.co/leverdemo/5ac21346-8e0c-4494-8e7a-3eb92ff77902/apply')).toMatchObject({ kind: 'lever', board: 'leverdemo' }));
  it('lever EU', () => expect(p('https://jobs.eu.lever.co/acme/5ac21346-8e0c-4494-8e7a-3eb92ff77902')).toMatchObject({ kind: 'lever', region: 'eu' }));
  it('ashby', () => expect(p('https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2')).toMatchObject({ kind: 'ashby', board: 'ashby' }));
  it('anything else falls back to the page reader', () => expect(p('https://careers.example.com/jobs/1')).toMatchObject({ kind: 'jsonld' }));
});

describe('robots.txt', () => {
  it('uses the * group and our own group when present', () => {
    expect(parseRobots('User-agent: *\nDisallow: /private\n')).toEqual(['/private']);
    expect(parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /tmp\n')).toEqual(['/tmp']);
    expect(parseRobots('User-agent: JobSignalBot\nDisallow: /\nUser-agent: *\nDisallow:\n')).toEqual(['/']);
  });
});

describe('untrusted HTML', () => {
  it('turns job HTML into text and drops scripts', () => {
    const t = htmlToText('<p>Hello</p><script>alert(1)</script><ul><li>One</li><li>Two</li></ul><img src=x onerror=alert(1)>');
    expect(t).toContain('Hello');
    expect(t).toContain('- One');
    expect(t).not.toMatch(/alert|<|onerror/);
  });
  it('decodes Greenhouse double-escaped HTML', () => {
    expect(htmlToText('&lt;p&gt;Hi &amp;amp; bye&lt;/p&gt;')).toBe('Hi & bye');
  });
  it('reads JSON-LD including @graph and skips broken blocks', () => {
    const html = `<script type="application/ld+json">{bad json</script><script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"JobPosting","title":"X"}]}</script>`;
    expect(extractJsonLd(html).some((o) => (o as { '@type': string })['@type'] === 'JobPosting')).toBe(true);
  });
});

describe('California WARN spreadsheet', () => {
  function xlsx(rows: Array<Array<string | number>>): Uint8Array {
    const shared: string[] = [];
    const idx = (s: string) => (shared.includes(s) ? shared.indexOf(s) : shared.push(s) - 1);
    const col = (i: number) => String.fromCharCode(65 + i);
    const sheet = `<worksheet><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => typeof c === 'number' ? `<c r="${col(ci)}${ri + 1}"><v>${c}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${idx(c)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
    return zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Index" sheetId="1" r:id="rId1"/><sheet name="Detailed WARN Report " sheetId="2" r:id="rId2"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData/></worksheet>'),
      'xl/worksheets/sheet2.xml': strToU8(sheet),
      'xl/sharedStrings.xml': strToU8(`<sst>${shared.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`),
    });
  }
  it('parses rows below the header, converts Excel dates, and filters by date', async () => {
    const bytes = xlsx([
      ['Detailed WARN Report'],
      ['County/Parish', 'Notice Date', 'Received Date', 'Effective Date', 'Company', 'Layoff/Closure', 'No. Of Employees', 'Address'],
      ['Santa Clara County', 46265, 46265, 46325, 'PayPal, Inc.', 'Layoff Permanent', 251, '2211 N. First Street  San Jose, CA 95131'],
      ['Los Angeles County', 40000, 40000, 40060, 'Old Corp', 'Closure Permanent', 50, '1 Main St  Los Angeles, CA 90001'],
    ]);
    const rows = await parseCaliforniaWarn(bytes, '2024-01-01T00:00:00Z');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ state: 'CA', employer: 'PayPal, Inc.', employerNormalized: 'paypal', employeesAffected: 251, city: 'San Jose', noticeDate: '2026-08-31' });
  });
  it('excel dates', () => {
    expect(excelDate(46265)).toBe('2026-08-31');
    expect(excelDate('8/31/2026')).toBe('2026-08-31');
    expect(excelDate('n/a')).toBeUndefined();
  });
});

describe('Stripe webhook signatures', () => {
  const secret = 'whsec_abc';
  const body = '{"id":"evt_1","type":"customer.subscription.updated"}';
  it('accepts a valid signature', async () => {
    const t = Math.floor(Date.now() / 1000);
    const sig = await hmacSha256Hex(secret, `${t}.${body}`);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, secret)).toBe(true);
  });
  it('rejects tampered bodies, wrong secrets, missing headers and old timestamps', async () => {
    const t = Math.floor(Date.now() / 1000);
    const sig = await hmacSha256Hex(secret, `${t}.${body}`);
    expect(await verifyStripeSignature(body + ' ', `t=${t},v1=${sig}`, secret)).toBe(false);
    expect(await verifyStripeSignature(body, `t=${t},v1=${sig}`, 'whsec_other')).toBe(false);
    expect(await verifyStripeSignature(body, null, secret)).toBe(false);
    const old = t - 3600;
    expect(await verifyStripeSignature(body, `t=${old},v1=${await hmacSha256Hex(secret, `${old}.${body}`)}`, secret)).toBe(false);
  });
});

describe('plan entitlements', () => {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
  it('active and past_due subscriptions are Pro', () => {
    expect(planFor({ plan: 'pro', status: 'active', current_period_end: future })).toBe('pro');
    expect(planFor({ plan: 'pro', status: 'past_due', current_period_end: future })).toBe('pro');
  });
  it('canceled, incomplete, and expired subscriptions are Free', () => {
    expect(planFor({ plan: 'pro', status: 'canceled', current_period_end: future })).toBe('free');
    expect(planFor({ plan: 'pro', status: 'incomplete', current_period_end: future })).toBe('free');
    expect(planFor({ plan: 'pro', status: 'active', current_period_end: past })).toBe('free');
    expect(planFor(null)).toBe('free');
  });
});
