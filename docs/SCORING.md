# Scoring methodology

**Rules version: `2026.10.1`** (see `src/shared/scoring/config.ts`)

The same rules are explained for users on the in-app Methodology page (`/methodology`). This document is the developer version.

## Principles

1. **Three outputs, never one.** Posting verification, employer indicators, and evidence confidence are computed and shown separately.
2. **Missing data lowers confidence only.** It never subtracts from the posting or employer scores.
3. **No invented evidence.** Rules read the evidence bundle. They never fetch, guess dates, or infer history.
4. **Conservative language.** Findings describe what was observed ("open for 165 days"), never what it means about intent ("ghost job", "scam", "fraudulent").
5. **Deterministic and versioned.** Same bundle → same report. Every stored report records `scoringVersion`.

## Pipeline

`buildReport(bundle)` in `engine.ts`:

1. `runRules(POSTING_RULES)` and `runRules(EMPLOYER_RULES)` → findings `{ ruleId, dimension, polarity, weight, title, detail, sources }`.
2. `postingVerdict`, `employerVerdict`, `confidence` → labels and headlines.
3. `suggestedQuestions` → up to 6 recruiter questions keyed off which rules fired.

Polarities: `positive`, `caution`, `warning`, `info` (weight 0), `missing` (weight 0, lowers confidence).

## Weights

All weights live in `WEIGHTS` and all thresholds in `THRESHOLDS` (`config.ts`). Scores start at 50 and are clamped to 0–100. The score is used for sorting and comparisons. Labels, not the number, are what users see first.

The full weight table is rendered on `/methodology` from the same values. If you change a weight, update that page's table too (`src/client/pages/content/Methodology.tsx`) and bump `SCORING_VERSION`.

## Label logic

### Posting
In order, first match wins:

1. One serious rule (`asks_sensitive_info`, `off_platform_chat`, `asks_for_payment`) **and** (another serious rule, or any other warning, or the listing isn't verified) → `significant_inconsistencies`.
2. `not_live` → `unable_to_verify` ("no longer published at this link").
3. Fetch failed/blocked/unsupported and less than 40 characters of text → `unable_to_verify`.
4. Exactly one serious rule on a verified listing → `some_caution`.
5. Not verified (no live ATS listing, no structured data on the employer's own domain): caution total ≤ −15 → `some_caution`, else `limited_evidence`.
6. Verified, with a warning or caution total ≤ −15 → `some_caution`.
7. Verified, score ≥ 70 → `strong_signals`.
8. Otherwise `some_caution`.

### Employer
1. No employer name → `insufficient_information`.
2. Two or more warnings, or a bankruptcy → `multiple_significant_warnings`.
3. One warning, or any caution → `some_warnings`.
4. An SEC match or financial data, with nothing negative → `no_significant_warnings`.
5. Otherwise `insufficient_information`.

### Confidence (points, max 100)
Official live listing 25 (structured page data 15) · SEC matched 20 (looked up, no filer 5) · posting date 10 · employer named 10 · 2+ observations 10 · WARN checked 10 · 150+ word description 10 · company records under ~13 months old 5. High ≥ 70, moderate ≥ 40, low otherwise.

## Text checks worth knowing about

- **Fraud notices**: sentences containing negation or warning words (`never`, `will not`, `scam`, `fraud`, `phishing`, …) are skipped by the scam-request patterns, and instead produce a `fraud_notice` info finding with any recruiter email domains the text names. Without this, real listings with anti-scam boilerplate get flagged (found and fixed during live testing against an Airbnb listing).
- **Pipeline language** is intentionally narrow. "The broadest talent pool" (diversity statements) and "we'll keep your resume for future opportunities" are common on real, active listings and don't count.
- **Pay transparency** states: CA, CO, WA, NY, IL, MN, MD, HI, VT, MA, NJ (−3 only, with exceptions mentioned).

## Name matching (`normalize.ts`)

- Normalization lowercases, strips accents, `&`→`and`, removes parentheticals, years, `dba …`, entity words anywhere after the first word (`inc`, `llc`, `corp`, `company`, …), and trailing suffixes, joiners, and month names.
- `exact` = equal normalized names (and the name is distinctive or multi-word).
- `probable` = the record name is the company name plus at most 3 more words (a site or division), and the company name is distinctive. Probable WARN matches get half weight and say so in the finding.
- SEC matching requires `exact` plus a ticker. "Probable" is never good enough to attach financial filings.

## Tests

`tests/scoring.test.ts` covers each label path and the edge cases: missing salary, transparency states, dead URL, manual entry, first observation, update-vs-publish dates, long-open listings, repost thresholds, scam text, fraud notices, inclusion language, WARN exact/probable/old, bankruptcy, revenue, SEC outage, determinism.

## Changelog

- `2026.10.1`: initial rules.
