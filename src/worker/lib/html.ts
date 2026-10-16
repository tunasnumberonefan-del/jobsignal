// Job descriptions come from other people's websites. We never render their HTML.
// We turn it into plain text (keeping paragraphs and bullet points) and React escapes it.

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', bull: '•', middot: '·',
  trade: '™', reg: '®', copy: '©', euro: '€', pound: '£',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return '';
      try {
        return String.fromCodePoint(n);
      } catch {
        return '';
      }
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  let s = html;
  // Greenhouse double-escapes its HTML, so decode first if it looks escaped.
  if (/&lt;\/?[a-z]/i.test(s) && !/<\/?[a-z][^>]*>/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|noscript|template|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr|section|article|header|footer|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(h[1-6])[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.slice(0, 60_000);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Pull schema.org JSON-LD blocks out of a page. Returns parsed objects, flattened through @graph. */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[1]!.trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try {
      const parsed: unknown = JSON.parse(raw);
      const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const item = stack.shift();
        if (!item || typeof item !== 'object') continue;
        out.push(item);
        const graph = (item as Record<string, unknown>)['@graph'];
        if (Array.isArray(graph)) stack.push(...graph);
      }
    } catch {
      // Lots of sites ship broken JSON-LD. Skip it.
    }
  }
  return out;
}

export function pageTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]!.replace(/\s+/g, ' ').trim()) || undefined : undefined;
}
