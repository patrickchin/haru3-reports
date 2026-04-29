import { describe, it, expect } from "vitest";

import { openInMemoryDb } from "../local-db/better-sqlite-adapter";
import { runMigrations } from "../local-db/run-migrations";
import {
  bumpAttempt,
  deleteRow,
  enqueue,
  markInFlight,
  markPermanentlyFailed,
  pickReady,
  resetStaleInFlight,
  type OutboxRow,
} from "./outbox";

const TS = (n: number) =>
  `2026-04-27T00:00:${n.toString().padStart(2, "0")}Z`;

function makeIdGen(): () => string {
  let i = 0;
  return () => `op-${++i}`;
}

describe("enqueue", () => {
  it("inserts a fresh outbox row", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { title: "Hello" },
          baseVersion: TS(1),
          now: TS(2),
          newId: ids,
        }),
      );
      const rows = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.op).toBe("update");
      expect(JSON.parse(rows[0]!.payload_json)).toEqual({ title: "Hello" });
      expect(rows[0]?.client_op_id).toBe("op-1");
      expect(rows[0]?.attempts).toBe(0);
    } finally {
      handle.close();
    }
  });

  it("coalesces consecutive UPDATEs into a single row (latest wins)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { title: "First", status: "draft" },
          baseVersion: TS(1),
          now: TS(2),
          newId: ids,
        }),
      );
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { title: "Second" },
          baseVersion: TS(1),
          now: TS(3),
          newId: ids,
        }),
      );

      const rows = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.payload_json)).toEqual({
        title: "Second",
        status: "draft",
      });
    } finally {
      handle.close();
    }
  });

  it("INSERT followed by UPDATE keeps op=insert and merges fields", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "insert",
          payload: { title: "T" },
          baseVersion: null,
          now: TS(1),
          newId: ids,
        }),
      );
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { status: "final" },
          baseVersion: null,
          now: TS(2),
          newId: ids,
        }),
      );
      const rows = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.op).toBe("insert");
      expect(JSON.parse(rows[0]!.payload_json)).toEqual({
        title: "T",
        status: "final",
      });
    } finally {
      handle.close();
    }
  });

  it("DELETE supersedes queued non-attempted ops for the same entity", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "project",
          entityId: "p1",
          op: "update",
          payload: { name: "n" },
          baseVersion: TS(1),
          now: TS(1),
          newId: ids,
        }),
      );
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "project",
          entityId: "p1",
          op: "delete",
          payload: {},
          baseVersion: TS(1),
          now: TS(2),
          newId: ids,
        }),
      );
      const rows = await handle.db.all<OutboxRow>("SELECT * FROM outbox");
      expect(rows).toHaveLength(1);
      expect(rows[0]?.op).toBe("delete");
    } finally {
      handle.close();
    }
  });

  it("does not coalesce into an in-flight row (attempts > 0)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { title: "First" },
          baseVersion: TS(1),
          now: TS(1),
          newId: ids,
        }),
      );
      await handle.db.exec(
        "UPDATE outbox SET attempts = 1 WHERE entity_id = 'r1'",
      );
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { title: "Second" },
          baseVersion: TS(1),
          now: TS(2),
          newId: ids,
        }),
      );
      const rows = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox ORDER BY id",
      );
      expect(rows).toHaveLength(2);
      expect(JSON.parse(rows[0]!.payload_json)).toEqual({ title: "First" });
      expect(JSON.parse(rows[1]!.payload_json)).toEqual({ title: "Second" });
    } finally {
      handle.close();
    }
  });

  it("DELETE preserves an in-flight prior op (must wait for ack)", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "insert",
          payload: { title: "T" },
          baseVersion: null,
          now: TS(1),
          newId: ids,
        }),
      );
      await handle.db.exec(
        "UPDATE outbox SET attempts = 1 WHERE entity_id = 'r1'",
      );
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "delete",
          payload: {},
          baseVersion: TS(1),
          now: TS(2),
          newId: ids,
        }),
      );
      const rows = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox ORDER BY id",
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]?.op).toBe("insert");
      expect(rows[1]?.op).toBe("delete");
    } finally {
      handle.close();
    }
  });
});

describe("drain helpers", () => {
  it("pickReady returns rows whose next_attempt_at is due", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction(async (tx) => {
        await enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: {},
          baseVersion: null,
          now: TS(1),
          newId: ids,
        });
        await enqueue({
          tx,
          entity: "report",
          entityId: "r2",
          op: "update",
          payload: {},
          baseVersion: null,
          now: TS(10),
          newId: ids,
        });
      });
      const ready = await pickReady(handle.db, TS(5), 10);
      expect(ready.map((r) => r.entity_id)).toEqual(["r1"]);
    } finally {
      handle.close();
    }
  });

  it("bumpAttempt + deleteRow", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: {},
          baseVersion: null,
          now: TS(1),
          newId: ids,
        }),
      );
      const [row] = await pickReady(handle.db, TS(2), 10);
      expect(row).toBeDefined();
      await bumpAttempt(handle.db, row!.id, TS(5), "boom");
      const after = await handle.db.get<OutboxRow>(
        "SELECT * FROM outbox WHERE id = ?",
        [row!.id],
      );
      expect(after?.attempts).toBe(1);
      expect(after?.last_error).toBe("boom");
      expect(after?.next_attempt_at).toBe(TS(5));

      await deleteRow(handle.db, row!.id);
      const remaining = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox",
      );
      expect(remaining).toHaveLength(0);
    } finally {
      handle.close();
    }
  });
});

