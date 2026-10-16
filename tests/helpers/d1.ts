// A small D1-compatible wrapper around Node's built-in SQLite (node:sqlite), so the
// real Worker code and the real migration run in tests without Cloudflare's runtime.
// Only the parts of the D1 API the app uses are implemented.

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

type Bindable = string | number | bigint | null | boolean | undefined | Uint8Array;

function norm(v: Bindable): SQLInputValue {
  if (v === undefined) throw new Error('D1_TYPE_ERROR: undefined is not a valid bind value');
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v as SQLInputValue;
}

class Stmt {
  constructor(private db: DatabaseSync, readonly sql: string, private params: Bindable[] = []) {}
  bind(...p: Bindable[]) {
    return new Stmt(this.db, this.sql, p);
  }
  private returnsRows() {
    return /^\s*(select|with|pragma)/i.test(this.sql) || /\breturning\b/i.test(this.sql);
  }
  async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params.map(norm)) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : { ...row }) as T;
  }
  async all<T = Record<string, unknown>>() {
    if (!this.returnsRows()) {
      const r = this.db.prepare(this.sql).run(...this.params.map(norm));
      return { results: [] as T[], success: true, meta: { changes: Number(r.changes) } };
    }
    const rows = this.db.prepare(this.sql).all(...this.params.map(norm)) as T[];
    return { results: rows.map((r) => ({ ...(r as object) }) as T), success: true, meta: { changes: 0 } };
  }
  async run() {
    if (this.returnsRows() && /\breturning\b/i.test(this.sql)) {
      const rows = this.db.prepare(this.sql).all(...this.params.map(norm));
      return { results: rows, success: true, meta: { changes: rows.length } };
    }
    const r = this.db.prepare(this.sql).run(...this.params.map(norm));
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async raw() {
    return this.db.prepare(this.sql).all(...this.params.map(norm)).map((r) => Object.values(r as object));
  }
}

export class TestD1 {
  readonly db: DatabaseSync;
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts: Stmt[]) {
    // D1 batches run in one transaction.
    this.db.exec('BEGIN');
    try {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql: string) {
    this.db.exec(sql);
    return { count: 1, duration: 0 };
  }
  migrate(dir = join(process.cwd(), 'migrations')) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      this.db.exec(readFileSync(join(dir, f), 'utf8'));
    }
    return this;
  }
}
