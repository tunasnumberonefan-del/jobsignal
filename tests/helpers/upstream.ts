// Fake versions of the outside world: Greenhouse, Lever, SEC, state WARN data, and a
// couple of generic web pages. Shapes copied from real responses (October 2026).
// Tests can flip `state` to simulate outages or listings disappearing.

export const state = {
  greenhouseDown: false,
  secDown: false,
  removedJobs: new Set<string>(),
  calls: [] as string[],
};

export function resetUpstream() {
  state.greenhouseDown = false;
  state.secDown = false;
  state.removedJobs.clear();
  state.calls = [];
}

const LONG_DESCRIPTION = `
<h3>About the role</h3><p>We're hiring a Senior Backend Engineer to work on the payments platform that moves money for thousands of small businesses.</p>
<h3>What you'll do</h3><ul>
<li>Design and build services in Go that process card and bank transfers</li>
<li>Own reliability for the ledger service, including on-call one week in six</li>
<li>Work with product and design to scope new features</li>
<li>Review code and mentor two mid-level engineers</li></ul>
<h3>Qualifications</h3><ul>
<li>5+ years building backend systems in production</li>
<li>Experience with Postgres, queues, and distributed systems</li>
<li>Clear written communication</li></ul>
<p>${'We value thoughtful engineering, clear writing, and steady delivery over heroics. '.repeat(12)}</p>
<p>The base salary range for this role is $165,000 - $205,000.</p>
<p>Acme recruiters will only contact you from an @acmepay.com address. We will never ask for your bank account details or payment during the hiring process.</p>`;

const greenhouseJobs: Record<string, Record<string, unknown>> = {
  '1001': {
    id: 1001,
    title: 'Senior Backend Engineer',
    absolute_url: 'https://boards.greenhouse.io/acmepay/jobs/1001',
    company_name: 'AcmePay',
    location: { name: 'Austin, TX' },
    first_published: new Date(Date.now() - 12 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    content: LONG_DESCRIPTION.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    metadata: [],
  },
  '1002': {
    id: 1002,
    title: 'Customer Support Specialist',
    absolute_url: 'https://boards.greenhouse.io/acmepay/jobs/1002',
    company_name: 'AcmePay',
    location: { name: 'Remote' },
    first_published: new Date(Date.now() - 170 * 86_400_000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    content: '&lt;p&gt;Help customers. Join our talent community to be considered for future roles as they open.&lt;/p&gt;',
    metadata: [],
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  state.calls.push(url.href);
  void init;

  // ---- Greenhouse
  if (url.hostname === 'boards-api.greenhouse.io') {
    if (state.greenhouseDown) return new Response('upstream error', { status: 503 });
    const m = url.pathname.match(/^\/v1\/boards\/([^/]+)\/jobs(?:\/(\d+))?$/);
    if (!m || m[1] !== 'acmepay') return json({ status: 404, error: 'Job not found' }, 404);
    if (m[2]) {
      const job = greenhouseJobs[m[2]];
      if (!job || state.removedJobs.has(m[2])) return json({ status: 404, error: 'Job not found' }, 404);
      return json(job);
    }
    return json({ jobs: Object.values(greenhouseJobs).filter((j) => !state.removedJobs.has(String(j.id))).map((j) => ({ id: j.id, title: j.title, location: j.location })) });
  }

  // ---- SEC
  if (url.hostname === 'efts.sec.gov') {
    if (state.secDown) return new Response('down', { status: 503 });
    const typed = url.searchParams.get('keysTyped');
    if (typed) {
      const hits = /acmepay/i.test(typed)
        ? [{ _id: '1234567', _source: { entity: 'AcmePay Inc. (ACMP)', tickers: 'ACMP' } }, { _id: '7654321', _source: { entity: 'AcmePay Holdings Trust', tickers: '' } }]
        : /acme foods/i.test(typed)
          ? [{ _id: '2222222', _source: { entity: 'Acme Foods Corp (AFOO)', tickers: 'AFOO' } }]
          : [];
      return json({ hits: { hits } });
    }
    // full-text search (going concern)
    return json({ hits: { hits: [] } });
  }
  if (url.hostname === 'data.sec.gov') {
    if (state.secDown) return new Response('down', { status: 503 });
    if (url.pathname.startsWith('/submissions/CIK0001234567')) {
      const recent = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
      const tenQ = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      return json({
        name: 'AcmePay Inc.',
        tickers: ['ACMP'],
        filings: { recent: {
          accessionNumber: ['0001234567-26-000010', '0001234567-26-000009'],
          filingDate: [tenQ, recent],
          form: ['10-Q', '8-K'],
          items: ['', '2.05,9.01'],
          primaryDocument: ['acmp-10q.htm', 'acmp-8k.htm'],
        } },
      });
    }
    if (url.pathname.includes('/companyconcept/CIK0001234567/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax')) {
      const y = new Date().getUTCFullYear();
      return json({ units: { USD: [
        { fy: y - 1, fp: 'FY', form: '10-K', val: 500_000_000, filed: `${y - 1}-02-10`, end: `${y - 2}-12-31`, frame: `CY${y - 2}` },
        { fy: y, fp: 'FY', form: '10-K', val: 380_000_000, filed: `${y}-02-10`, end: `${y - 1}-12-31`, frame: `CY${y - 1}` },
      ] } });
    }
    return json({}, 404);
  }

  // ---- Texas WARN (Socrata)
  if (url.hostname === 'data.texas.gov') {
    return json([
      { job_site_name: 'AcmePay, Inc.', notice_date: new Date(Date.now() - 50 * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00.000', city_name: 'Austin', county_name: 'Travis', total_layoff_number: '140', layoff_date: new Date(Date.now() - 10 * 86_400_000).toISOString() },
      { job_site_name: 'Acme Foods Distribution', notice_date: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) + 'T00:00:00.000', city_name: 'Dallas', county_name: 'Dallas', total_layoff_number: '60', layoff_date: new Date().toISOString() },
    ]);
  }
  // ---- California WARN xlsx: unavailable in tests (exercises the error path)
  if (url.hostname === 'edd.ca.gov') return new Response('nope', { status: 503 });

  // ---- generic pages
  if (url.hostname === 'careers.example-widgets.com') {
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /private/\n', { status: 200 });
    if (url.pathname === '/jobs/42') {
      return new Response(`<!doctype html><html><head><title>Widget Tech</title>
<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Widget Technician',
        datePosted: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10),
        hiringOrganization: { '@type': 'Organization', name: 'Example Widgets', sameAs: 'https://www.example-widgets.com' },
        jobLocation: { '@type': 'Place', address: { addressLocality: 'Denver', addressRegion: 'CO' } },
        description: '<p>Fix widgets.</p>',
        identifier: { '@type': 'PropertyValue', value: 'W-42' },
      })}</script></head><body>Job</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (url.pathname === '/jobs/plain') return new Response('<html><body>No structured data here.</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response('not found', { status: 404 });
  }
  if (url.hostname === 'api.resend.com') return json({ id: 'email_1' });
  return new Response('unmocked: ' + url.href, { status: 599 });
}
