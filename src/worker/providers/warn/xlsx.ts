// A deliberately small .xlsx reader. States publish WARN data as Excel files, and a full
// spreadsheet library is too heavy for a Worker. An .xlsx is a zip of XML, so we unzip
// with fflate and read just the cells. Formulas, styles, and merged cells are ignored.

import { strFromU8, unzipSync } from 'fflate';
import { decodeEntities } from '../../lib/html';

export type Cell = string | number | null;

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function textOf(xml: string): string {
  // Join every <t> inside (rich text runs split strings into several).
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeEntities(out);
}

function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function listSheets(bytes: Uint8Array): string[] {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'xl/workbook.xml' });
  const wb = strFromU8(files['xl/workbook.xml']!);
  return [...wb.matchAll(/<sheet\s[^>]*>/g)].map((m) => decodeEntities(attr(m[0], 'name') ?? ''));
}

/** Read one sheet (matched by name, case-insensitive, trimmed) into rows of cells. */
export function readSheet(bytes: Uint8Array, sheetName: (name: string) => boolean): Cell[][] {
  const files = unzipSync(bytes, {
    filter: (f) => f.name === 'xl/workbook.xml' || f.name === 'xl/_rels/workbook.xml.rels' || f.name === 'xl/sharedStrings.xml' || f.name.startsWith('xl/worksheets/sheet'),
  });
  const wb = strFromU8(files['xl/workbook.xml']!);
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels']!);
  const sheetTag = [...wb.matchAll(/<sheet\s[^>]*>/g)].map((m) => m[0]).find((t) => sheetName(decodeEntities(attr(t, 'name') ?? '').trim()));
  if (!sheetTag) throw new Error('sheet not found');
  const rid = attr(sheetTag, 'r:id');
  const relTag = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === rid);
  const target = relTag ? attr(relTag, 'Target') : undefined;
  if (!target) throw new Error('sheet relationship not found');
  const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheetXml = files[path];
  if (!sheetXml) throw new Error(`sheet file missing: ${path}`);

  const shared: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    const ss = strFromU8(files['xl/sharedStrings.xml']);
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]!));
  }

  const rows: Cell[][] = [];
  const xml = strFromU8(sheetXml);
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Cell[] = [];
    for (const cm of rm[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const inner = cm[2] ?? '';
      const ref = attr(attrs, 'r') ?? '';
      const t = attr(attrs, 't');
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value: Cell = null;
      if (t === 's' && v !== undefined) value = shared[Number(v)] ?? null;
      else if (t === 'inlineStr') value = textOf(inner);
      else if (t === 'str' || t === 'e') value = v !== undefined ? decodeEntities(v) : null;
      else if (t === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) value = Number(v);
      row[ref ? colIndex(ref) : row.length] = value;
    }
    rows.push(Array.from(row, (c) => (c === undefined ? null : c)));
  }
  return rows;
}

/** Excel stores dates as days since 1899-12-30. Returns YYYY-MM-DD, or undefined. */
export function excelDate(v: Cell): string | undefined {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      return `${y}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
    }
    const t = Date.parse(v);
    if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return undefined;
}

/** Find the header row (first row containing all the given words) and map rows to objects keyed by header. */
export function tableFrom(rows: Cell[][], mustContain: string[]): Array<Record<string, Cell>> {
  const norm = (c: Cell) => String(c ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const hi = rows.findIndex((r) => mustContain.every((w) => r.some((c) => norm(c).includes(w))));
  if (hi < 0) throw new Error('header row not found');
  const headers = rows[hi]!.map(norm);
  return rows.slice(hi + 1)
    .filter((r) => r.some((c) => c !== null && c !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? null])));
}
