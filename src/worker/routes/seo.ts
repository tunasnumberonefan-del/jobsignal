// Server-side bits for search engines and link previews. The app is a single-page React
// app, so for shared report links and company pages we inject the right <title> and
// Open Graph tags into index.html before sending it.

import type { Report } from '@shared/types';
import { EMPLOYER_LABEL_TEXT, POSTING_LABEL_TEXT } from '@shared/types';
import { createApp, type Ctx } from '../app';
import { escapeHtml } from '../lib/html';

export const seoRoutes = createApp();

export const GUIDE_SLUGS = [
  'what-is-a-ghost-job',
  'how-to-spot-a-fake-job-posting',
  'check-if-a-job-posting-is-still-active',
  'how-to-research-company-layoffs',
  'how-to-verify-an-employer',
  'how-to-evaluate-a-job-offer',
];

const STATIC_PAGES = ['/', '/pricing', '/how-it-works', '/methodology', '/guides', '/faq', '/privacy', '/terms', ...GUIDE_SLUGS.map((s) => `/guides/${s}`)];

interface Meta {
  title: string;
  description: string;
  url: string;
  image?: string;
  noindex?: boolean;
  jsonLd?: unknown;
}

export function injectMeta(html: string, m: Meta): string {
  const tags = [
    `<meta name="description" content="${escapeHtml(m.description)}">`,
    `<link rel="canonical" href="${escapeHtml(m.url)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="JobSignal">`,
    `<meta property="og:title" content="${escapeHtml(m.title)}">`,
    `<meta property="og:description" content="${escapeHtml(m.description)}">`,
    `<meta property="og:url" content="${escapeHtml(m.url)}">`,
    `<meta property="og:image" content="${escapeHtml(m.image ?? '')}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    m.noindex ? '<meta name="robots" content="noindex, follow">' : '',
    m.jsonLd ? `<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(m.title)}</title>`)
    // Remove the default description/OG tags from index.html so there's only one set.
    .replace(/\s*<meta (name="description"|property="og:[a-z_]+"|name="twitter:card")[^>]*>/g, '')
    .replace(/\s*<link rel="canonical"[^>]*>/g, '')
    .replace('</head>', `    ${tags}\n  </head>`);
}

async function shell(c: Ctx): Promise<string> {
  const res = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  return res.text();
}

// Worker-rendered pages don't get public/_headers, so send the same protections here.
export const PAGE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

function htmlResponse(c: Ctx, html: string, status = 200) {
  return c.html(html, status as 200, { 'cache-control': 'public, max-age=300', ...PAGE_HEADERS });
}

seoRoutes.get('/robots.txt', (c) => c.text(
  [
    "# Report pages carry a noindex tag instead of a Disallow here, so link previews still work.",
    'User-agent: *',
    'Disallow: /api/',
    'Disallow: /auth/',
    'Disallow: /account',
    'Disallow: /dashboard',
    'Disallow: /admin',
    'Disallow: /billing/',
    '',
    `Sitemap: ${c.env.APP_URL}/sitemap.xml`,
    '',
  ].join('\n'),
  200,
  { 'cache-control': 'public, max-age=86400' },
));

seoRoutes.get('/r/:slug', async (c) => {
  const html = await shell(c);
  const slug = c.req.param('slug');
  const base = c.env.APP_URL;
  const row = /^[a-z0-9]{8,20}$/.test(slug)
    ? await c.env.DB.prepare('SELECT r.is_public, a.report_json FROM reports r JOIN analyses a ON a.id = r.analysis_id WHERE r.slug = ?').bind(slug).first<{ is_public: number; report_json: string }>()
    : null;
  // Private (or missing) reports get a generic preview. Never leak a private report's title.
  if (!row || !row.is_public) {
    return htmlResponse(c, injectMeta(html, { title: 'JobSignal report', description: 'A JobSignal job posting report.', url: `${base}/r/${slug}`, image: `${base}/og.png`, noindex: true }));
  }
  const r = JSON.parse(row.report_json) as Report;
  const who = r.job.employer ? ` at ${r.job.employer}` : '';
  return htmlResponse(c, injectMeta(html, {
    title: `${r.job.title}${who} · JobSignal report`,
    description: `Posting: ${POSTING_LABEL_TEXT[r.posting.label]}. Employer: ${EMPLOYER_LABEL_TEXT[r.employer.label]}. Evidence confidence: ${r.confidence.label}. Checked ${r.generatedAt.slice(0, 10)}.`,
    url: `${base}/r/${slug}`,
    image: `${base}/og.png`,
    // Reports about single postings go stale fast. Shareable, but kept out of search indexes.
    noindex: true,
  }));
});

seoRoutes.get('/companies/:slug', async (c) => {
  const html = await shell(c);
  const slug = c.req.param('slug');
  const base = c.env.APP_URL;
  const co = await c.env.DB.prepare(
    'SELECT id, name, cik, (SELECT COUNT(*) FROM company_events e WHERE e.company_id = companies.id AND e.hidden_at IS NULL) AS events FROM companies WHERE slug = ?',
  ).bind(slug).first<{ id: string; name: string; cik: string | null; events: number }>();
  if (!co) return htmlResponse(c, injectMeta(html, { title: 'Company not found · JobSignal', description: 'We do not have a profile for this company yet.', url: `${base}/companies/${slug}`, noindex: true }), 404);
  // Only index profiles with real sourced content.
  const indexable = co.events > 0 || !!co.cik;
  return htmlResponse(c, injectMeta(html, {
    title: `${co.name}: layoffs, WARN notices and public filings · JobSignal`,
    description: `Public records about ${co.name}${co.events ? `: ${co.events} dated event${co.events === 1 ? '' : 's'} from official sources` : ''}. WARN Act notices, SEC filings, and hiring activity, with links to every source.`,
    url: `${base}/companies/${slug}`,
    image: `${base}/og.png`,
    noindex: !indexable,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Organization', name: co.name, url: `${base}/companies/${slug}` },
  }));
});

seoRoutes.get('/sitemap.xml', async (c) => {
  const base = c.env.APP_URL;
  const cos = await c.env.DB.prepare(
    `SELECT slug, updated_at FROM companies WHERE cik IS NOT NULL OR id IN (SELECT DISTINCT company_id FROM company_events WHERE hidden_at IS NULL) ORDER BY updated_at DESC LIMIT 5000`,
  ).all<{ slug: string; updated_at: string }>();
  const urls = [
    ...STATIC_PAGES.map((p) => `<url><loc>${base}${p}</loc></url>`),
    ...cos.results.map((r) => `<url><loc>${base}/companies/${escapeHtml(r.slug)}</loc><lastmod>${r.updated_at.slice(0, 10)}</lastmod></url>`),
  ];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 200, {
    'content-type': 'application/xml; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  });
});
