/**
 * Unit tests for sync-pull service.
 *
 * Uses a fake `Sql` that records the tagged-template invocation so we
 * can assert: the right table is queried, the user's ID and cursor are
 * threaded through, and the limit is clamped to [1, 1000].
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  PULLABLE_TABLES,
  clampLimit,
  isPullableTable,
  pull,
  type PullableTable,
  type Sql,
} from "./sync-pull.js";

interface CapturedCall {
  /** Concatenated template strings, joined by `?` placeholders for params. */
  text: string;
  values: unknown[];
}

function makeFakeSql(rows: unknown[]): { sql: Sql; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ text: strings.join("?"), values });
    return Promise.resolve(rows);
  }) as unknown as Sql;
  return { sql, calls };
}

const USER = "user-123";

describe("clampLimit", () => {
  it("uses default when undefined", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
  });
  it("clamps below MIN", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-50)).toBe(1);
  });
  it("clamps above MAX", () => {
    expect(clampLimit(5000)).toBe(MAX_LIMIT);
  });
  it("truncates floats", () => {
    expect(clampLimit(42.9)).toBe(42);
  });
  it("falls back to default for NaN/Infinity", () => {
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(DEFAULT_LIMIT);
  });
});

describe("isPullableTable", () => {
  it("accepts every PULLABLE_TABLES entry", () => {
    for (const t of PULLABLE_TABLES) expect(isPullableTable(t)).toBe(true);
  });
  it("rejects unknown tables", () => {
    expect(isPullableTable("users")).toBe(false);
    expect(isPullableTable("")).toBe(false);
    expect(isPullableTable("PROJECTS")).toBe(false);
  });
});

describe("pull", () => {
  for (const table of PULLABLE_TABLES) {
    describe(`table=${table}`, () => {
      it("threads userId, null cursor, and clamped limit", async () => {
        const { sql, calls } = makeFakeSql([{ id: "row-1" }]);
        const out = await pull(table, {
          sql,
          userId: USER,
          cursor: null,
          limit: 9999, // → clamped to MAX_LIMIT
        });
        expect(out).toEqual([{ id: "row-1" }]);
        expect(calls).toHaveLength(1);
        const [call] = calls;
        // The query must reference the right table.
        expect(call!.text).toMatch(new RegExp(`public\\.${table}`));
        // userId is one of the bound values (sometimes used multiple times).
        expect(call!.values).toContain(USER);
        // Cursor null is bound.
        expect(call!.values).toContain(null);
        // Clamped limit is bound.
        expect(call!.values).toContain(MAX_LIMIT);
        // Order + tombstone semantics.
        expect(call!.text).toMatch(/ORDER BY .*updated_at ASC/);
        expect(call!.text).not.toMatch(/deleted_at IS NULL/);
      });

      it("threads cursor when provided", async () => {
        const { sql, calls } = makeFakeSql([]);
        const cursor = new Date("2024-06-01T12:34:56.000Z");
        await pull(table, { sql, userId: USER, cursor, limit: 50 });
        expect(calls[0]!.values).toContain(cursor);
        expect(calls[0]!.values).toContain(50);
      });
    });
  }

  it("authz: projects requires owner OR membership", async () => {
    const { sql, calls } = makeFakeSql([]);
    await pull("projects", { sql, userId: USER, cursor: null, limit: 10 });
    expect(calls[0]!.text).toMatch(/owner_id =/);
    expect(calls[0]!.text).toMatch(/project_members/);
  });

  it("authz: file_metadata joins via owner OR membership", async () => {
    const { sql, calls } = makeFakeSql([]);
    await pull("file_metadata", { sql, userId: USER, cursor: null, limit: 10 });
    expect(calls[0]!.text).toMatch(/JOIN public\.projects/);
    expect(calls[0]!.text).toMatch(/p\.owner_id =/);
    expect(calls[0]!.text).toMatch(/project_members/);
  });

  it("exhaustive switch covers every PULLABLE_TABLES entry", () => {
    // If a new table is added, this test will surface that the switch
    // statement has been missed via TS compile error first; this is a
    // lightweight runtime guard.
    expect(PULLABLE_TABLES.length).toBe(5);
    const seen = new Set<PullableTable>(PULLABLE_TABLES);
    expect(seen.size).toBe(PULLABLE_TABLES.length);
  });
});