describe("in-flight state", () => {
  it("does not coalesce into an in-flight row even when attempts = 0", async () => {
    // Regression for the C1 race: previously a concurrent enqueue could
    // overwrite the payload of a row currently being pushed, then the
    // engine would delete it on RPC success and silently drop the new
    // local change. State='in_flight' must block coalescing.
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { title: "First" },
          baseVersion: null,
          now: TS(1),
          newId: ids,
        }),
      );
      const [row] = await pickReady(handle.db, TS(2), 10);
      await markInFlight(handle.db, row!.id);

      // Concurrent local mutation arrives.
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "update",
          payload: { title: "Second" },
          baseVersion: null,
          now: TS(3),
          newId: ids,
        }),
      );

      const rows = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox ORDER BY id",
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]?.state).toBe("in_flight");
      expect(JSON.parse(rows[0]!.payload_json)).toEqual({ title: "First" });
      expect(rows[1]?.state).toBe("queued");
      expect(JSON.parse(rows[1]!.payload_json)).toEqual({ title: "Second" });
      // Distinct client_op_ids so the server treats them as separate writes.
      expect(rows[0]!.client_op_id).not.toBe(rows[1]!.client_op_id);
    } finally {
      handle.close();
    }
  });

  it("DELETE arriving while a prior op is in_flight appends; does not wipe", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "insert",
          payload: { title: "T" },
          baseVersion: null,
          now: TS(1),
          newId: ids,
        }),
      );
      const [row] = await pickReady(handle.db, TS(2), 10);
      await markInFlight(handle.db, row!.id);

      await handle.db.transaction((tx) =>
        enqueue({
          tx,
          entity: "report",
          entityId: "r1",
          op: "delete",
          payload: {},
          baseVersion: null,
          now: TS(3),
          newId: ids,
        }),
      );

      const rows = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox ORDER BY id",
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]?.op).toBe("insert");
      expect(rows[0]?.state).toBe("in_flight");
      expect(rows[1]?.op).toBe("delete");
      expect(rows[1]?.state).toBe("queued");
    } finally {
      handle.close();
    }
  });

  it("pickReady ignores in_flight and permanent_failed rows", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction(async (tx) => {
        await enqueue({
          tx, entity: "report", entityId: "r1", op: "update",
          payload: {}, baseVersion: null, now: TS(1), newId: ids,
        });
        await enqueue({
          tx, entity: "report", entityId: "r2", op: "update",
          payload: {}, baseVersion: null, now: TS(1), newId: ids,
        });
        await enqueue({
          tx, entity: "report", entityId: "r3", op: "update",
          payload: {}, baseVersion: null, now: TS(1), newId: ids,
        });
      });
      const all = await handle.db.all<OutboxRow>(
        "SELECT * FROM outbox ORDER BY id",
      );
      await markInFlight(handle.db, all[0]!.id);
      await markPermanentlyFailed(handle.db, all[1]!.id, "burn");

      const ready = await pickReady(handle.db, TS(9), 10);
      expect(ready.map((r) => r.entity_id)).toEqual(["r3"]);
    } finally {
      handle.close();
    }
  });

  it("resetStaleInFlight requeues orphaned in_flight rows on startup", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx, entity: "report", entityId: "r1", op: "update",
          payload: {}, baseVersion: null, now: TS(1), newId: ids,
        }),
      );
      const [row] = await pickReady(handle.db, TS(2), 10);
      await markInFlight(handle.db, row!.id);

      const requeued = await resetStaleInFlight(handle.db);
      expect(requeued).toBe(1);

      const after = await handle.db.get<OutboxRow>(
        "SELECT * FROM outbox WHERE id = ?",
        [row!.id],
      );
      expect(after?.state).toBe("queued");
    } finally {
      handle.close();
    }
  });

  it("bumpAttempt resets state to queued so the row is picked next tick", async () => {
    const handle = openInMemoryDb();
    try {
      await runMigrations(handle.db);
      const ids = makeIdGen();
      await handle.db.transaction((tx) =>
        enqueue({
          tx, entity: "report", entityId: "r1", op: "update",
          payload: {}, baseVersion: null, now: TS(1), newId: ids,
        }),
      );
      const [row] = await pickReady(handle.db, TS(2), 10);
      await markInFlight(handle.db, row!.id);
      await bumpAttempt(handle.db, row!.id, TS(5), "transient");

      const after = await handle.db.get<OutboxRow>(
        "SELECT * FROM outbox WHERE id = ?",
        [row!.id],
      );
      expect(after?.state).toBe("queued");
      expect(after?.attempts).toBe(1);

      const ready = await pickReady(handle.db, TS(9), 10);
      expect(ready).toHaveLength(1);
    } finally {
      handle.close();
    }
  });
});
