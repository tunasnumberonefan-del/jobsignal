// Name cleanup and matching. This is where "Acme, Inc." and "ACME INC" become the
// same thing, and where we refuse to treat "Acme Foods" and "Acme Labs" as one company.

const LEGAL_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'l l c', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company',
  'plc', 'lp', 'llp', 'pllc', 'pc', 'gmbh', 'ag', 'sa', 'nv', 'bv', 'pty', 'holdings', 'holding',
  'group', 'the',
]);

const ENTITY_WORDS = new Set(['inc', 'incorporated', 'llc', 'ltd', 'corp', 'corporation', 'co', 'company', 'plc', 'lp', 'llp', 'pllc', 'gmbh']);

// Leftovers at the end of a name: "& Co." -> "and", WARN batch labels like "(May)".
const TRAILING_NOISE = new Set([
  'and', 'of', 'dba', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

// Words that say nothing about which company it is. A name made only of these is too weak to match on.
const GENERIC_WORDS = new Set([
  'services', 'service', 'solutions', 'systems', 'technologies', 'technology', 'tech', 'global',
  'international', 'national', 'american', 'america', 'united', 'industries', 'enterprises',
  'partners', 'associates', 'management', 'consulting', 'health', 'healthcare', 'medical', 'care',
  'financial', 'bank', 'labs', 'lab', 'software', 'digital', 'media', 'energy', 'logistics',
  'staffing', 'hospital', 'center', 'centers', 'manufacturing', 'products', 'foods', 'food',
  'store', 'stores', 'retail', 'construction', 'transport', 'transportation', 'us', 'usa', 'of', 'and',
]);

export function normalizeCompanyName(raw: string): string {
  let s = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\(.*?\)/g, ' ')            // "(KN) 2026" style notes in WARN data
    .replace(/\bd\/?b\/?a\b.*$/, ' ')    // "Foo LLC dba Bar" -> "Foo LLC"
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(19|20)\d{2}\b/g, ' ')   // stray years
    .replace(/\s+/g, ' ')
    .trim();
  let words = s.split(' ').filter(Boolean);
  // Entity-type words ("llc", "inc") are noise wherever they appear. WARN rows often put
  // the site after them: "Acme Distributing Company LLC Grand Prairie".
  if (words.length > 1) words = words.filter((w, i) => i === 0 || !ENTITY_WORDS.has(w));
  // Then trim softer suffixes and dangling joiners from the end ("acme holdings and").
  while (words.length > 1 && (LEGAL_SUFFIXES.has(words[words.length - 1]!) || TRAILING_NOISE.has(words[words.length - 1]!))) words.pop();
  while (words.length > 1 && words[0] === 'the') words.shift();
  s = words.join(' ');
  return s;
}

/** True when a normalized name is specific enough to match public records on. */
export function isDistinctiveName(normalized: string): boolean {
  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return false;
  const meaningful = words.filter((w) => !GENERIC_WORDS.has(w));
  if (meaningful.length === 0) return false;
  // Very short single-word names ("abc", "ge") collide with too much.
  if (words.length === 1 && words[0]!.length < 4) return false;
  return true;
}

export type MatchQuality = 'exact' | 'probable' | 'none';

/**
 * Compare a known company name against a name from a public record.
 * exact    = same normalized name.
 * probable = the record name starts with the company name followed by a location/unit word
 *            ("Acme Robotics Austin" vs "Acme Robotics"), and the company name is distinctive.
 * Anything looser is 'none'. We'd rather miss a record than pin one on the wrong employer.
 */
export function matchCompanyName(company: string, recordName: string): MatchQuality {
  const a = normalizeCompanyName(company);
  const b = normalizeCompanyName(recordName);
  if (!a || !b) return 'none';
  if (a === b) return isDistinctiveName(a) || a.split(' ').length > 1 ? 'exact' : 'none';
  if (!isDistinctiveName(a)) return 'none';
  if (b.startsWith(a + ' ')) {
    const rest = b.slice(a.length + 1).split(' ');
    // Only accept short tails, which are usually a site name or division.
    if (rest.length <= 3) return 'probable';
  }
  return 'none';
}

export function normalizeTitle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(sr)\b\.?/g, 'senior')
    .replace(/\b(jr)\b\.?/g, 'junior')
    .replace(/\b(eng)\b\.?/g, 'engineer')
    .replace(/\b(mgr)\b\.?/g, 'manager')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeLocation(raw: string | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/united states( of america)?|\busa?\b/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function postingFingerprint(company: string | undefined, title: string, location: string | undefined): string {
  return [normalizeCompanyName(company ?? ''), normalizeTitle(title), normalizeLocation(location)].join('|');
}

export function slugify(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'company';
}

/** Registrable-ish domain: strips www./careers./jobs. Not a full public-suffix parser, on purpose. */
export function baseDomain(hostname: string): string {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const twoLevelTlds = new Set(['co.uk', 'com.au', 'co.jp', 'com.br', 'co.in', 'co.nz', 'com.mx']);
  const lastTwo = parts.slice(-2).join('.');
  if (twoLevelTlds.has(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}

/** Jaccard similarity over word 3-shingles. Good enough to spot near-identical descriptions. */
export function textSimilarity(a: string, b: string): number {
  const sh = (t: string) => {
    const w = t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    const out = new Set<string>();
    for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    return out;
  };
  const A = sh(a);
  const B = sh(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
