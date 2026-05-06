/**
 * Tests for the sync-apply service. Uses a hand-rolled fake `Sql` that
 * captures `begin`, tagged-template `set_config` calls, and `unsafe`
 * RPC dispatches.
 */
import { describe, expect, it } from "vitest";
import {
  APPLIABLE_ENTITIES,
  applyMutation,
  isApplyEntity,
  withAuthClaims,
  type MutationPayload,
  type Sql,
} from "./sync-apply.js";

interface UnsafeCall {
  text: string;
  values: unknown[];
}

interface FakeSqlRecorder {
  sql: Sql;
  unsafeCalls: UnsafeCall[];
  txTaggedCalls: { text: string; values: unknown[] }[];
}

function makeFakeSql(rpcResult: unknown): FakeSqlRecorder {
  const unsafeCalls: UnsafeCall[] = [];
  const txTaggedCalls: { text: string; values: unknown[] }[] = [];

  const tx = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    txTaggedCalls.push({ text: strings.join("?"), values });
    return Promise.resolve([]);
  }) as unknown as Sql;
  // Attach `unsafe` to tx.
  (tx as unknown as { unsafe: (text: string, values: unknown[]) => Promise<unknown> }).unsafe = (
    text: string,
    values: unknown[],
  ) => {
    unsafeCalls.push({ text, values });
    return Promise.resolve([{ result: rpcResult }]);
  };

  const sql = ((_strings: TemplateStringsArray, ..._values: unknown[]) =>
    Promise.resolve([])) as unknown as Sql;
  (sql as unknown as {
    begin: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
  }).begin = async <T,>(fn: (tx: Sql) => Promise<T>): Promise<T> => fn(tx);

  return { sql, unsafeCalls, txTaggedCalls };
}

function makeFailingSql(error: unknown): Sql {
  const tx = ((_s: TemplateStringsArray, ..._v: unknown[]) =>
    Promise.resolve([])) as unknown as Sql;
  (tx as unknown as { unsafe: (text: string, values: unknown[]) => Promise<unknown> }).unsafe = () =>
    Promise.reject(error);

  const sql = ((_s: TemplateStringsArray, ..._v: unknown[]) =>
    Promise.resolve([])) as unknown as Sql;
  (sql as unknown as {
    begin: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
  }).begin = async <T,>(fn: (tx: Sql) => Promise<T>): Promise<T> => fn(tx);
  return sql;
}

const USER = "00000000-0000-0000-0000-0000000000aa";

const validPayload: MutationPayload = {
  client_op_id: "11111111-1111-1111-1111-111111111111",
  op: "insert",
  id: "22222222-2222-2222-2222-222222222222",
  base_version: null,
  fields: { name: "Site A" },
};

describe("isApplyEntity", () => {
  it("accepts every APPLIABLE_ENTITIES entry", () => {
    for (const e of APPLIABLE_ENTITIES) expect(isApplyEntity(e)).toBe(true);
  });
  it("rejects unknown entities", () => {
    expect(isApplyEntity("projects")).toBe(false);
    expect(isApplyEntity("user")).toBe(false);
    expect(isApplyEntity("")).toBe(false);
  });
});

describe("withAuthClaims", () => {
  it("sets request.jwt.claims, sub, and role inside the transaction", async () => {
    const { sql, txTaggedCalls } = makeFakeSql(null);
    await withAuthClaims(sql, USER, async () => "ok");
    // Three set_config calls.
    expect(txTaggedCalls).toHaveLength(3);
    expect(txTaggedCalls[0]!.text).toMatch(/request\.jwt\.claims/);
    const claims = txTaggedCalls[0]!.values[0] as string;
    expect(JSON.parse(claims)).toEqual({ sub: USER, role: "authenticated" });
    expect(txTaggedCalls[1]!.text).toMatch(/request\.jwt\.claim\.sub/);
    expect(txTaggedCalls[1]!.values).toContain(USER);
    expect(txTaggedCalls[2]!.text).toMatch(/role/);
  });
});

describe("applyMutation", () => {
  for (const entity of APPLIABLE_ENTITIES) {
    it(`dispatches to apply_${entity}_mutation for entity=${entity}`, async () => {
      const { sql, unsafeCalls } = makeFakeSql({
        status: "applied",
        server_version: "2024-06-01T00:00:00Z",
        row: { id: validPayload.id },
      });
      const out = await applyMutation({
        sql,
        userId: USER,
        entity,
        payload: validPayload,
      });
      expect(out.status).toBe("applied");
      expect(unsafeCalls).toHaveLength(1);
      expect(unsafeCalls[0]!.text).toContain(`apply_${entity}_mutation`);
      // Payload is passed as an object (postgres.js serialises to jsonb).
      // Stringifying it would bind a text scalar; `$1::jsonb` would then
      // parse that as a JSON string and `->>'op'` would return NULL.
      const arg = unsafeCalls[0]!.values[0];
      expect(arg).toEqual(validPayload);
    });
  }

  it("returns the parsed RPC result verbatim (conflict)", async () => {
    const conflict = {
      status: "conflict",
      server_version: "2024-06-02T00:00:00Z",
      row: { id: validPayload.id, name: "server-wins" },
    };
    const { sql } = makeFakeSql(conflict);
    const out = await applyMutation({
      sql,
      userId: USER,
      entity: "project",
      payload: { ...validPayload, op: "update", base_version: "2024-06-01T00:00:00Z" },
    });
    expect(out).toEqual(conflict);
  });

  it("maps Postgres 42501 → HTTP 401", async () => {
    const sql = makeFailingSql({ code: "42501", message: "auth required" });
    await expect(
      applyMutation({ sql, userId: USER, entity: "project", payload: validPayload }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("maps Postgres 22023 (unknown op) → HTTP 422", async () => {
    const sql = makeFailingSql({ code: "22023", message: "unknown op bogus" });
    await expect(
      applyMutation({ sql, userId: USER, entity: "project", payload: validPayload }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("propagates other Postgres errors", async () => {
    const sql = makeFailingSql({ code: "23505", message: "unique violation" });
    await expect(
      applyMutation({ sql, userId: USER, entity: "project", payload: validPayload }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
