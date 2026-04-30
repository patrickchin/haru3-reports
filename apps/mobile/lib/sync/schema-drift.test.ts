/**
 * Schema drift guard.
 *
 * The mobile pull engine assumes the columns each `PullableTable`
 * declares actually exist on the server (the `pull_<table>_since` RPCs
 * return `SETOF public.<table>`, i.e. all server columns).
 *
 * Local SQLite migrations cannot be the same SQL as Postgres
 * (different dialects, RLS, jsonb, etc.) so the schemas are maintained
 * separately. This test re-derives the **authoritative server column
 * set** by parsing `supabase/migrations/*.sql` and asserts that every
 * column referenced by a `PullableTable` (either `columns` for tables
 * with no `toLocalRow`, or the explicit `serverColumns` for tables
 * with one) exists on the server.
 *
 * This is the cheap, dialect-aware alternative to sharing DDL between
 * server and device. It catches the realistic drift cases:
 *   - server column renamed without updating the descriptor
 *   - server column removed without updating the descriptor
 *   - new server column added that the client wants to read but the
 *     descriptor was never updated (caught when the column is added
 *     to `columns`/`serverColumns`)
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PROJECTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  REPORTS_PULLABLE,
  FILE_METADATA_PULLABLE,
  REPORT_NOTES_PULLABLE,
  type PullableTable,
} from "./pull-engine";

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "supabase",
  "migrations",
);

type ColumnSet = Set<string>;

/**
 * Parse server `CREATE TABLE` / `ALTER TABLE … ADD COLUMN` /
 * `RENAME COLUMN` / `DROP COLUMN` statements from migration files in
 * filename order and accumulate the final column set per table.
 *
 * Deliberately simple: the migrations in this repo are
 * lower-case, `public.<table>` qualified, and one-statement-per-line
 * for column-level DDL. We don't aim to be a full SQL parser.
 */
function buildServerSchema(): Map<string, ColumnSet> {
  const tables = new Map<string, ColumnSet>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = stripComments(
      readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
    );
    applyCreateTables(sql, tables);
    applyAddColumns(sql, tables);
    applyRenameColumns(sql, tables);
    applyDropColumns(sql, tables);
  }

  return tables;
}

function stripComments(sql: string): string {
  // Drop -- line comments; we don't strip /* */ because no migration
  // in this repo uses them inside DDL we care about.
  return sql.replace(/--[^\n]*$/gm, "");
}

/**
 * Match `CREATE TABLE [IF NOT EXISTS] [public.]<name> ( ... );` and
 * extract column names from the parenthesised body. Constraints
 * (PRIMARY KEY, UNIQUE, CHECK, FOREIGN KEY, CONSTRAINT) are skipped.
 */
function applyCreateTables(sql: string, tables: Map<string, ColumnSet>): void {
  const re =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\)\s*;/gi;
  for (const m of sql.matchAll(re)) {
    const name = m[1].toLowerCase();
    const body = m[2];
    const cols = parseColumnDefs(body);
    if (cols.size === 0) continue;
    const existing = tables.get(name) ?? new Set<string>();
    for (const c of cols) existing.add(c);
    tables.set(name, existing);
  }
}

function parseColumnDefs(body: string): ColumnSet {
  const cols: ColumnSet = new Set();
  // Split on commas at paren-depth 0.
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));

  const constraintLeads = new Set([
    "primary",
    "unique",
    "check",
    "foreign",
    "constraint",
    "exclude",
    "like",
  ]);

  for (const raw of parts) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const firstWord = trimmed.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
    if (constraintLeads.has(firstWord)) continue;
    // Column name is the first identifier (may be quoted).
    const m = trimmed.match(/^(?:"([^"]+)"|(\w+))/);
    const name = (m?.[1] ?? m?.[2])?.toLowerCase();
    if (name) cols.add(name);
  }
  return cols;
}

function applyAddColumns(sql: string, tables: Map<string, ColumnSet>): void {
  const re =
    /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;
  for (const m of sql.matchAll(re)) {
    const name = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    const set = tables.get(name) ?? new Set<string>();
    set.add(col);
    tables.set(name, set);
  }
}

function applyRenameColumns(sql: string, tables: Map<string, ColumnSet>): void {
  const re =
    /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)\s+rename\s+column\s+(\w+)\s+to\s+(\w+)/gi;
  for (const m of sql.matchAll(re)) {
    const name = m[1].toLowerCase();
    const oldCol = m[2].toLowerCase();
    const newCol = m[3].toLowerCase();
    const set = tables.get(name);
    if (!set) continue;
    set.delete(oldCol);
    set.add(newCol);
  }
}

function applyDropColumns(sql: string, tables: Map<string, ColumnSet>): void {
  const re =
    /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?(\w+)\s+drop\s+column\s+(?:if\s+exists\s+)?(\w+)/gi;
  for (const m of sql.matchAll(re)) {
    const name = m[1].toLowerCase();
    const col = m[2].toLowerCase();
    tables.get(name)?.delete(col);
  }
}

function expectedServerColumns(t: PullableTable): readonly string[] {
  return t.serverColumns ?? t.columns;
}

const DESCRIPTORS: readonly PullableTable[] = [
  PROJECTS_PULLABLE,
  PROJECT_MEMBERS_PULLABLE,
  REPORTS_PULLABLE,
  FILE_METADATA_PULLABLE,
  REPORT_NOTES_PULLABLE,
];

describe("schema-drift: PullableTable.serverColumns ⊆ supabase migrations", () => {
  const schema = buildServerSchema();

  it("parses at least the tables we sync", () => {
    // Sanity: ensures the parser actually picked up something. If this
    // fails, the regexes above are wrong, not the descriptors.
    for (const t of DESCRIPTORS) {
      expect(
        schema.get(t.name),
        `parser did not find table ${t.name} in supabase/migrations`,
      ).toBeDefined();
    }
  });

  for (const t of DESCRIPTORS) {
    it(`${t.name}: every declared server column exists on server`, () => {
      const serverCols = schema.get(t.name);
      expect(serverCols, `table ${t.name} not found`).toBeDefined();
      const missing = expectedServerColumns(t).filter(
        (c) => !serverCols!.has(c),
      );
      expect(
        missing,
        `descriptor for ${t.name} references columns not on the server: ${missing.join(", ")}.\n` +
          `  Server has: ${[...serverCols!].sort().join(", ")}`,
      ).toEqual([]);
    });
  }

  it("every pullable table exposes updated_at on the server (cursor column)", () => {
    // updated_at is required for every pullable table — the pull
    // engine advances its cursor by `MAX(updated_at)`. deleted_at is
    // optional and only required for tables that support soft delete
    // (which is per-table, not universal: project_members hard-deletes).
    for (const t of DESCRIPTORS) {
      const cols = schema.get(t.name)!;
      expect(cols.has("updated_at"), `${t.name} missing updated_at`).toBe(true);
      expect(
        expectedServerColumns(t).includes("updated_at"),
        `${t.name} descriptor must include updated_at`,
      ).toBe(true);
      // If the descriptor declares deleted_at, the server must too.
      if (expectedServerColumns(t).includes("deleted_at")) {
        expect(
          cols.has("deleted_at"),
          `${t.name} descriptor declares deleted_at but server table has no such column`,
        ).toBe(true);
      }
    }
  });
});
