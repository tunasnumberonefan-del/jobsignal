// Plain-text checks on a job description. These are pattern matches, not judgement,
// so every one of them is phrased to the user as "this showed up", never "this is a scam".

export interface TextSignals {
  wordCount: number;
  bulletCount: number;
  hasResponsibilities: boolean;
  hasQualifications: boolean;
  payInText: string | null;
  maxYearsRequired: number | null;
  entryLevelLanguage: boolean;
  seniorLanguage: boolean;
  asksSensitiveInfo: string[];
  offPlatformChat: string[];
  asksForPayment: string[];
  /** The listing includes the employer's own anti-fraud warning. */
  fraudNotice: boolean;
  /** Email domains the listing says recruiters will use (from the fraud notice). */
  officialEmailDomains: string[];
  freeEmailContacts: string[];
  pipelineLanguage: string[];
  tooGoodToBeTrue: string[];
}

const SENSITIVE: Array<[RegExp, string]> = [
  [/social security (number|no\.?)|\bssn\b/i, 'Social Security number'],
  [/bank account (number|details|info)|routing number|account and routing/i, 'bank account details'],
  [/(copy|photo|picture|scan) of (your )?(driver'?s licen[cs]e|passport|id\b|state id)/i, 'a copy of your ID'],
  [/credit card (number|details|info)/i, 'credit card details'],
  [/date of birth.{0,40}(application|apply)|mother'?s maiden name/i, 'date of birth or security questions'],
];

const CHAT: Array<[RegExp, string]> = [
  [/\btelegram\b/i, 'Telegram'],
  [/\bwhats\s?app\b/i, 'WhatsApp'],
  [/\bsignal (app|messenger)\b/i, 'Signal'],
  [/google hangouts?/i, 'Google Hangouts'],
  [/\bwire app\b|\bwickr\b/i, 'Wire/Wickr'],
  [/(interview|chat|contact).{0,30}\b(text message|sms)\b/i, 'text-message interviews'],
];

const PAYMENT: Array<[RegExp, string]> = [
  [/(purchase|buy) (your own |the )?(equipment|software|starter kit|laptop|supplies)/i, 'buying equipment yourself'],
  [/(pay|send) (a |an )?(registration |training |application |onboarding )?(fee|deposit)/i, 'paying a fee'],
  [/training fee|background check fee|application fee/i, 'a fee to apply or train'],
  [/(send|mail) you a (check|cheque)|cashier'?s check|deposit (the|a) check/i, 'depositing a check for them'],
  [/gift cards?/i, 'gift cards'],
  [/bitcoin|crypto(currency)? (wallet|payment)|usdt/i, 'crypto payments'],
  [/money order|wire (the )?(money|funds)/i, 'wiring money'],
];

// Kept narrow on purpose. "The broadest talent pool" or "we'll keep your resume for future
// opportunities" show up on plenty of real, active listings.
const PIPELINE: Array<[RegExp, string]> = [
  [/(join|joining|added to|be part of|submit\w* .{0,25}to|apply to) (our |the )?talent (pool|community|pipeline|network)/i, 'join our talent pool'],
  [/(this|the) (posting|position|role|requisition|listing) is (for|to (build|collect)) .{0,30}(future|pipeline|pool)/i, 'this posting is for future roles'],
  [/\bevergreen (role|position|posting|requisition|req|opening)\b/i, 'evergreen posting'],
  [/\bgeneral (application|interest) (form|posting|position|listing)\b/i, 'general application'],
  [/not (an active|currently an open|a current|a specific) (opening|position|role|requisition|vacancy)/i, 'not an active opening'],
  [/(may|might|does) not (be|have|represent) an? (immediate|current|active) (opening|need|vacancy)/i, 'no immediate opening'],
  [/\b(proactive|pipeline) (sourcing|recruiting|hiring)\b/i, 'pipeline recruiting'],
];

const TOO_GOOD: Array<[RegExp, string]> = [
  [/earn up to \$\s?\d/i, '"earn up to $..."'],
  [/unlimited (earning|income) potential/i, 'unlimited earning potential'],
  [/\$\s?\d{3,}(,\d{3})?\s*(per|a|\/)\s*(day|week)\b.{0,80}no experience|no experience.{0,80}\$\s?\d{3,}(,\d{3})?\s*(per|a|\/)\s*(day|week)\b/is, 'high weekly pay with no experience'],
  [/be your own boss|financial freedom/i, 'income-opportunity language'],
];

const FREE_EMAIL = /[a-z0-9._%+-]+@(gmail|yahoo|outlook|hotmail|aol|protonmail|proton|icloud|gmx|mail)\.(com|me|net)/gi;

const PAY_PATTERNS = [
  /\$\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*(?:-|–|—|to)\s*\$?\s?\d{1,3}(?:,\d{3})+(?:\.\d+)?/,
  /\$\s?\d{2,3}(?:\.\d+)?\s?k\s*(?:-|–|—|to)\s*\$?\s?\d{2,3}(?:\.\d+)?\s?k/i,
  /\$\s?\d{1,3}(?:\.\d{2})?\s*(?:-|–|—|to)\s*\$?\s?\d{1,3}(?:\.\d{2})?\s*(?:\/|per|an?)\s*(?:hour|hr)/i,
  /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:\/|per|an?)\s*(?:hour|hr|year|yr|annum)/i,
  /(?:salary|pay|compensation|base) range[^.\n]{0,60}\d/i,
];

// Anti-fraud notices ("we will never ask for your bank details") mention exactly the
// things scams ask for. Sentences with these words are notices, not requests.
const NEGATION = /\b(never|will not|won'?t|do not|don'?t|does not|doesn'?t|not (ask|request|require|need)|no (legitimate|one from)|beware|scams?|fraud\w*|phishing|impersonat\w*|protect yourself|be cautious|suspicious)\b/i;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

const FRAUD_NOTICE = /(will never|never ask|won'?t ever|do not|don'?t) .{0,60}(ask|request|require).{0,80}(payment|fee|bank|social security|ssn|money|personal|financial)|(recruitment|job|hiring) (scams?|fraud)|fraudulent (job|recruit|offer)/i;

export function analyzeText(raw: string): TextSignals {
  const text = raw.replace(/\r/g, '');
  const words = text.split(/\s+/).filter(Boolean);
  const lines = text.split('\n');
  const bulletCount = lines.filter((l) => /^\s*([-*•●▪◦·]|\d+[.)])\s+\S/.test(l)).length;

  const sents = sentences(text);
  const collect = (rules: Array<[RegExp, string]>, skipNegated = false) => {
    const hits: string[] = [];
    for (const [re, label] of rules) {
      if (hits.includes(label)) continue;
      const found = skipNegated ? sents.some((s) => re.test(s) && !NEGATION.test(s)) : re.test(text);
      if (found) hits.push(label);
    }
    return hits;
  };

  let payInText: string | null = null;
  for (const re of PAY_PATTERNS) {
    const m = text.match(re);
    if (m) {
      payInText = m[0].trim();
      break;
    }
  }

  let maxYears: number | null = null;
  for (const m of text.matchAll(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)\b/gi)) {
    const n = Number(m[1]);
    if (n > 0 && n < 40) maxYears = Math.max(maxYears ?? 0, n);
  }

  const emails = [...new Set(sents.filter((s) => !NEGATION.test(s)).flatMap((s) => s.match(FREE_EMAIL) ?? []).map((e) => e.toLowerCase()))];

  return {
    wordCount: words.length,
    bulletCount,
    hasResponsibilities: /responsibilit|what you('ll| will)? (do|be doing|work on)|duties|day[- ]to[- ]day|in this role,? you/i.test(text),
    hasQualifications: /qualifications|requirements|what you('ll)? bring|you (have|bring)|must have|we'?re looking for|about you|skills/i.test(text),
    payInText,
    maxYearsRequired: maxYears,
    entryLevelLanguage: /entry[- ]level|new grad(uate)?s?\b|recent (college )?graduates?|no experience (needed|required)|\bjunior\b|early career/i.test(text),
    seniorLanguage: /\b(senior|staff|principal|lead|director|head of)\b/i.test(text),
    asksSensitiveInfo: collect(SENSITIVE, true),
    offPlatformChat: collect(CHAT, true),
    asksForPayment: collect(PAYMENT, true),
    fraudNotice: FRAUD_NOTICE.test(text),
    officialEmailDomains: [...new Set([...text.matchAll(/(?:from|use|using|only)\s+(?:an?\s+)?@\s?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)].map((m) => m[1]!.toLowerCase()))].slice(0, 4),
    freeEmailContacts: emails,
    pipelineLanguage: collect(PIPELINE, true),
    tooGoodToBeTrue: collect(TOO_GOOD, true),
  };
}

// States with pay-range disclosure laws for job postings (as of late 2026). Used for a
// small, clearly explained note, never a big penalty. Keep docs/SCORING.md in sync.
export const PAY_TRANSPARENCY_STATES: Record<string, string> = {
  CA: 'California', CO: 'Colorado', WA: 'Washington', NY: 'New York', IL: 'Illinois',
  MN: 'Minnesota', MD: 'Maryland', HI: 'Hawaii', VT: 'Vermont', MA: 'Massachusetts', NJ: 'New Jersey',
};

const STATE_NAMES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado',
  CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho',
  IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana',
  ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota',
  MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada',
  NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina',
  ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania',
  RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas',
  UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia',
  WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
};

const BIG_CITIES: Record<string, string> = {
  'san francisco': 'CA', 'los angeles': 'CA', 'san diego': 'CA', 'san jose': 'CA', 'oakland': 'CA',
  'new york city': 'NY', 'nyc': 'NY', 'brooklyn': 'NY', 'seattle': 'WA', 'chicago': 'IL',
  'austin': 'TX', 'dallas': 'TX', 'houston': 'TX', 'san antonio': 'TX', 'denver': 'CO',
  'boston': 'MA', 'atlanta': 'GA', 'miami': 'FL', 'phoenix': 'AZ', 'portland': 'OR',
  'philadelphia': 'PA', 'washington dc': 'DC', 'washington, dc': 'DC', 'minneapolis': 'MN',
  'baltimore': 'MD', 'honolulu': 'HI', 'nashville': 'TN', 'salt lake city': 'UT',
};

/** Best-effort list of US state codes mentioned in a location string. */
export function statesInLocation(location: string | undefined): string[] {
  if (!location) return [];
  const found = new Set<string>();
  const lower = location.toLowerCase();
  for (const m of location.matchAll(/(?:^|[,(\s-])([A-Z]{2})(?=$|[\s,)/;-])/g)) {
    const code = m[1]!;
    if (STATE_NAMES[code]) found.add(code);
  }
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    // "washington" alone is ambiguous with DC; only count it when DC isn't mentioned.
    if (new RegExp(`\\b${name}\\b`).test(lower)) {
      if (code === 'WA' && /\bd\.?c\.?\b|district of columbia/.test(lower)) continue;
      found.add(code);
    }
  }
  for (const [city, code] of Object.entries(BIG_CITIES)) if (lower.includes(city)) found.add(code);
  return [...found];
}

export function isRemote(location: string | undefined): boolean {
  return !!location && /\bremote\b|anywhere|work from home|\bwfh\b/i.test(location);
}
